// Mark the page as JS-enabled so the CSS only hides content when reveal animations can run
document.documentElement.classList.add('js');

// 1. Scroll reveal ---------------------------------------------------------
const revealObserver = new IntersectionObserver((entries, obs) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('show');
      obs.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// 2. Navbar: solid background after scrolling ------------------------------
const navbar = document.getElementById('navbar');
const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 50);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// 3. Mobile menu -----------------------------------------------------------
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

function setMenu(open) {
  navLinks.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

navToggle.addEventListener('click', () => setMenu(!navLinks.classList.contains('open')));
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

// 4. Highlight the nav link of the section currently on screen -------------
const navAnchors = [...navLinks.querySelectorAll('a[href^="#"]')];
const sections = navAnchors
  .map(a => document.querySelector(a.getAttribute('href')))
  .filter(Boolean);

const sectionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navAnchors.forEach(a =>
        a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id)
      );
    }
  });
}, { rootMargin: '-45% 0px -50% 0px' });

sections.forEach(s => sectionObserver.observe(s));

// 5. Contact form ----------------------------------------------------------
// This site is static (GitHub Pages), so there is no server to receive the form.
// For now it opens the visitor's email app with the message pre-filled.
// To receive messages directly, swap this for a form service such as Formspree.
const CONTACT_EMAIL = 'kushalbk2002@gmail.com';
const form = document.getElementById('contactForm');
const note = document.getElementById('formNote');

form.addEventListener('submit', e => {
  e.preventDefault();

  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const message = form.message.value.trim();

  [form.name, form.email, form.message].forEach(f => f.classList.remove('invalid'));
  note.className = 'form-note';

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || !emailOk || !message) {
    if (!name) form.name.classList.add('invalid');
    if (!emailOk) form.email.classList.add('invalid');
    if (!message) form.message.classList.add('invalid');
    note.textContent = 'Please fill in your name, a valid email and a message.';
    note.classList.add('error');
    return;
  }

  const subject = encodeURIComponent('Portfolio enquiry from ' + name);
  const body = encodeURIComponent(message + '\n\n' + name + '\n' + email);
  window.location.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + subject + '&body=' + body;

  note.textContent = 'Opening your email app. If nothing happens, email me directly at ' + CONTACT_EMAIL + '.';
  note.classList.add('success');
  form.reset();
});

// 6. Footer year -----------------------------------------------------------
document.getElementById('year').textContent = new Date().getFullYear();

