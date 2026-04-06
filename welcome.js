// Smooth scroll for "Get Started" CTA
const getStartedBtn = document.getElementById('get-started-btn');
const howToUseSection = document.getElementById('how-to-use');
if (getStartedBtn && howToUseSection) {
    getStartedBtn.addEventListener('click', (e) => {
        e.preventDefault();
        howToUseSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// Stagger the feature cards on scroll using IntersectionObserver
const animatedElements = document.querySelectorAll('.feature-card, .mode-card, .shortcut-row');
if (animatedElements.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    animatedElements.forEach((el, i) => {
        el.style.animationPlayState = 'paused';
        el.style.animationDelay = `${i * 0.07}s`;
        observer.observe(el);
    });
}
