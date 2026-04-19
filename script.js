// 1. Smooth Scroll Fade-In Effect
// This makes sections "pop" into view as you scroll down
const observerOptions = {
    threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('show');
        }
    });
}, observerOptions);

// Select all sections to apply the fade-in effect
document.querySelectorAll('section').forEach(section => {
    section.classList.add('fade-in'); // Ensure the class is there
    observer.observe(section);
});


// 2. Sticky Navbar Background Change
// This makes the navbar more solid when you start scrolling
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(2, 6, 23, 0.95)';
        navbar.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
    } else {
        navbar.style.background = 'rgba(2, 6, 23, 0.9)';
        navbar.style.boxShadow = 'none';
    }
});


// 3. Simple Dark/Light Mode Toggle (Optional)
// If you add a button with onclick="toggleMode()", this will handle it
function toggleMode() {
    const body = document.body;
    body.classList.toggle('light-mode');
    
    // Save preference to local storage so it stays on refresh
    const isLight = body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

// Check for saved theme on page load
window.onload = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }
};