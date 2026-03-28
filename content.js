// ─────────────────────────────────────────────────────────────────────────────
// Guard against duplicate injection and missing document.head.
// ─────────────────────────────────────────────────────────────────────────────
if (!document.getElementById("wp-global-style")) {
    const globalStyles = document.createElement("style");
    globalStyles.id = "wp-global-style";
    globalStyles.textContent = `
        /* Hide native YouTube chrome while our player is active */
        .webplayer-active .ytp-chrome-top,
        .webplayer-active .ytp-chrome-bottom,
        .webplayer-active .ytp-progress-bar-container,
        .webplayer-active .ytp-gradient-bottom,
        .webplayer-active .ytp-gradient-top,
        .webplayer-active .ytp-iv-video-content {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
            visibility: hidden !important;
        }
    `;
    (document.head || document.documentElement).appendChild(globalStyles);
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart visible-video detection — skips hidden/off-screen elements.
// ─────────────────────────────────────────────────────────────────────────────
function findVideos() {
    try {
        [...document.querySelectorAll("video")]
            .filter(v => {
                if (v.offsetParent !== null) return true;
                const r = v.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            })
            .forEach(video => {
                if (!video.dataset.hasCustomPlayerButton) {
                    addPlayerButton(video);
                    video.dataset.hasCustomPlayerButton = "true";
                }
            });
    } catch (err) {
        console.warn("[WebPlayer] findVideos error:", err);
    }
}

function addPlayerButton(videoElement) {
    if (!videoElement || !videoElement.parentElement) return;

    const btn = document.createElement("button");
    btn.innerText = "▶ Launch WebPlayer UI";
    btn.className = "custom-player-overlay-btn";

    btn.addEventListener("click", e => {
        e.preventDefault();
        btn.style.display = "none";
        injectCustomPlayer(videoElement, btn);
    });

    if (getComputedStyle(videoElement.parentElement).position === "static") {
        videoElement.parentElement.style.position = "relative";
    }
    videoElement.parentElement.appendChild(btn);
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe forward-seek helper — guards NaN and Infinity durations.
// ─────────────────────────────────────────────────────────────────────────────
function safeSeekForward(video, seconds) {
    const target = video.currentTime + seconds;
    video.currentTime = Number.isFinite(video.duration)
        ? Math.min(video.duration, target)
        : target;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main player injection
// ─────────────────────────────────────────────────────────────────────────────
function injectCustomPlayer(video, launchBtn) {
    if (!video) return;
    if (video.dataset.customPlayerActive) return;

    video.dataset.customPlayerActive = "true";
    video.controls = false;
    document.body.classList.add("webplayer-active");

    // ── BUG FIX 1: THE GHOST VIDEO KILL-SWITCH ────────────────────────────────
    // Physically prevent the video element from receiving events. This stops
    // Chrome's hardcoded Shadow DOM double-tap bug from crashing the renderer.
    // The user interacts safely with our gestureZone overlay instead.
    video.dataset.originalPointerEvents = video.style.pointerEvents || "";
    video.style.setProperty("pointer-events", "none", "important");
    // ──────────────────────────────────────────────────────────────────────────

    // ── Dedicated fullscreen shell ────────────────────────────────────────────
    const wpShell = document.createElement("div");
    wpShell.className = "wp-fs-shell";
    // Force touch-action none directly on the shell to block native zoom
    wpShell.style.touchAction = "none"; 
    video.parentElement.insertBefore(wpShell, video);
    wpShell.appendChild(video);

    // ── UI shell ──────────────────────────────────────────────────────────────
    const uiWrapper = document.createElement("div");
    uiWrapper.className = "webplayer-ui-wrapper";
    uiWrapper.innerHTML = `
        <div class="wp-progress-row">
            <div class="wp-time-block">
                <span id="wp-time-cur">0:00</span>
                <span class="wp-time-sep"> / </span>
                <span id="wp-time-dur">--:--</span>
            </div>
            <input type="range" id="wp-progress" min="0" max="100" step="0.1" value="0"
                   aria-label="Seek">
            <span id="wp-time-rem" style="color:#666;min-width:44px;text-align:right"></span>
        </div>
        <div class="wp-center-row">
            <button id="wp-skip-back"  title="Back 10s">⏮ 10</button>
            <button id="wp-play"       title="Play / Pause">⏸</button>
            <button id="wp-skip-fwd"   title="Forward 10s">10 ⏭</button>

            <select id="wp-speed" title="Playback Speed" aria-label="Playback speed">
                <option value="0.5">0.5×</option>
                <option value="1" selected>1×</option>
                <option value="1.25">1.25×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
            </select>

            <button id="wp-pip"    title="Picture in Picture">⧉</button>
            <button id="wp-fs"     title="Fullscreen">⛶</button>
            <button id="wp-rotate" title="Rotate video">↻</button>
            <button id="wp-exit"   title="Exit WebPlayer">✕</button>
        </div>
    `;

    // Buffering spinner
    const spinner = document.createElement("div");
    spinner.className = "webplayer-spinner";

    // Feedback pill
    const feedbackOverlay = document.createElement("div");
    feedbackOverlay.className = "webplayer-feedback";

    // Gesture zone
    const gestureZone = document.createElement("div");
    gestureZone.className = "webplayer-gesture-zone";
    gestureZone.style.touchAction = "none"; 
    gestureZone.style.userSelect = "none";

    // ── BUG FIX 2: GLOBAL CAPTURE EVENT SHIELD ────────────────────────────────
    // Intercept double-taps at the absolute highest level (window) before the 
    // host website's scripts (like YouTube) can detect them and crash our layout.
    const globalEventShield = (e) => {
        if (wpShell.contains(e.target) || gestureZone.contains(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
    };
    window.addEventListener("dblclick", globalEventShield, true);
    // ──────────────────────────────────────────────────────────────────────────

    // ── rAF position tracker ─────────────────────────────────────────────────
    let isTracking = true;
    let rafId      = null;

    function trackVideoPosition() {
        if (!isTracking) return;

        const targetContainer = document.fullscreenElement || document.body;
        if (uiWrapper.parentNode !== targetContainer) {
            targetContainer.appendChild(gestureZone);
            targetContainer.appendChild(spinner);
            targetContainer.appendChild(uiWrapper);
            targetContainer.appendChild(feedbackOverlay);
        }

        const rect = video.getBoundingClientRect();

        gestureZone.style.left   = `${rect.left}px`;
        gestureZone.style.top    = `${rect.top}px`;
        gestureZone.style.width  = `${rect.width}px`;
        gestureZone.style.height = `${rect.height}px`;

        spinner.style.left = `${rect.left + rect.width  / 2}px`;
        spinner.style.top  = `${rect.top  + rect.height / 2}px`;

        let uiX = rect.left + rect.width / 2;
        let uiY = rect.bottom - uiWrapper.offsetHeight - 20;
        uiX = Math.max(uiWrapper.offsetWidth / 2 + 10,
                       Math.min(uiX, window.innerWidth - uiWrapper.offsetWidth / 2 - 10));
        uiY = Math.max(10, Math.min(uiY, window.innerHeight - uiWrapper.offsetHeight - 10));
        uiWrapper.style.left = `${uiX}px`;
        uiWrapper.style.top  = `${uiY}px`;

        let feedX = rect.left + rect.width / 2;
        let feedY = rect.top + rect.height * 0.15;
        feedX = Math.max(feedbackOverlay.offsetWidth / 2 + 10,
                         Math.min(feedX, window.innerWidth - feedbackOverlay.offsetWidth / 2 - 10));
        feedY = Math.max(10, Math.min(feedY, window.innerHeight - feedbackOverlay.offsetHeight - 10));
        feedbackOverlay.style.left = `${feedX}px`;
        feedbackOverlay.style.top  = `${feedY}px`;

        rafId = requestAnimationFrame(trackVideoPosition);
    }
    trackVideoPosition();

    // ── Auto-hide controls ────────────────────────────────────────────────────
    const AUTO_HIDE_MS = 3000;
    let hideTimer = null;

    function showControls() {
        uiWrapper.classList.add("wp-controls-visible");
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            uiWrapper.classList.remove("wp-controls-visible");
        }, AUTO_HIDE_MS);
    }

    gestureZone.addEventListener("pointermove", showControls, { passive: true });
    uiWrapper.addEventListener("pointermove", showControls, { passive: true });
    gestureZone.addEventListener("pointerdown", showControls, { passive: true });

    showControls();

    // ── Feedback pill ─────────────────────────────────────────────────────────
    let feedbackTimer = null;
    function showFeedback(text, keepAlive = false) {
        feedbackOverlay.innerText     = text;
        feedbackOverlay.style.opacity = "1";
        if (!keepAlive) {
            clearTimeout(feedbackTimer);
            feedbackTimer = setTimeout(() => {
                feedbackOverlay.style.opacity = "0";
            },
