// ──────────────────────────────────────────────────────────────
//  welcome.js — WebPlayer Welcome Page
// ──────────────────────────────────────────────────────────────

// ── Dynamic version badge ─────────────────────────────────────
(function setVersion() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
        try {
            const v = chrome.runtime.getManifest().version;
            const badge = document.getElementById('version-badge');
            const footer = document.getElementById('footer-version');
            if (badge)  badge.textContent = `v${v}`;
            if (footer) footer.textContent = `v${v}`;
        } catch (_) { /* noop */ }
    }
})();

// ── Smooth scroll for "Get Started" CTA ───────────────────────
const getStartedBtn = document.getElementById('get-started-btn');
const howToUseSection = document.getElementById('how-to-use');
if (getStartedBtn && howToUseSection) {
    getStartedBtn.addEventListener('click', (e) => {
        e.preventDefault();
        howToUseSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// ── Intersection Observer – stagger animations on scroll ──────
const animatedElements = document.querySelectorAll(
    '.feature-card, .mode-card, .shortcut-row, .gesture-row, .shortcuts-panel, .browser-item'
);

if (animatedElements.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    animatedElements.forEach((el, i) => {
        el.style.animationPlayState = 'paused';
        el.style.animationDelay = `${i * 0.05}s`;
        observer.observe(el);
    });
}

// ── Floating particle background ──────────────────────────────
(function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h;
    const particles = [];
    const PARTICLE_COUNT = 50;
    const MAX_SPEED = 0.3;

    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: Math.random() * 1.5 + 0.5,
            dx: (Math.random() - 0.5) * MAX_SPEED,
            dy: (Math.random() - 0.5) * MAX_SPEED,
            alpha: Math.random() * 0.3 + 0.05,
        });
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);
        for (const p of particles) {
            p.x += p.dx;
            p.y += p.dy;
            if (p.x < 0) p.x = w;
            if (p.x > w) p.x = 0;
            if (p.y < 0) p.y = h;
            if (p.y > h) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(168, 199, 250, ${p.alpha})`;
            ctx.fill();
        }
        requestAnimationFrame(draw);
    }

    // Respect prefers-reduced-motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!motionQuery.matches) {
        draw();
    }
})();
