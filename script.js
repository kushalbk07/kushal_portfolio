/* ============================================================
   PocketNepal | script.js
   Plain JavaScript, no framework. Data is saved in localStorage.

   Sections
    1. Constants and small helpers
    2. Storage (localStorage, with safe fallbacks)
    3. Dialogs, toasts and form helpers
    4. Bill splitter: the maths
    5. Bill splitter: the screen
    6. Expenses: add, edit, delete, search, filter, sort
    7. Dashboard: totals, budget and insights
    8. Analytics: charts (Chart.js)
    9. Settings: theme, budget, CSV export, sample data
   10. Navigation and start-up
   ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
     1. CONSTANTS AND SMALL HELPERS
     ========================================================== */

  const CATEGORIES = [
    { key: 'food',          label: 'Food',          icon: '🍔', color: '#f97316' },
    { key: 'transport',     label: 'Transport',     icon: '🚌', color: '#3b82f6' },
    { key: 'shopping',      label: 'Shopping',      icon: '🛍️', color: '#ec4899' },
    { key: 'bills',         label: 'Bills',         icon: '🏠', color: '#14b8a6' },
    { key: 'entertainment', label: 'Entertainment', icon: '🎮', color: '#a855f7' },
    { key: 'education',     label: 'Education',     icon: '📚', color: '#eab308' },
    { key: 'health',        label: 'Health',        icon: '💊', color: '#ef4444' },
    { key: 'work',          label: 'Work',          icon: '💼', color: '#64748b' },
    { key: 'subscriptions', label: 'Subscriptions', icon: '📱', color: '#6366f1' },
    { key: 'other',         label: 'Other',         icon: '💰', color: '#94a3b8' }
  ];
  const CAT = {};
  CATEGORIES.forEach((c) => { CAT[c.key] = c; });

  const KEYS = {
    expenses: 'pocketnepal.expenses',
    budget: 'pocketnepal.budget',
    bills: 'pocketnepal.bills',
    prefs: 'pocketnepal.prefs'
  };

  const MAX_AMOUNT = 99999999;   // largest amount we accept (Rs.)
  const MIN_PEOPLE = 2;
  const MAX_PEOPLE = 20;
  const PAGE_SIZE = 40;          // expenses shown before "Show more"
  const MAX_BILLS = 100;         // saved bills kept in history

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const sumOf = (arr) => arr.reduce((a, b) => a + b, 0);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /** Escape text before putting it into HTML, so names can never inject markup. */
  function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ----- Money -----
  // Nepali Rupees, grouped the Nepali way (1,25,000). Whole numbers show no decimals.
  const fmtWhole = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtCents = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function money(value) {
    const n = Math.round((Number(value) || 0) * 100) / 100;
    const abs = Math.abs(n);
    const isWhole = Math.abs(abs - Math.round(abs)) < 0.005;
    return (n < 0 ? '-' : '') + 'Rs. ' + (isWhole ? fmtWhole.format(Math.round(abs)) : fmtCents.format(abs));
  }

  // Splitting maths is done in paisa (whole numbers) so totals always add up exactly.
  const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);
  const fromPaise = (paise) => paise / 100;

  // ----- Dates (all local time, written as YYYY-MM-DD) -----
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayStr = () => ymd(new Date());

  function parseYMD(s) {
    const parts = s.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  function isValidYMD(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(parseYMD(s)) === s;
  }
  const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

  const fmtDate = (s) => dateFormatter.format(parseYMD(s));
  const monthKey = (s) => s.slice(0, 7);                         // "2026-10"
  const monthLabel = (key) => monthFormatter.format(parseYMD(key + '-01'));
  function shiftMonth(key, delta) {
    const parts = key.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function addDays(s, delta) {
    const d = parseYMD(s);
    d.setDate(d.getDate() + delta);
    return ymd(d);
  }

  /* ==========================================================
     2. STORAGE
     ========================================================== */

  // If the browser blocks localStorage (private mode, strict settings) we still work,
  // but only until the page is closed. We tell the user once.
  const memory = {};
  let storageWarned = false;

  function readStore(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch (e) { /* unreadable or blocked: use memory below */ }
    return key in memory ? memory[key] : fallback;
  }

  function writeStore(key, value) {
    memory[key] = value;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      if (!storageWarned) {
        storageWarned = true;
        toast('Your browser is blocking storage, so data will be lost when you close this tab.', { tone: 'warn', duration: 7000 });
      }
    }
  }

  function removeStore(key) {
    delete memory[key];
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  // Never trust stored data blindly: drop anything that is not shaped like an expense.
  function cleanExpenses(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((e) => e && typeof e === 'object'
        && Number.isFinite(Number(e.amount)) && Number(e.amount) > 0
        && typeof e.description === 'string' && e.description.trim() !== ''
        && isValidYMD(e.date))
      .map((e) => ({
        id: String(e.id || uid()),
        amount: Math.round(Number(e.amount) * 100) / 100,
        category: CAT[e.category] ? e.category : 'other',
        description: e.description.trim().slice(0, 80),
        date: e.date,
        sample: e.sample === true
      }));
  }

  function cleanBills(list) {
    if (!Array.isArray(list)) return [];
    return list.filter((b) => b && typeof b === 'object' && Number.isFinite(Number(b.finalTotal))
      && Array.isArray(b.people) && typeof b.savedAt === 'string');
  }

  const state = {
    expenses: [],
    budget: 0,
    bills: [],
    theme: 'light',
    filters: { q: '', cat: 'all', from: '', to: '', sort: 'date-desc' },
    shown: PAGE_SIZE,
    lastCategory: 'food',
    lastAddedId: null,
    analytics: { month: '', a: '', b: '' }
  };

  function loadAll() {
    state.expenses = cleanExpenses(readStore(KEYS.expenses, []));
    const budget = Number(readStore(KEYS.budget, 0));
    state.budget = Number.isFinite(budget) && budget > 0 ? budget : 0;
    state.bills = cleanBills(readStore(KEYS.bills, []));
    state.theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  const saveExpenses = () => writeStore(KEYS.expenses, state.expenses);
  const saveBills = () => writeStore(KEYS.bills, state.bills);
  function saveBudget() {
    if (state.budget > 0) writeStore(KEYS.budget, state.budget); else removeStore(KEYS.budget);
  }
  const savePrefs = () => writeStore(KEYS.prefs, { theme: state.theme });

  /* ==========================================================
     3. DIALOGS, TOASTS AND FORM HELPERS
     ========================================================== */

  /** Small message at the bottom of the screen. Can carry one action button (e.g. Undo). */
  function toast(message, opts) {
    opts = opts || {};
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (opts.tone ? ' ' + opts.tone : '');
    const text = document.createElement('span');
    text.textContent = message;
    el.appendChild(text);

    let timer = 0;
    const dismiss = () => {
      clearTimeout(timer);
      el.classList.add('out');
      setTimeout(() => el.remove(), reduceMotion ? 0 : 220);
    };
    if (opts.action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = opts.action;
      btn.addEventListener('click', () => { if (opts.onAction) opts.onAction(); dismiss(); });
      el.appendChild(btn);
    }
    timer = setTimeout(dismiss, opts.duration || 3500);
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
  }

  // Remember which element opened a dialog, so focus goes back there when it closes.
  const openers = new WeakMap();
  function openDialog(dlg) {
    openers.set(dlg, document.activeElement);
    if (!dlg.open) dlg.showModal();
  }
  $$('dialog').forEach((dlg) => {
    dlg.addEventListener('close', () => {
      const opener = openers.get(dlg);
      if (opener && document.contains(opener) && typeof opener.focus === 'function') opener.focus();
    });
  });

  document.addEventListener('click', (e) => {
    const target = e.target;
    // Buttons marked data-close shut the dialog they live in.
    const closer = target.closest && target.closest('[data-close]');
    if (closer) { const dlg = closer.closest('dialog'); if (dlg) dlg.close(); return; }
    // A click on the dark backdrop (outside the dialog box) also closes it.
    if (target instanceof HTMLDialogElement && target.open) {
      const r = target.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) target.close();
    }
  });

  /** Ask "are you sure?" and wait for the answer. Resolves to true or false. */
  function confirmAction(opts) {
    return new Promise((resolve) => {
      const dlg = $('#confirmDialog');
      const ok = $('#confirmOk');
      const cancel = $('#confirmCancel');
      $('#confirmTitle').textContent = opts.title;
      $('#confirmText').textContent = opts.message;
      ok.textContent = opts.confirmText || 'Delete';
      let answer = false;
      const finish = () => {
        dlg.removeEventListener('close', finish);
        ok.onclick = null;
        cancel.onclick = null;
        resolve(answer);
      };
      ok.onclick = () => { answer = true; dlg.close(); };
      cancel.onclick = () => dlg.close();
      dlg.addEventListener('close', finish);
      openDialog(dlg);
      cancel.focus();
    });
  }

  function setFieldError(input, message) {
    const err = $('#' + input.getAttribute('aria-describedby'));
    if (err) err.textContent = message || '';
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  // Number boxes: block the characters that make negative or scientific numbers.
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('input[type="number"]') && ['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
  });

  /** Read a number box. Returns NaN when the text is not a real number. */
  function numberFrom(value) {
    if (value === '' || value == null) return NaN;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  /** Animate a number counting up, for the headline stats. */
  function countTo(el, target, asMoney) {
    const from = el._shown || 0;
    el._shown = target;
    const write = (v) => { el.textContent = asMoney ? money(v) : fmtWhole.format(Math.round(v)); };
    if (reduceMotion || from === target) { write(target); return; }
    const start = performance.now();
    const duration = 600;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      write(from + (target - from) * eased);
      if (t < 1 && el._shown === target) requestAnimationFrame(tick); else if (t >= 1) write(target);
    };
    requestAnimationFrame(tick);
  }

  /* ==========================================================
     4. BILL SPLITTER: THE MATHS
     Everything here works in paisa (whole numbers), so shares
     always add up to the exact total with no rounding drift.
     ========================================================== */

  /**
   * Hand out `totalP` paisa in proportion to `weights`.
   * The pieces always add up to exactly totalP (largest-remainder method).
   */
  function allocate(totalP, weights) {
    const n = weights.length;
    const weightSum = sumOf(weights);
    const raw = weightSum > 0
      ? weights.map((w) => totalP * w / weightSum)
      : weights.map(() => totalP / n);
    const parts = raw.map(Math.floor);
    const left = totalP - sumOf(parts);
    const order = raw.map((r, i) => ({ i, frac: r - parts[i] })).sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < left; k++) parts[order[k % n].i] += 1;
    return parts;
  }

  /**
   * Split people into the largest possible number of groups that settle among
   * themselves (each group's balances add up to zero). Fewer groups to settle
   * across means fewer payments overall. Exact search, fine for up to 16 people.
   */
  function zeroSumGroups(items) {
    const n = items.length;
    const size = 1 << n;
    const subtotal = new Array(size).fill(0);
    const best = new Int16Array(size);
    const pick = new Int8Array(size);

    for (let mask = 1; mask < size; mask++) {
      const low = mask & -mask;
      subtotal[mask] = subtotal[mask ^ low] + items[31 - Math.clz32(low)].v;
      let top = -1;
      let topIndex = 0;
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          const value = best[mask ^ (1 << i)];
          if (value > top) { top = value; topIndex = i; }
        }
      }
      best[mask] = top + (subtotal[mask] === 0 ? 1 : 0);
      pick[mask] = topIndex;
    }

    // Walk back through the choices, then cut the order wherever the running total hits zero.
    const order = [];
    let mask = size - 1;
    while (mask) { order.push(pick[mask]); mask ^= 1 << pick[mask]; }
    order.reverse();

    const groups = [];
    let current = [];
    let running = 0;
    order.forEach((i) => {
      current.push(items[i]);
      running += items[i].v;
      if (running === 0) { groups.push(current); current = []; }
    });
    if (current.length) groups.push(current);
    return groups;
  }

  /** Inside one group: the person who owes the most pays the person owed the most. */
  function settleGroup(group) {
    const payers = group.filter((x) => x.v < 0).map((x) => ({ i: x.i, amt: -x.v })).sort((a, b) => b.amt - a.amt);
    const receivers = group.filter((x) => x.v > 0).map((x) => ({ i: x.i, amt: x.v })).sort((a, b) => b.amt - a.amt);
    const out = [];
    let p = 0;
    let r = 0;
    while (p < payers.length && r < receivers.length) {
      const pay = Math.min(payers[p].amt, receivers[r].amt);
      out.push({ from: payers[p].i, to: receivers[r].i, amountP: pay });
      payers[p].amt -= pay;
      receivers[r].amt -= pay;
      if (payers[p].amt === 0) p++;
      if (receivers[r].amt === 0) r++;
    }
    return out;
  }

  /**
   * nets[i] = what person i paid minus their fair share (in paisa, adds up to 0).
   * Positive = is owed money. Negative = owes money.
   * Returns a short list of { from, to, amountP } payments that settles everyone.
   */
  function minimizeTransfers(nets) {
    const items = [];
    nets.forEach((v, i) => { if (v !== 0) items.push({ i, v }); });
    if (!items.length) return [];
    const groups = items.length <= 16 ? zeroSumGroups(items) : [items];
    const out = [];
    groups.forEach((g) => settleGroup(g).forEach((t) => out.push(t)));
    return out.sort((a, b) => a.from - b.from || a.to - b.to);
  }

  /** Names for the results: blank becomes "Person 3", repeated names get (1), (2). */
  function displayNames(people) {
    const base = people.map((p, i) => (p.name || '').trim() || 'Person ' + (i + 1));
    const totals = {};
    const seen = {};
    base.forEach((n) => { const k = n.toLowerCase(); totals[k] = (totals[k] || 0) + 1; });
    return base.map((n) => {
      const k = n.toLowerCase();
      if (totals[k] < 2) return n;
      seen[k] = (seen[k] || 0) + 1;
      return n + ' (' + seen[k] + ')';
    });
  }

  /**
   * The whole calculation. Input is the form as typed (strings).
   * Returns { status: 'empty' | 'error' | 'mismatch' | 'ok', ... }.
   */
  function computeSplit(inp) {
    const total = numberFrom(inp.total);
    if (!(total > 0)) return { status: 'empty' };
    if (total > MAX_AMOUNT) return { status: 'error', message: 'That bill amount is too large.' };

    const tipPct = inp.tip === '' ? 0 : numberFrom(inp.tip);
    if (!(tipPct >= 0 && tipPct <= 100)) return { status: 'error', message: 'Tip must be between 0% and 100%.' };

    const subtotalP = toPaise(total);
    const tipP = Math.round(subtotalP * tipPct / 100);
    const finalP = subtotalP + tipP;
    const names = displayNames(inp.people);
    const n = inp.people.length;
    const useCustom = inp.mode === 'custom' || (inp.mode === 'settle' && inp.settleShares === 'custom');

    let sharesP = null;
    let tipsP = null;
    let totalsP;

    if (useCustom) {
      const typed = inp.people.map((p) => (p.share === '' ? 0 : numberFrom(p.share)));
      if (typed.some((v) => !(v >= 0))) return { status: 'error', message: 'Each custom amount must be zero or more.' };
      sharesP = typed.map(toPaise);
      const enteredP = sumOf(sharesP);
      if (enteredP !== subtotalP) {
        return { status: 'mismatch', enteredP, subtotalP, diffP: subtotalP - enteredP };
      }
      tipsP = allocate(tipP, sharesP);                    // tip is shared in proportion
      totalsP = sharesP.map((s, i) => s + tipsP[i]);
    } else {
      totalsP = allocate(finalP, inp.people.map(() => 1));
    }

    const people = inp.people.map((p, i) => ({
      name: names[i],
      totalP: totalsP[i],
      shareP: sharesP ? sharesP[i] : null,
      tipP: tipsP ? tipsP[i] : null,
      paidP: null,
      netP: null
    }));

    let settlements = null;
    let settleError = '';

    if (inp.mode === 'settle') {
      const typedPaid = inp.people.map((p) => (p.paid === '' ? 0 : numberFrom(p.paid)));
      if (typedPaid.some((v) => !(v >= 0))) {
        settleError = 'Each “Paid” amount must be zero or more.';
      } else {
        const paidP = typedPaid.map(toPaise);
        const paidSumP = sumOf(paidP);
        people.forEach((p, i) => { p.paidP = paidP[i]; p.netP = paidP[i] - p.totalP; });
        if (paidSumP !== finalP) {
          settleError = 'The “Paid” amounts add up to ' + money(fromPaise(paidSumP)) + ', but the bill total is '
            + money(fromPaise(finalP)) + (tipP ? ' (including tip)' : '') + '. Adjust them so they match.';
        } else {
          settlements = minimizeTransfers(people.map((p) => p.netP)).map((t) => ({
            from: people[t.from].name,
            to: people[t.to].name,
            amountP: t.amountP
          }));
        }
      }
    }

    return { status: 'ok', mode: inp.mode, subtotalP, tipP, tipPct, finalP, people, settlements, settleError, count: n };
  }

  /** Plain-text version of a result, for Copy and Share. */
  function buildSummaryText(res, title) {
    const lines = [];
    lines.push('PocketNepal bill split' + (title ? ': ' + title : ''));
    lines.push(fmtDate(todayStr()));
    lines.push('');
    lines.push('Bill ' + money(fromPaise(res.subtotalP)) + ' + tip ' + res.tipPct + '% (' + money(fromPaise(res.tipP))
      + ') = ' + money(fromPaise(res.finalP)));
    lines.push('');
    lines.push(res.mode === 'settle' ? 'Fair share per person:' : 'Each person pays:');
    res.people.forEach((p) => lines.push('- ' + p.name + ': ' + money(fromPaise(p.totalP))));
    if (res.settlements) {
      lines.push('');
      if (res.settlements.length) {
        lines.push('Who pays whom:');
        res.settlements.forEach((t) => lines.push('- ' + t.from + ' → ' + t.to + ': ' + money(fromPaise(t.amountP))));
      } else {
        lines.push('Everyone is settled up.');
      }
    }
    return lines.join('\n');
  }

  /* ==========================================================
     5. BILL SPLITTER: THE SCREEN
     ========================================================== */

  const split = { mode: 'equal', settleShares: 'equal', title: '', total: '', tip: '0', people: [] };
  let splitResult = null;

  const newPerson = () => ({ id: uid(), name: '', share: '', paid: '' });
  function resetSplit() {
    split.mode = 'equal';
    split.settleShares = 'equal';
    split.title = '';
    split.total = '';
    split.tip = '0';
    split.people = [newPerson(), newPerson()];
  }
  resetSplit();

  const MODE_HELP = {
    equal: 'Everyone pays the same share of the bill, plus tip.',
    custom: 'Enter what each person should pay for, before tip. Tip is shared in proportion to each amount. The amounts must add up to the total bill.',
    settle: 'Enter how much each person actually paid. PocketNepal works out the fewest payments that settle everyone up.'
  };

  const usesCustomShares = () => split.mode === 'custom' || (split.mode === 'settle' && split.settleShares === 'custom');
  const personInitial = (p, i) => ((p.name || '').trim().charAt(0).toUpperCase() || String(i + 1));

  /** Fill in the controls (everything except the person rows). */
  function renderSplitControls() {
    $$('.seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === split.mode)));
    $('#modeHelp').textContent = MODE_HELP[split.mode];
    $('#splitTitle').value = split.title;
    $('#splitTotal').value = split.total;
    $('#splitTip').value = split.tip;
    $('#peopleCount').value = split.people.length;
    $('#peopleMinus').disabled = split.people.length <= MIN_PEOPLE;
    $('#peoplePlus').disabled = split.people.length >= MAX_PEOPLE;
    $('#addPersonBtn').disabled = split.people.length >= MAX_PEOPLE;
    $('#settleSharesBox').hidden = split.mode !== 'settle';
    $$('.chip[data-shares]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.shares === split.settleShares)));
    $('#fillEqualBtn').hidden = !usesCustomShares();
    updateTipChips();
    ['#splitTotalErr', '#splitTipErr', '#peopleErr'].forEach((id) => { $(id).textContent = ''; });
    ['#splitTotal', '#splitTip', '#peopleCount'].forEach((id) => $(id).removeAttribute('aria-invalid'));
  }

  function updateTipChips() {
    $$('.chip[data-tip]').forEach((c) => {
      c.setAttribute('aria-pressed', String(split.tip !== '' && Number(split.tip) === Number(c.dataset.tip)));
    });
  }

  /** Build the rows for each person. Called only when the list or mode changes, not on every keystroke. */
  function renderPeople() {
    const showShare = usesCustomShares();
    const showPaid = split.mode === 'settle';
    const canRemove = split.people.length > MIN_PEOPLE;
    $('#peopleList').innerHTML = split.people.map((p, i) => {
      const label = (p.name || '').trim() || 'person ' + (i + 1);
      return '<li class="person-row" data-id="' + p.id + '">'
        + '<span class="avatar" data-hue="' + (i % 8) + '" aria-hidden="true">' + esc(personInitial(p, i)) + '</span>'
        + '<div class="person-fields">'
        + '<div class="pf pf-name"><label class="sr-only" for="pn-' + p.id + '">Name of person ' + (i + 1) + '</label>'
        + '<input type="text" id="pn-' + p.id + '" data-field="name" maxlength="24" placeholder="Person ' + (i + 1) + '" value="' + esc(p.name) + '" autocomplete="off"></div>'
        + (showShare ? '<div class="pf"><label for="ps-' + p.id + '">Share (Rs.)</label>'
          + '<input type="number" id="ps-' + p.id + '" data-field="share" inputmode="decimal" min="0" step="0.01" placeholder="0" value="' + esc(p.share) + '"></div>' : '')
        + (showPaid ? '<div class="pf"><label for="pp-' + p.id + '">Paid (Rs.)</label>'
          + '<input type="number" id="pp-' + p.id + '" data-field="paid" inputmode="decimal" min="0" step="0.01" placeholder="0" value="' + esc(p.paid) + '"></div>' : '')
        + '</div>'
        + '<button type="button" class="icon-btn" data-remove aria-label="Remove ' + esc(label) + '"' + (canRemove ? '' : ' disabled') + '><svg class="ico"><use href="#i-trash"/></svg></button>'
        + '</li>';
    }).join('');
  }

  /** The "Rs. X of Rs. Y" helper lines under the people list. */
  function updateTally() {
    const el = $('#customTally');
    const total = numberFrom(split.total);
    const subtotalP = total > 0 ? toPaise(total) : 0;
    const tip = split.tip === '' ? 0 : numberFrom(split.tip);
    const finalP = subtotalP + (tip >= 0 && tip <= 100 ? Math.round(subtotalP * tip / 100) : 0);
    const lines = [];

    const line = (label, enteredP, targetP, unit) => {
      if (!targetP) return '<span class="tally-line">' + label + ': ' + money(fromPaise(enteredP)) + '. Enter the total bill to check.</span>';
      const diff = targetP - enteredP;
      const cls = diff === 0 ? 'ok' : diff > 0 ? 'warn' : 'over';
      const note = diff === 0 ? 'Matches the ' + unit + '.' : diff > 0 ? money(fromPaise(diff)) + ' left to assign.' : money(fromPaise(-diff)) + ' too much.';
      return '<span class="tally-line ' + cls + '">' + label + ': ' + money(fromPaise(enteredP)) + ' of ' + money(fromPaise(targetP)) + '. ' + note + '</span>';
    };

    if (usesCustomShares()) {
      const entered = sumOf(split.people.map((p) => toPaise(numberFrom(p.share) || 0)));
      lines.push(line('Shares', entered, subtotalP, 'bill'));
    }
    if (split.mode === 'settle') {
      const paid = sumOf(split.people.map((p) => toPaise(numberFrom(p.paid) || 0)));
      lines.push(line('Paid', paid, finalP, 'bill total'));
    }
    el.hidden = lines.length === 0;
    el.innerHTML = lines.join('');
  }

  function noticeHTML(icon, title, text, tone) {
    return '<div class="res-notice ' + (tone || '') + '"><div class="res-notice-ico" aria-hidden="true">' + icon + '</div>'
      + '<p><strong>' + title + '</strong></p>' + (text ? '<p class="muted">' + text + '</p>' : '') + '</div>';
  }

  function renderSplitResult() {
    const res = computeSplit(split);
    splitResult = res;
    updateTally();

    const body = $('#splitResultBody');
    const actions = $('#resultActions');
    actions.hidden = true;

    if (res.status === 'empty') {
      body.innerHTML = noticeHTML('🧾', 'Your split will appear here.',
        'Enter the total bill and the people. Example: Rs. 2,500 with a 10% tip between 4 people is Rs. 687.50 each.');
      return;
    }
    if (res.status === 'error') { body.innerHTML = noticeHTML('⚠️', res.message, '', 'warn'); return; }
    if (res.status === 'mismatch') {
      const text = res.diffP > 0
        ? money(fromPaise(res.diffP)) + ' still needs to be assigned.'
        : money(fromPaise(-res.diffP)) + ' too much has been assigned.';
      body.innerHTML = noticeHTML('⚠️', 'The amounts add up to ' + money(fromPaise(res.enteredP)) + ', but the bill is ' + money(fromPaise(res.subtotalP)) + '.',
        text + ' Change the amounts, or press “Fill equally”.', 'warn');
      return;
    }

    // status is ok
    let html = '<div class="res-summary">'
      + '<div class="res-line"><span>Subtotal</span><strong>' + money(fromPaise(res.subtotalP)) + '</strong></div>'
      + '<div class="res-line"><span>Tip (' + res.tipPct + '%)</span><strong>' + money(fromPaise(res.tipP)) + '</strong></div>'
      + '<div class="res-line total"><span>Final total</span><strong>' + money(fromPaise(res.finalP)) + '</strong></div>'
      + '</div>';

    if (res.mode === 'equal') {
      const exact = res.finalP % res.count === 0;
      html += '<div class="res-big"><span>Each person pays</span><strong>' + (exact ? '' : '≈ ')
        + money(fromPaise(res.finalP / res.count)) + '</strong><span>' + res.count + ' people</span></div>';
      if (!exact) html += '<p class="fine-print">The last paisa can’t be split evenly, so a few people pay 1 paisa more. The total is exact.</p>';
    }

    if (res.mode === 'settle' && res.settleError) {
      html += noticeHTML('⚠️', res.settleError, '', 'warn');
    } else if (res.settlements) {
      html += '<h3 class="res-sub">Who pays whom</h3>';
      if (res.settlements.length) {
        html += '<ul class="pay-list">' + res.settlements.map((t) =>
          '<li class="pay-item"><span class="pay-name">' + esc(t.from) + '</span>'
          + '<svg class="ico pay-arrow" aria-label="pays"><use href="#i-arrow"/></svg>'
          + '<span class="pay-name">' + esc(t.to) + '</span>'
          + '<strong class="pay-amt">' + money(fromPaise(t.amountP)) + '</strong></li>').join('') + '</ul>'
          + '<p class="fine-print">This is the fewest payments needed: ' + res.settlements.length + '.</p>';
      } else {
        html += '<p class="settled">🎉 Everyone is settled up. Nobody owes anything.</p>';
      }
    }

    html += '<h3 class="res-sub">' + (res.mode === 'settle' ? 'Breakdown' : 'Each person') + '</h3><ul class="person-results">'
      + res.people.map((p, i) => {
        let detail = '';
        if (res.mode === 'custom' || p.shareP !== null) detail = 'Share ' + money(fromPaise(p.shareP)) + ' + tip ' + money(fromPaise(p.tipP));
        if (res.mode === 'settle' && p.paidP !== null) {
          const bal = p.netP > 0 ? 'gets back ' + money(fromPaise(p.netP)) : p.netP < 0 ? 'owes ' + money(fromPaise(-p.netP)) : 'is settled';
          detail = (detail ? detail + ' · ' : '') + 'Paid ' + money(fromPaise(p.paidP)) + ' · ' + bal;
        }
        return '<li class="person-result"><span class="avatar" data-hue="' + (i % 8) + '" aria-hidden="true">' + esc(p.name.charAt(0).toUpperCase()) + '</span>'
          + '<div class="pr-main"><span class="pr-name">' + esc(p.name) + '</span>' + (detail ? '<span class="pr-detail">' + esc(detail) + '</span>' : '') + '</div>'
          + '<strong class="pr-amt">' + money(fromPaise(p.totalP)) + '</strong></li>';
      }).join('') + '</ul>';

    body.innerHTML = html;
    actions.hidden = !!res.settleError;
  }

  // ----- Copy, share and save -----
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* fall through to the older method */ }
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(box);
    box.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    box.remove();
    return ok;
  }

  function currentSummary() {
    if (!splitResult || splitResult.status !== 'ok' || splitResult.settleError) return '';
    return buildSummaryText(splitResult, split.title.trim());
  }

  async function copyResult() {
    const text = currentSummary();
    if (!text) { toast('Work out a split first.'); return; }
    toast((await copyText(text)) ? 'Results copied. Paste them anywhere.' : 'Could not copy. Please select the text and copy it yourself.', { tone: 'ok' });
  }

  async function shareResult() {
    const text = currentSummary();
    if (!text) { toast('Work out a split first.'); return; }
    if (navigator.share) {
      try { await navigator.share({ title: 'PocketNepal bill split', text }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const ok = await copyText(text);
    toast(ok ? 'Sharing is not available here, so the results were copied. Paste them into WhatsApp or Messenger.' : 'Could not share. Try “Copy results”.', { tone: ok ? 'ok' : 'warn', duration: 5000 });
  }

  function saveBill() {
    const res = splitResult;
    if (!res || res.status !== 'ok' || res.settleError) { toast('Work out a valid split before saving.'); return; }
    state.bills.unshift({
      id: uid(),
      savedAt: new Date().toISOString(),
      title: split.title.trim() || 'Untitled bill',
      mode: res.mode,
      total: fromPaise(res.subtotalP),
      tipPct: res.tipPct,
      tipAmount: fromPaise(res.tipP),
      finalTotal: fromPaise(res.finalP),
      people: res.people.map((p) => ({ name: p.name, total: fromPaise(p.totalP), paid: p.paidP === null ? null : fromPaise(p.paidP) })),
      payments: (res.settlements || []).map((t) => ({ from: t.from, to: t.to, amount: fromPaise(t.amountP) }))
    });
    if (state.bills.length > MAX_BILLS) state.bills.length = MAX_BILLS;
    saveBills();
    renderHistory();
    renderDashboard();
    toast('Bill saved to history.', { tone: 'ok' });
  }

  // ----- Bill history -----
  function billDay(b) {
    const d = new Date(b.savedAt);
    return isNaN(d.getTime()) ? '' : fmtDate(ymd(d));
  }

  function renderHistory() {
    const count = state.bills.length;
    $('#historyCount').textContent = count;
    $('#clearHistoryBtn').disabled = count === 0;
    $('#historyEmpty').hidden = count > 0;
    $('#historyList').innerHTML = state.bills.map((b) => {
      const payments = (b.payments || []).length
        ? '<h4 class="res-sub">Who paid whom</h4><ul class="h-people">' + b.payments.map((t) =>
          '<li><span>' + esc(t.from) + ' → ' + esc(t.to) + '</span><strong>' + money(t.amount) + '</strong></li>').join('') + '</ul>'
        : '';
      return '<li class="history-item"><details>'
        + '<summary><span class="h-title">' + esc(b.title) + '</span>'
        + '<span class="h-meta">' + esc(billDay(b)) + ' · ' + b.people.length + ' people</span>'
        + '<strong class="h-total">' + money(b.finalTotal) + '</strong></summary>'
        + '<div class="h-body">'
        + '<p class="muted">Bill ' + money(b.total) + ' + tip ' + esc(b.tipPct) + '% (' + money(b.tipAmount) + ')</p>'
        + '<ul class="h-people">' + b.people.map((p) => '<li><span>' + esc(p.name) + '</span><strong>' + money(p.total) + '</strong></li>').join('') + '</ul>'
        + payments
        + '<div class="h-actions"><button type="button" class="btn btn-danger-ghost btn-sm" data-del-bill="' + esc(b.id) + '"><svg class="ico"><use href="#i-trash"/></svg> Delete this bill</button></div>'
        + '</div></details></li>';
    }).join('');
  }

  function deleteBill(id) {
    const index = state.bills.findIndex((b) => b.id === id);
    if (index < 0) return;
    const removed = state.bills.splice(index, 1)[0];
    saveBills();
    renderHistory();
    renderDashboard();
    toast('Bill deleted.', {
      action: 'Undo',
      duration: 5000,
      onAction: () => { state.bills.splice(Math.min(index, state.bills.length), 0, removed); saveBills(); renderHistory(); renderDashboard(); }
    });
  }

  async function clearHistory() {
    if (!state.bills.length) return;
    const ok = await confirmAction({
      title: 'Delete all bill history?',
      message: 'This removes ' + state.bills.length + ' saved bill' + (state.bills.length === 1 ? '' : 's') + ' from this browser. It cannot be undone.',
      confirmText: 'Delete history'
    });
    if (!ok) return;
    state.bills = [];
    saveBills();
    renderHistory();
    renderDashboard();
    toast('Bill history deleted.');
  }

  // ----- Wiring -----
  function setPeopleCount(n) {
    n = Math.max(MIN_PEOPLE, Math.min(MAX_PEOPLE, Math.round(n)));
    while (split.people.length < n) split.people.push(newPerson());
    while (split.people.length > n) split.people.pop();
    renderSplitControls();
    renderPeople();
    renderSplitResult();
  }

  function setSplitMode(mode) {
    split.mode = mode;
    renderSplitControls();
    renderPeople();
    renderSplitResult();
  }

  function bindSplitter() {
    $$('.seg-btn').forEach((b) => b.addEventListener('click', () => setSplitMode(b.dataset.mode)));

    $$('.chip[data-shares]').forEach((c) => c.addEventListener('click', () => {
      split.settleShares = c.dataset.shares;
      renderSplitControls(); renderPeople(); renderSplitResult();
    }));

    $('#splitTitle').addEventListener('input', (e) => { split.title = e.target.value; });

    $('#splitTotal').addEventListener('input', (e) => {
      split.total = e.target.value;
      const v = numberFrom(split.total);
      let msg = '';
      if (split.total !== '' && !(v > 0)) msg = 'Enter an amount greater than zero.';
      else if (v > MAX_AMOUNT) msg = 'That amount is too large.';
      setFieldError(e.target, msg);
      renderSplitResult();
    });

    $('#splitTip').addEventListener('input', (e) => {
      split.tip = e.target.value;
      const v = split.tip === '' ? 0 : numberFrom(split.tip);
      setFieldError(e.target, v >= 0 && v <= 100 ? '' : 'Tip must be between 0% and 100%.');
      updateTipChips();
      renderSplitResult();
    });

    $$('.chip[data-tip]').forEach((c) => c.addEventListener('click', () => {
      split.tip = c.dataset.tip;
      $('#splitTip').value = split.tip;
      setFieldError($('#splitTip'), '');
      updateTipChips();
      renderSplitResult();
    }));

    $('#peopleMinus').addEventListener('click', () => setPeopleCount(split.people.length - 1));
    $('#peoplePlus').addEventListener('click', () => setPeopleCount(split.people.length + 1));
    $('#addPersonBtn').addEventListener('click', () => setPeopleCount(split.people.length + 1));
    $('#peopleCount').addEventListener('change', (e) => {
      const v = numberFrom(e.target.value);
      if (!(v >= MIN_PEOPLE && v <= MAX_PEOPLE)) {
        setFieldError(e.target, 'Choose between ' + MIN_PEOPLE + ' and ' + MAX_PEOPLE + ' people.');
        if (Number.isFinite(v)) setPeopleCount(v); else setPeopleCount(split.people.length);
        $('#peopleErr').textContent = 'Choose between ' + MIN_PEOPLE + ' and ' + MAX_PEOPLE + ' people.';
        return;
      }
      setPeopleCount(v);
    });

    // Typing in a person's row: update the data and the result, but leave the rows alone (keeps your cursor).
    $('#peopleList').addEventListener('input', (e) => {
      const input = e.target;
      const row = input.closest('.person-row');
      const field = input.dataset.field;
      if (!row || !field) return;
      const index = split.people.findIndex((p) => p.id === row.dataset.id);
      if (index < 0) return;
      split.people[index][field] = input.value;
      if (field === 'name') row.querySelector('.avatar').textContent = personInitial(split.people[index], index);
      renderSplitResult();
    });

    $('#peopleList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn || btn.disabled) return;
      const row = btn.closest('.person-row');
      const index = split.people.findIndex((p) => p.id === row.dataset.id);
      if (index < 0 || split.people.length <= MIN_PEOPLE) return;
      split.people.splice(index, 1);
      renderSplitControls(); renderPeople(); renderSplitResult();
      const next = $('#peopleList .person-row input');
      if (next) next.focus();
    });

    $('#fillEqualBtn').addEventListener('click', () => {
      const total = numberFrom(split.total);
      if (!(total > 0)) { toast('Enter the total bill first.'); $('#splitTotal').focus(); return; }
      const parts = allocate(toPaise(total), split.people.map(() => 1));
      split.people.forEach((p, i) => { p.share = String(fromPaise(parts[i])); });
      renderPeople();
      renderSplitResult();
    });

    $('#splitResetBtn').addEventListener('click', () => {
      resetSplit();
      renderSplitControls(); renderPeople(); renderSplitResult();
      toast('Form cleared.');
    });

    $('#copyBtn').addEventListener('click', copyResult);
    $('#shareBtn').addEventListener('click', shareResult);
    $('#saveBillBtn').addEventListener('click', saveBill);
    $('#clearHistoryBtn').addEventListener('click', clearHistory);
    $('#historyList').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del-bill]');
      if (del) deleteBill(del.dataset.delBill);
    });
    $('#splitForm').addEventListener('submit', (e) => e.preventDefault());

    renderSplitControls();
    renderPeople();
    renderSplitResult();
    renderHistory();
  }

  /* ==========================================================
     6. EXPENSES: ADD, EDIT, DELETE, SEARCH, FILTER, SORT
     ========================================================== */

  const cents = (x) => Math.round(x * 100) / 100;

  function buildCategoryControls() {
    // Radio buttons in the add/edit dialog
    $('#eCatGrid').innerHTML = CATEGORIES.map((c) =>
      '<label class="cat-opt"><input type="radio" name="eCat" value="' + c.key + '">'
      + '<span class="cat-chip" style="--c:' + c.color + '"><span class="cat-emoji" aria-hidden="true">' + c.icon + '</span><span>' + c.label + '</span></span></label>'
    ).join('');
    // Category filter on the Expenses page
    $('#fCat').innerHTML = '<option value="all">All categories</option>'
      + CATEGORIES.map((c) => '<option value="' + c.key + '">' + c.icon + ' ' + c.label + '</option>').join('');
  }

  /** The friendly "nothing here yet" panel. */
  function emptyStateHTML() {
    return '<div class="empty-art" aria-hidden="true">🪙</div>'
      + '<h3>No expenses yet.</h3>'
      + '<p>Start tracking where your money goes.</p>'
      + '<div class="empty-actions">'
      + '<button type="button" class="btn btn-primary" data-action="add-expense">Add your first expense</button>'
      + '<button type="button" class="btn btn-secondary" data-action="load-sample">Try with sample data</button>'
      + '</div>';
  }

  function expenseHTML(e, withActions) {
    const c = CAT[e.category];
    return '<li class="exp-item' + (e.id === state.lastAddedId ? ' enter' : '') + '" data-id="' + esc(e.id) + '" style="--c:' + c.color + '">'
      + '<span class="exp-ico" aria-hidden="true">' + c.icon + '</span>'
      + '<div class="exp-main"><span class="exp-cat">' + c.label + '</span><span class="exp-desc">' + esc(e.description) + '</span></div>'
      + '<div class="exp-right"><span class="exp-amt">' + money(e.amount) + '</span><span class="exp-date">' + fmtDate(e.date) + '</span></div>'
      + (withActions
        ? '<div class="exp-actions">'
          + '<button type="button" class="icon-btn" data-edit aria-label="Edit ' + esc(e.description) + '"><svg class="ico"><use href="#i-edit"/></svg></button>'
          + '<button type="button" class="icon-btn danger" data-del aria-label="Delete ' + esc(e.description) + '"><svg class="ico"><use href="#i-trash"/></svg></button>'
          + '</div>'
        : '')
      + '</li>';
  }

  /** Apply the search box, category, date range and sort order. */
  function filteredExpenses() {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    const list = state.expenses.filter((e) => {
      if (f.cat !== 'all' && e.category !== f.cat) return false;
      if (f.from && e.date < f.from) return false;
      if (f.to && e.date > f.to) return false;
      if (q) {
        const haystack = (e.description + ' ' + CAT[e.category].label + ' ' + e.amount).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const by = {
      'date-desc': (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0),
      'date-asc': (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
      'amount-desc': (a, b) => b.amount - a.amount,
      'amount-asc': (a, b) => a.amount - b.amount
    };
    return list.sort(by[f.sort] || by['date-desc']);   // sort is stable, so ties keep newest-first
  }

  function filtersActive() {
    const f = state.filters;
    return f.q.trim() !== '' || f.cat !== 'all' || f.from !== '' || f.to !== '' || f.sort !== 'date-desc';
  }

  function renderExpenseList() {
    const all = state.expenses;
    const list = filteredExpenses();
    const ul = $('#expList');
    const empty = $('#expEmpty');
    const more = $('#moreBtn');

    $('#filterCard').hidden = all.length === 0;
    $('#clearFiltersBtn').disabled = !filtersActive();

    if (!all.length) {
      ul.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = emptyStateHTML();
      more.hidden = true;
      return;
    }

    const totalShown = cents(sumOf(list.map((e) => e.amount)));
    $('#filterSummary').textContent = 'Showing ' + list.length + ' of ' + all.length + ' expense' + (all.length === 1 ? '' : 's')
      + (list.length ? ' · ' + money(totalShown) + ' in total' : '');

    if (!list.length) {
      ul.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = '<div class="empty-art" aria-hidden="true">🔎</div><h3>No matching expenses.</h3>'
        + '<p>Try a different search or clear the filters.</p>'
        + '<div class="empty-actions"><button type="button" class="btn btn-secondary" data-action="clear-filters">Clear filters</button></div>';
      more.hidden = true;
      return;
    }

    empty.hidden = true;
    ul.innerHTML = list.slice(0, state.shown).map((e) => expenseHTML(e, true)).join('');
    const left = list.length - state.shown;
    more.hidden = left <= 0;
    more.textContent = 'Show more (' + left + ' left)';
    state.lastAddedId = null;
  }

  // ----- Add / edit dialog -----
  let editingId = null;

  function clearExpenseErrors() {
    ['#eAmount', '#eDesc', '#eDate'].forEach((id) => setFieldError($(id), ''));
    $('#eCatErr').textContent = '';
  }

  function openExpenseDialog(id) {
    const existing = id ? state.expenses.find((x) => x.id === id) : null;
    if (id && !existing) return;
    editingId = existing ? existing.id : null;
    $('#expenseDialogTitle').textContent = existing ? 'Edit expense' : 'Add expense';
    $('#expenseSubmit').textContent = existing ? 'Save changes' : 'Add expense';
    $('#eAmount').value = existing ? existing.amount : '';
    $('#eDesc').value = existing ? existing.description : '';
    $('#eDate').max = todayStr();
    $('#eDate').value = existing ? existing.date : todayStr();
    const radio = $('input[name="eCat"][value="' + (existing ? existing.category : state.lastCategory) + '"]');
    if (radio) radio.checked = true;
    clearExpenseErrors();
    openDialog($('#expenseDialog'));
    $('#eAmount').focus();
  }

  function submitExpense(ev) {
    ev.preventDefault();
    const amountEl = $('#eAmount');
    const descEl = $('#eDesc');
    const dateEl = $('#eDate');
    const catEl = $('input[name="eCat"]:checked');
    const amount = cents(numberFrom(amountEl.value));
    const description = descEl.value.trim();
    const date = dateEl.value;

    clearExpenseErrors();
    let firstBad = null;
    const fail = (el, msg) => { setFieldError(el, msg); if (!firstBad) firstBad = el; };

    if (amountEl.value === '') fail(amountEl, 'Enter an amount.');
    else if (!(amount >= 0.01)) fail(amountEl, 'The amount must be greater than zero.');
    else if (amount > MAX_AMOUNT) fail(amountEl, 'That amount is too large.');

    if (!catEl) { $('#eCatErr').textContent = 'Choose a category.'; if (!firstBad) firstBad = $('input[name="eCat"]'); }
    if (!description) fail(descEl, 'Add a short description, like “Lunch”.');

    if (!isValidYMD(date)) fail(dateEl, 'Pick a valid date.');
    else if (date > todayStr()) fail(dateEl, 'The date can’t be in the future.');

    if (firstBad) { firstBad.focus(); return; }

    state.lastCategory = catEl.value;
    if (editingId) {
      const target = state.expenses.find((x) => x.id === editingId);
      if (target) {
        target.amount = amount;
        target.category = catEl.value;
        target.description = description;
        target.date = date;
        target.sample = false;   // an edited sample entry is now the user's own
      }
      toast('Expense updated.', { tone: 'ok' });
    } else {
      const created = { id: uid(), amount, category: catEl.value, description, date, sample: false };
      state.expenses.unshift(created);
      state.lastAddedId = created.id;
      toast('Expense added: ' + money(amount) + ' for ' + description + '.', { tone: 'ok' });
    }
    saveExpenses();
    $('#expenseDialog').close();
    refreshAll();
  }

  function deleteExpense(id) {
    const index = state.expenses.findIndex((x) => x.id === id);
    if (index < 0) return;
    const removed = state.expenses.splice(index, 1)[0];
    saveExpenses();

    const row = $('#expList [data-id="' + id.replace(/"/g, '') + '"]');
    if (row && !reduceMotion) {
      row.classList.add('removing');
      setTimeout(refreshAll, 220);
    } else {
      refreshAll();
    }
    toast('Deleted “' + removed.description + '”.', {
      action: 'Undo',
      duration: 6000,
      onAction: () => {
        if (state.expenses.some((x) => x.id === removed.id)) return;
        state.expenses.splice(Math.min(index, state.expenses.length), 0, removed);
        saveExpenses();
        refreshAll();
      }
    });
  }

  function bindExpenses() {
    buildCategoryControls();
    $('#expenseForm').addEventListener('submit', submitExpense);

    const refreshList = () => { state.shown = PAGE_SIZE; renderExpenseList(); };
    let searchTimer = 0;
    $('#fSearch').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.filters.q = e.target.value; refreshList(); }, 120);
    });
    $('#fCat').addEventListener('change', (e) => { state.filters.cat = e.target.value; refreshList(); });
    $('#fFrom').addEventListener('change', (e) => { state.filters.from = e.target.value; refreshList(); });
    $('#fTo').addEventListener('change', (e) => { state.filters.to = e.target.value; refreshList(); });
    $('#fSort').addEventListener('change', (e) => { state.filters.sort = e.target.value; refreshList(); });
    $('#clearFiltersBtn').addEventListener('click', clearFilters);
    $('#moreBtn').addEventListener('click', () => { state.shown += PAGE_SIZE; renderExpenseList(); });

    $('#expList').addEventListener('click', (e) => {
      const item = e.target.closest('.exp-item');
      if (!item) return;
      if (e.target.closest('[data-edit]')) openExpenseDialog(item.dataset.id);
      else if (e.target.closest('[data-del]')) deleteExpense(item.dataset.id);
    });
  }

  function clearFilters() {
    state.filters = { q: '', cat: 'all', from: '', to: '', sort: 'date-desc' };
    $('#fSearch').value = '';
    $('#fCat').value = 'all';
    $('#fFrom').value = '';
    $('#fTo').value = '';
    $('#fSort').value = 'date-desc';
    state.shown = PAGE_SIZE;
    renderExpenseList();
  }

  /* ==========================================================
     7. DASHBOARD: TOTALS, BUDGET AND INSIGHTS
     ========================================================== */

  /** Spending per category for one month ("2026-10"). `maxDay` limits it to days 1..maxDay. */
  function categoryTotals(key, maxDay) {
    const totals = {};
    CATEGORIES.forEach((c) => { totals[c.key] = 0; });
    state.expenses.forEach((e) => {
      if (monthKey(e.date) !== key) return;
      if (maxDay && Number(e.date.slice(8, 10)) > maxDay) return;
      totals[e.category] += e.amount;
    });
    Object.keys(totals).forEach((k) => { totals[k] = cents(totals[k]); });
    return totals;
  }

  const monthTotal = (key) => cents(sumOf(Object.values(categoryTotals(key))));
  const daysInMonth = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();

  /** Friendly, rule-based observations. These are simple sums, not financial advice. */
  function computeInsights() {
    if (!state.expenses.length) return ['✍️|Add a few expenses and friendly insights will appear here.'];

    const today = todayStr();
    const cur = monthKey(today);
    const prev = shiftMonth(cur, -1);
    const dayNum = parseYMD(today).getDate();
    const curTotals = categoryTotals(cur);
    const total = cents(sumOf(Object.values(curTotals)));
    const out = [];

    if (total <= 0) return ['🌱|You have not recorded any spending this month yet.'];

    // 1. Biggest category
    const top = CATEGORIES.map((c) => ({ c, v: curTotals[c.key] })).sort((a, b) => b.v - a.v)[0];
    out.push(top.c.icon + '|' + top.c.label + ' is your biggest expense this month (' + Math.round(top.v / total * 100) + '% of your spending).');

    // 2. Biggest change versus the same days last month
    const prevTotals = categoryTotals(prev, dayNum);
    let change = null;
    CATEGORIES.forEach((c) => {
      const now = curTotals[c.key];
      const before = prevTotals[c.key];
      if (now > 0 && before > 0) {
        const pct = (now - before) / before * 100;
        if (Math.abs(now - before) >= 100 && Math.abs(pct) >= 10 && (!change || Math.abs(pct) > Math.abs(change.pct))) change = { c, pct };
      }
    });
    if (change) {
      out.push((change.pct > 0 ? '📈' : '📉') + '|You spent ' + Math.round(Math.abs(change.pct)) + '% ' + (change.pct > 0 ? 'more' : 'less')
        + ' on ' + change.c.label.toLowerCase() + ' so far than at this point last month.');
    }

    // 3. Subscriptions
    if (curTotals.subscriptions > 0) out.push('💡|You spent ' + money(curTotals.subscriptions) + ' on subscriptions this month.');

    // 4. Yesterday versus your daily average
    const yesterday = addDays(today, -1);
    if (monthKey(yesterday) === cur && dayNum >= 4) {
      const yTotal = cents(sumOf(state.expenses.filter((e) => e.date === yesterday).map((e) => e.amount)));
      const todayTotal = cents(sumOf(state.expenses.filter((e) => e.date === today).map((e) => e.amount)));
      const avg = (total - todayTotal) / (dayNum - 1);
      if (avg > 0 && yTotal !== cents(avg)) {
        out.push((yTotal < avg ? '🌤️' : '🌧️') + '|You spent ' + (yTotal < avg ? 'less' : 'more') + ' than your daily average yesterday ('
          + money(yTotal) + ' compared with an average of ' + money(avg) + ').');
      }
    }

    // 5. Daily allowance left in the budget
    if (state.budget > 0 && state.budget > total) {
      const daysLeft = daysInMonth(cur) - dayNum + 1;
      out.push('🎯|To stay within budget you can spend about ' + money((state.budget - total) / daysLeft) + ' a day for the rest of the month.');
    }
    return out.slice(0, 5);
  }

  function renderInsights() {
    $('#insightList').innerHTML = computeInsights().map((line) => {
      const cut = line.indexOf('|');
      return '<li class="insight"><span class="insight-ico" aria-hidden="true">' + esc(line.slice(0, cut)) + '</span><span>' + esc(line.slice(cut + 1)) + '</span></li>';
    }).join('');
  }

  function renderBudget() {
    const body = $('#budgetBody');
    const btn = $('#budgetEditBtn');
    const spent = monthTotal(monthKey(todayStr()));

    if (!state.budget) {
      btn.textContent = 'Set budget';
      body.innerHTML = '<div class="budget-empty"><p class="muted">Set a monthly budget to see how much you have left and get a gentle warning when you get close.</p>'
        + '<button type="button" class="btn btn-primary" data-action="edit-budget">Set monthly budget</button></div>';
      return;
    }
    btn.textContent = 'Edit budget';
    const budget = state.budget;
    const remaining = cents(Math.max(0, budget - spent));
    const pctRaw = spent / budget * 100;
    const over = cents(spent - budget) > 0;
    const level = over ? 'over' : pctRaw >= 80 ? 'warn' : 'ok';
    let message;
    if (over) message = '🔴 You are ' + money(spent - budget) + ' over your budget.';
    else if (pctRaw >= 80) message = '⚠️ You have used ' + Math.floor(pctRaw) + '% of your monthly budget.';
    else message = '✅ You are on track: ' + Math.floor(pctRaw) + '% of your budget used.';

    body.innerHTML = '<div class="budget-figs">'
      + '<div><span class="kpi-label">Monthly budget</span><strong>' + money(budget) + '</strong></div>'
      + '<div><span class="kpi-label">Spent</span><strong>' + money(spent) + '</strong></div>'
      + '<div><span class="kpi-label">Remaining</span><strong class="' + (over ? 'neg' : '') + '">' + money(remaining) + '</strong></div>'
      + '</div>'
      + '<div class="progress" role="progressbar" aria-label="Budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.min(100, Math.round(pctRaw)) + '">'
      + '<div class="progress-bar ' + level + '" style="width:' + Math.min(100, pctRaw).toFixed(1) + '%"></div></div>'
      + '<p class="budget-msg ' + level + '" role="status">' + message + '</p>';
  }

  function renderTopCategories() {
    const totals = categoryTotals(monthKey(todayStr()));
    const total = sumOf(Object.values(totals));
    const rows = CATEGORIES.map((c) => ({ c, v: totals[c.key] })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v).slice(0, 5);
    $('#topCats').innerHTML = rows.length
      ? rows.map((r) => '<div class="cat-row" style="--c:' + r.c.color + '"><div class="cat-row-top"><span>' + r.c.icon + ' ' + r.c.label + '</span>'
        + '<span><strong>' + money(r.v) + '</strong> <span class="muted">' + Math.round(r.v / total * 100) + '%</span></span></div>'
        + '<div class="cat-bar" aria-hidden="true"><span style="width:' + (r.v / total * 100).toFixed(1) + '%"></span></div></div>').join('')
      : '<p class="muted">Nothing spent yet this month.</p>';
  }

  function renderRecent() {
    const recent = state.expenses.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 5);
    const list = $('#recentList');
    const empty = $('#recentEmpty');
    if (!recent.length) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = emptyStateHTML();
      return;
    }
    empty.hidden = true;
    list.innerHTML = recent.map((e) => expenseHTML(e, false)).join('');
  }

  function renderDashboard() {
    const today = todayStr();
    const cur = monthKey(today);
    const monthList = state.expenses.filter((e) => monthKey(e.date) === cur);
    const largest = monthList.reduce((best, e) => (!best || e.amount > best.amount ? e : best), null);

    $('#dashMonthLabel').textContent = monthLabel(cur);
    $('#kpiMonth').textContent = money(cents(sumOf(monthList.map((e) => e.amount))));
    $('#kpiToday').textContent = money(cents(sumOf(state.expenses.filter((e) => e.date === today).map((e) => e.amount))));
    $('#kpiLargest').textContent = money(largest ? largest.amount : 0);
    $('#kpiLargestSub').textContent = largest ? CAT[largest.category].icon + ' ' + largest.description : '';
    $('#kpiCount').textContent = String(monthList.length);

    countTo($('#stripBills'), state.bills.length, false);
    countTo($('#stripMoney'), cents(sumOf(state.expenses.map((e) => e.amount))), true);
    countTo($('#stripCount'), state.expenses.length, false);

    renderBudget();
    renderInsights();
    renderTopCategories();
    renderRecent();
  }

  // ----- Budget dialog -----
  function openBudgetDialog() {
    $('#bAmount').value = state.budget || '';
    setFieldError($('#bAmount'), '');
    openDialog($('#budgetDialog'));
    $('#bAmount').focus();
  }

  /** Check a budget typed into a box. Returns the number, or null after showing an error. */
  function readBudget(input) {
    const v = numberFrom(input.value);
    if (input.value === '') { setFieldError(input, 'Enter a monthly budget.'); return null; }
    if (!(v >= 1)) { setFieldError(input, 'The budget must be at least Rs. 1.'); return null; }
    if (v > MAX_AMOUNT) { setFieldError(input, 'That amount is too large.'); return null; }
    setFieldError(input, '');
    return cents(v);
  }

  function applyBudget(value) {
    state.budget = value;
    saveBudget();
    refreshAll();
    toast('Monthly budget set to ' + money(value) + '.', { tone: 'ok' });
  }

  /* ==========================================================
     8. ANALYTICS (Chart.js)
     ========================================================== */

  const charts = {};
  const chartReady = () => typeof window.Chart === 'function';
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /** Draw (or redraw) one chart. If Chart.js could not load, show a short message instead. */
  function drawChart(name, canvasId, fallbackId, config) {
    if (charts[name]) { charts[name].destroy(); delete charts[name]; }
    const canvas = $('#' + canvasId);
    const fallback = $('#' + fallbackId);
    if (!chartReady()) { fallback.hidden = false; canvas.hidden = true; return; }
    fallback.hidden = true;
    canvas.hidden = false;
    charts[name] = new window.Chart(canvas.getContext('2d'), config);
  }

  function destroyCharts() {
    Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; });
  }

  const chartAnimation = () => (reduceMotion ? false : { duration: 500 });

  function barOptions(showLegend) {
    const muted = cssVar('--muted');
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: chartAnimation(),
      plugins: {
        legend: { display: showLegend, labels: { color: muted, usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: (c) => ' ' + (c.dataset.label ? c.dataset.label + ': ' : '') + money(c.parsed.y) } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: muted } },
        y: { beginAtZero: true, grid: { color: cssVar('--border') }, ticks: { color: muted, callback: (v) => 'Rs. ' + fmtWhole.format(v) } }
      }
    };
  }

  /** Every month that has data, plus this month and last month, newest first. */
  function monthOptions() {
    const cur = monthKey(todayStr());
    const set = new Set([cur, shiftMonth(cur, -1)]);
    state.expenses.forEach((e) => set.add(monthKey(e.date)));
    return Array.from(set).sort().reverse();
  }

  function fillMonthSelect(select, months, value) {
    select.innerHTML = months.map((m) => '<option value="' + m + '"' + (m === value ? ' selected' : '') + '>' + monthLabel(m) + '</option>').join('');
  }

  function renderDonut() {
    const key = state.analytics.month;
    const totals = categoryTotals(key);
    const entries = CATEGORIES.map((c) => ({ c, v: totals[c.key] })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
    const total = cents(sumOf(entries.map((r) => r.v)));
    const box = $('.donut-box');
    const legend = $('#donutLegend');

    if (!entries.length) {
      if (charts.donut) { charts.donut.destroy(); delete charts.donut; }
      box.hidden = true;
      $('#donutFallback').hidden = true;
      legend.innerHTML = '<li class="legend-empty muted">No spending recorded in ' + monthLabel(key) + '.</li>';
      return;
    }
    box.hidden = false;
    legend.innerHTML = entries.map((r) =>
      '<li><span class="sw" style="background:' + r.c.color + '"></span><span class="lg-name">' + r.c.icon + ' ' + r.c.label + '</span>'
      + '<span class="lg-val"><strong>' + money(r.v) + '</strong> <span class="muted">' + Math.round(r.v / total * 100) + '%</span></span></li>').join('');
    $('#donutChart').setAttribute('aria-label', 'Spending by category in ' + monthLabel(key) + ': '
      + entries.map((r) => r.c.label + ' ' + Math.round(r.v / total * 100) + '%').join(', '));

    drawChart('donut', 'donutChart', 'donutFallback', {
      type: 'doughnut',
      data: {
        labels: entries.map((r) => r.c.label),
        datasets: [{ data: entries.map((r) => r.v), backgroundColor: entries.map((r) => r.c.color), borderColor: cssVar('--surface'), borderWidth: 3, hoverOffset: 6 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: chartAnimation(),
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + c.label + ': ' + money(c.parsed) } } }
      }
    });
  }

  function renderWeek() {
    const today = todayStr();
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));
    const values = days.map((d) => cents(sumOf(state.expenses.filter((e) => e.date === d).map((e) => e.amount))));
    const labels = days.map((d) => weekdayFormatter.format(parseYMD(d)) + ' ' + Number(d.slice(8, 10)));
    const weekTotal = cents(sumOf(values));
    $('#weekTotal').textContent = 'Total ' + money(weekTotal);
    $('#weekChart').setAttribute('aria-label', 'Spending over the last 7 days. Total ' + money(weekTotal) + '. '
      + labels.map((l, i) => l + ': ' + money(values[i])).join(', '));

    drawChart('week', 'weekChart', 'weekFallback', {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Spent', data: values, backgroundColor: values.map((_, i) => (i === values.length - 1 ? cssVar('--chart-a') : cssVar('--chart-a-soft'))), borderRadius: 8, maxBarThickness: 44 }] },
      options: barOptions(false)
    });
  }

  function renderCompare() {
    const a = state.analytics.a;
    const b = state.analytics.b;
    const cur = monthKey(todayStr());
    const prev = shiftMonth(cur, -1);
    const totalsA = categoryTotals(a);
    const totalsB = categoryTotals(b);
    const sumA = cents(sumOf(Object.values(totalsA)));
    const sumB = cents(sumOf(Object.values(totalsB)));
    const countOf = (key) => state.expenses.filter((e) => monthKey(e.date) === key).length;

    // The sentence: "This month you spent 18% more than last month."
    const rel = (key) => (key === cur ? 'this month' : key === prev ? 'last month' : '');
    const first = rel(a) ? cap(rel(a)) : 'In ' + monthLabel(a);
    const second = rel(b) ? rel(b) : 'in ' + monthLabel(b);
    let sentence;
    if (a === b) sentence = 'Pick two different months to compare.';
    else if (sumA === 0 && sumB === 0) sentence = 'No spending recorded in ' + monthLabel(a) + ' or ' + monthLabel(b) + '.';
    else if (sumB === 0) sentence = first + ' you spent ' + money(sumA) + ' and nothing ' + second + '.';
    else {
      const pct = Math.round(Math.abs(sumA - sumB) / sumB * 100);
      sentence = pct === 0 ? first + ' you spent about the same as ' + second + '.'
        : first + ' you spent ' + pct + '% ' + (sumA > sumB ? 'more' : 'less') + ' than ' + second + '.';
    }
    if ((a === cur || b === cur) && a !== b) sentence += ' This month is not over yet, so the gap may change.';
    $('#compareSentence').textContent = sentence;

    $('#compareTotals').innerHTML =
      '<div class="compare-total a"><span class="muted">' + monthLabel(a) + '</span><strong>' + money(sumA) + '</strong><span class="muted">' + countOf(a) + ' expenses</span></div>'
      + '<div class="compare-total b"><span class="muted">' + monthLabel(b) + '</span><strong>' + money(sumB) + '</strong><span class="muted">' + countOf(b) + ' expenses</span></div>';

    const cats = CATEGORIES.filter((c) => totalsA[c.key] > 0 || totalsB[c.key] > 0);
    const box = $('.compare-box');
    if (!cats.length) {
      if (charts.compare) { charts.compare.destroy(); delete charts.compare; }
      box.hidden = true;
      $('#compareFallback').hidden = true;
      return;
    }
    box.hidden = false;
    $('#compareChart').setAttribute('aria-label', 'Spending by category: ' + monthLabel(a) + ' compared with ' + monthLabel(b) + '. ' + sentence);
    drawChart('compare', 'compareChart', 'compareFallback', {
      type: 'bar',
      data: {
        labels: cats.map((c) => c.label),
        datasets: [
          { label: monthLabel(a), data: cats.map((c) => totalsA[c.key]), backgroundColor: cssVar('--chart-a'), borderRadius: 6, maxBarThickness: 32 },
          { label: monthLabel(b), data: cats.map((c) => totalsB[c.key]), backgroundColor: cssVar('--chart-b'), borderRadius: 6, maxBarThickness: 32 }
        ]
      },
      options: barOptions(true)
    });
  }

  function renderAnalytics() {
    const hasData = state.expenses.length > 0;
    $('#analyticsEmpty').hidden = hasData;
    $('#analyticsBody').hidden = !hasData;
    if (!hasData) {
      destroyCharts();
      $('#analyticsEmpty').innerHTML = emptyStateHTML();
      return;
    }
    const months = monthOptions();
    const cur = monthKey(todayStr());
    ['month', 'a', 'b'].forEach((k) => { if (!months.includes(state.analytics[k])) state.analytics[k] = k === 'b' ? shiftMonth(cur, -1) : cur; });
    fillMonthSelect($('#aMonth'), months, state.analytics.month);
    fillMonthSelect($('#cmpA'), months, state.analytics.a);
    fillMonthSelect($('#cmpB'), months, state.analytics.b);
    if (chartReady() && window.Chart.defaults) {
      window.Chart.defaults.font.family = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
      window.Chart.defaults.color = cssVar('--muted');
    }
    renderDonut();
    renderWeek();
    renderCompare();
  }

  function bindAnalytics() {
    $('#aMonth').addEventListener('change', (e) => { state.analytics.month = e.target.value; renderDonut(); });
    $('#cmpA').addEventListener('change', (e) => { state.analytics.a = e.target.value; renderCompare(); });
    $('#cmpB').addEventListener('change', (e) => { state.analytics.b = e.target.value; renderCompare(); });
  }

  /* ==========================================================
     9. SETTINGS: THEME, BUDGET, CSV EXPORT, SAMPLE DATA
     ========================================================== */

  let currentView = '';

  function setTheme(theme, persist) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    const dark = state.theme === 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    $('#themeToggle').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    $('#darkSwitch').setAttribute('aria-checked', String(dark));
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0b1020' : '#f6f7fb');
    if (persist) savePrefs();
    if (currentView === 'analytics' && state.expenses.length) { renderDonut(); renderWeek(); renderCompare(); }   // charts need new colours
  }

  function renderSettings() {
    $('#setBudget').value = state.budget || '';
    $('#removeBudgetBtn').disabled = !state.budget;
    $('#exportBtn').disabled = state.expenses.length === 0;
    $('#clearAllBtn').disabled = !state.expenses.length && !state.bills.length && !state.budget;

    const hasSample = state.expenses.some((e) => e.sample);
    const none = state.expenses.length === 0;
    $('#sampleRow').hidden = !(hasSample || none);
    const btn = $('#sampleBtn');
    if (hasSample) {
      $('#sampleText').textContent = 'You are looking at example expenses. Remove them when you are ready to add your own.';
      btn.textContent = 'Remove sample data';
      btn.dataset.action = 'remove-sample';
    } else {
      $('#sampleText').textContent = 'Fill the app with example expenses to see how it looks. You can remove them any time.';
      btn.textContent = 'Load sample data';
      btn.dataset.action = 'load-sample';
    }
  }

  /** Example entries for the last two months, so every screen has something to show. */
  function sampleExpenses() {
    const today = todayStr();
    const rows = [
      [0, 'food', 'Lunch', 350], [0, 'transport', 'Bus fare', 80],
      [1, 'food', 'Momo with friends', 420], [1, 'subscriptions', 'Netflix', 450],
      [2, 'bills', 'Electricity bill', 1250], [2, 'food', 'Groceries', 2300],
      [3, 'entertainment', 'Movie ticket', 600], [3, 'food', 'Tea and snacks', 150],
      [4, 'transport', 'Ride to office', 220], [5, 'health', 'Pharmacy', 480],
      [6, 'education', 'Online course', 1500], [7, 'food', 'Dinner out', 900],
      [8, 'subscriptions', 'Music app', 250], [9, 'work', 'Coworking day pass', 500],
      [10, 'shopping', 'Shoes', 3200], [11, 'transport', 'Fuel', 1000],
      [12, 'food', 'Breakfast', 180], [13, 'bills', 'Internet bill', 1100],
      [15, 'entertainment', 'Futsal with friends', 800], [17, 'food', 'Groceries', 1900],
      [19, 'health', 'Doctor visit', 1000], [21, 'other', 'Gift for a friend', 1500],
      [24, 'transport', 'Bus fare', 60], [27, 'food', 'Lunch', 300],
      [29, 'shopping', 'Backpack', 2200], [32, 'bills', 'Electricity bill', 1180],
      [34, 'food', 'Groceries', 2100], [36, 'subscriptions', 'Netflix', 450],
      [38, 'entertainment', 'Concert ticket', 1500], [40, 'transport', 'Fuel', 900],
      [43, 'bills', 'Internet bill', 1100], [45, 'education', 'Textbooks', 2400],
      [48, 'food', 'Dinner out', 1100], [52, 'health', 'Pharmacy', 350], [55, 'shopping', 'Clothes', 2700]
    ];
    return rows.map((r) => ({ id: uid(), amount: r[3], category: r[1], description: r[2], date: addDays(today, -r[0]), sample: true }));
  }

  function loadSample() {
    if (state.expenses.length) { toast('Sample data can only be added when you have no expenses.'); return; }
    state.expenses = sampleExpenses();
    saveExpenses();
    refreshAll();
    toast('Sample data loaded. Remove it any time in Settings.', { tone: 'ok' });
  }

  function removeSample() {
    state.expenses = state.expenses.filter((e) => !e.sample);
    saveExpenses();
    refreshAll();
    toast('Sample data removed.');
  }

  // ----- CSV export -----
  /** One CSV cell. Quotes are doubled, and a leading = + - @ is neutralised so spreadsheets can't run it as a formula. */
  function csvCell(value) {
    let s = String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCSV() {
    if (!state.expenses.length) { toast('Nothing to export yet. Add an expense first.'); return; }
    const rows = [['Date', 'Category', 'Description', 'Amount (Rs.)']];
    state.expenses.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((e) => {
      rows.push([e.date, CAT[e.category].label, e.description, e.amount.toFixed(2)]);
    });
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');   // BOM so Excel reads UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pocketnepal-expenses-' + todayStr() + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Exported ' + state.expenses.length + ' expense' + (state.expenses.length === 1 ? '' : 's') + ' to CSV.', { tone: 'ok' });
  }

  async function clearAllData() {
    const ok = await confirmAction({
      title: 'Clear all data?',
      message: 'This permanently deletes all your expenses, your budget and your bill history from this browser. It cannot be undone. Tip: export a CSV first if you want a backup.',
      confirmText: 'Yes, delete everything'
    });
    if (!ok) return;
    removeStore(KEYS.expenses);
    removeStore(KEYS.budget);
    removeStore(KEYS.bills);
    state.expenses = [];
    state.bills = [];
    state.budget = 0;
    clearFilters();
    renderHistory();
    refreshAll();
    toast('All data cleared.');
  }

  function bindSettings() {
    $('#themeToggle').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark', true));
    $('#darkSwitch').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark', true));

    $('#budgetForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = readBudget($('#bAmount'));
      if (v === null) { $('#bAmount').focus(); return; }
      $('#budgetDialog').close();
      applyBudget(v);
    });
    $('#settingsBudgetForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = readBudget($('#setBudget'));
      if (v === null) { $('#setBudget').focus(); return; }
      applyBudget(v);
    });
    $('#removeBudgetBtn').addEventListener('click', () => {
      state.budget = 0;
      saveBudget();
      refreshAll();
      toast('Budget removed.');
    });

    $('#exportBtn').addEventListener('click', exportCSV);
    $('#clearAllBtn').addEventListener('click', clearAllData);
  }

  /* ==========================================================
     10. NAVIGATION AND START-UP
     ========================================================== */

  const VIEWS = { dashboard: 'Dashboard', splitter: 'Bill Splitter', expenses: 'Expenses', analytics: 'Analytics', settings: 'Settings' };
  const currentHash = () => { const h = location.hash.replace('#', ''); return VIEWS[h] ? h : 'dashboard'; };

  function showView(name, initial) {
    currentView = name;
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
    $$('[data-nav]').forEach((a) => {
      if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = VIEWS[name] + ' | PocketNepal';

    if (name === 'dashboard') renderDashboard();
    if (name === 'expenses') renderExpenseList();
    if (name === 'analytics') renderAnalytics();
    if (name === 'settings') renderSettings();

    if (!initial) {
      window.scrollTo(0, 0);
      const heading = $('#view-' + name + ' h1');
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  /** Re-draw everything that depends on your data. */
  function refreshAll() {
    renderDashboard();
    renderExpenseList();
    renderSettings();
    if (currentView === 'analytics') renderAnalytics();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    if (action === 'add-expense') openExpenseDialog();
    else if (action === 'edit-budget') openBudgetDialog();
    else if (action === 'load-sample') loadSample();
    else if (action === 'remove-sample') removeSample();
    else if (action === 'clear-filters') clearFilters();
  });

  function init() {
    loadAll();
    const cur = monthKey(todayStr());
    state.analytics = { month: cur, a: cur, b: shiftMonth(cur, -1) };
    $('#year').textContent = new Date().getFullYear();

    bindExpenses();
    bindSplitter();
    bindAnalytics();
    bindSettings();
    setTheme(state.theme, false);

    window.addEventListener('hashchange', () => showView(currentHash(), false));
    showView(currentHash(), true);
    refreshAll();

    // Another tab changed the data: pick it up.
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.indexOf('pocketnepal.') !== 0) return;
      loadAll();
      setTheme(state.theme, false);
      renderHistory();
      refreshAll();
    });

    // Left open overnight? Refresh the "today" numbers when you come back.
    let lastDay = todayStr();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || todayStr() === lastDay) return;
      lastDay = todayStr();
      refreshAll();
    });
  }

  init();
})();