// 7. Sniper-scope cursor + bullet holes ------------------------------------
// A crosshair with a red dot follows the mouse. Clicking "fires": the scope
// recoils, a muzzle flash and shock ring play, and a cracked bullet hole is
// left on the page at the click point. On touch screens a tap shows the scope
// at that spot and leaves a hole (swipes and scrolls are ignored).
(function () {
  const root = document.documentElement;
  const scope = document.getElementById('scope');
  const shots = document.getElementById('shots');
  const toggle = document.getElementById('scopeToggle');
  const toggleText = document.getElementById('scopeToggleText');
  if (!scope || !shots || !toggle) return;

  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX_HOLES = 40;
  const HOLE_LIFE = 14000; // ms a hole stays before fading out

  let enabled = true;
  try { if (localStorage.getItem('scope') === 'off') enabled = false; } catch (e) { /* storage blocked */ }

  const holes = [];
  let rafId = 0, px = 0, py = 0, touchTimer = 0, ignoreClick = false, ignoreTimer = 0;

  const closest = (el, sel) => (el && el.closest) ? el.closest(sel) : null;
  const isField = (el) => closest(el, 'input, textarea, select, [contenteditable="true"]');
  const isToggle = (el) => closest(el, '#scopeToggle');
  const isClickable = (el) => closest(el, 'a, button, .btn, label, summary');
  const rand = (a, b) => a + Math.random() * (b - a);

  function applyState() {
    root.classList.toggle('scope-on', enabled && finePointer);
    toggle.setAttribute('aria-pressed', String(enabled));
    toggleText.textContent = enabled ? 'Scope: On' : 'Scope: Off';
    if (!enabled) {
      scope.classList.remove('show', 'lock', 'fire');
      holes.splice(0).forEach((h) => h.remove());
    }
  }

  function placeScope(x, y) {
    px = x; py = y;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      scope.style.setProperty('--sx', px + 'px');
      scope.style.setProperty('--sy', py + 'px');
    });
  }

  // Build a unique cracked bullet-hole graphic (jagged rim, dark core, radiating cracks)
  function buildHole(size) {
    const c = 40;
    const pt = (a, r) => (c + Math.cos(a) * r).toFixed(1) + ' ' + (c + Math.sin(a) * r).toFixed(1);

    let cracks = '';
    const n = Math.floor(rand(6, 10));
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + rand(-0.25, 0.25);
      const r1 = rand(7, 9), r2 = rand(17, 36), rm = r1 + (r2 - r1) * rand(0.45, 0.65);
      const am = a + rand(-0.14, 0.14);
      cracks += 'M' + pt(a, r1) + 'L' + pt(am, rm) + 'L' + pt(a + rand(-0.05, 0.05), r2);
      if (Math.random() < 0.6) {
        const b = am + rand(-0.8, 0.8), bl = rand(4, 10);
        const mx = c + Math.cos(am) * rm, my = c + Math.sin(am) * rm;
        cracks += 'M' + mx.toFixed(1) + ' ' + my.toFixed(1) + 'L' + (mx + Math.cos(b) * bl).toFixed(1) + ' ' + (my + Math.sin(b) * bl).toFixed(1);
      }
    }

    const ring = (count, lo, hi) => {
      const p = [];
      for (let i = 0; i < count; i++) p.push(pt((i / count) * Math.PI * 2, rand(lo, hi)));
      return 'M' + p.join('L') + 'Z';
    };
    const rim = ring(15, 6.8, 11);
    const core = ring(11, 3.4, 5.4);
    const rot = Math.floor(rand(0, 360));

    return '<svg viewBox="0 0 80 80" width="' + size + '" height="' + size + '" style="transform:rotate(' + rot + 'deg)">' +
      '<circle cx="40" cy="40" r="15" fill="rgba(0,0,0,.28)"/>' +
      '<path d="' + cracks + '" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + cracks + '" fill="none" stroke="rgba(226,232,240,.6)" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + rim + '" fill="#cbd5e1" fill-opacity=".85" stroke="rgba(0,0,0,.45)" stroke-width=".8"/>' +
      '<path d="' + core + '" fill="#04060c"/>' +
      '<path d="M33 33A10 10 0 0 1 46 31" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1" stroke-linecap="round"/>' +
      '</svg>';
  }

  function addFx(cls, x, y) {
    const el = document.createElement('div');
    el.className = cls;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    shots.appendChild(el);
    setTimeout(() => el.remove(), 600);
  }

  function shoot(clientX, clientY, pageX, pageY, pointerType) {
    // Scope position + brief display for touch
    placeScope(clientX, clientY);
    if (pointerType !== 'mouse') {
      scope.classList.add('show');
      clearTimeout(touchTimer);
      touchTimer = setTimeout(() => scope.classList.remove('show'), 700);
    }

    // Recoil, muzzle flash, shock ring
    if (!reduceMotion) {
      scope.classList.remove('fire');
      void scope.offsetWidth; // restart the animation
      scope.classList.add('fire');
      addFx('flash', pageX, pageY);
      addFx('shock', pageX, pageY);
    }

    // The bullet hole itself
    const size = Math.round(rand(46, 64));
    const hole = document.createElement('div');
    hole.className = 'hole';
    hole.style.cssText = 'left:' + pageX + 'px;top:' + pageY + 'px;width:' + size + 'px;height:' + size + 'px;margin:-' + size / 2 + 'px 0 0 -' + size / 2 + 'px';
    hole.innerHTML = buildHole(size);
    shots.appendChild(hole);
    holes.push(hole);

    while (holes.length > MAX_HOLES) holes.shift().remove();
    setTimeout(() => hole.classList.add('fade'), HOLE_LIFE);
    setTimeout(() => {
      hole.remove();
      const i = holes.indexOf(hole);
      if (i > -1) holes.splice(i, 1);
    }, HOLE_LIFE + 1700);
  }

  // Follow the mouse
  document.addEventListener('pointermove', (e) => {
    if (!enabled || e.pointerType === 'touch') return;
    placeScope(e.clientX, e.clientY);
    scope.classList.toggle('show', !isField(e.target));
    scope.classList.toggle('lock', !!isClickable(e.target));
  }, { passive: true });
  root.addEventListener('mouseleave', () => scope.classList.remove('show'));

  // Mouse: fire instantly on press
  document.addEventListener('pointerdown', (e) => {
    if (!enabled || e.pointerType !== 'mouse' || e.button !== 0) return;
    if (isField(e.target) || isToggle(e.target)) return;
    shoot(e.clientX, e.clientY, e.pageX, e.pageY, 'mouse');
    ignoreClick = true; // the click that follows belongs to this shot
    clearTimeout(ignoreTimer);
    ignoreTimer = setTimeout(() => { ignoreClick = false; }, 700);
  }, true);

  // Touch / pen: fire on tap (click), so scrolling and swiping never shoots
  document.addEventListener('click', (e) => {
    if (ignoreClick) { ignoreClick = false; return; }
    if (!enabled || e.detail === 0) return; // detail 0 = keyboard-activated
    if (isField(e.target) || isToggle(e.target)) return;
    shoot(e.clientX, e.clientY, e.pageX, e.pageY, e.pointerType || 'touch');
  }, true);

  toggle.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem('scope', enabled ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
    applyState();
  });

  applyState();
})();
