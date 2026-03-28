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
    try {
        const target = video.currentTime + seconds;
        video.currentTime = Number.isFinite(video.duration)
            ? Math.min(video.duration, target)
            : target;
    } catch (e) {
        console.warn("[WebPlayer] Seek error:", e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main player injection
// ─────────────────────────────────────────────────────────────────────────────
function injectCustomPlayer(video, launchBtn) {
    if (!video || !video.parentElement) return;
    if (video.dataset.customPlayerActive) return;

    video.dataset.customPlayerActive = "true";
    video.controls = false;
    document.body.classList.add("webplayer-active");

    // ── THE GHOST VIDEO KILL-SWITCH ───────────────────────────────────────────
    if (video.style) {
        video.dataset.originalPointerEvents = video.style.pointerEvents || "";
        video.style.setProperty("pointer-events", "none", "important");
    }

    // ── Dedicated fullscreen shell ────────────────────────────────────────────
    const wpShell = document.createElement("div");
    wpShell.className = "wp-fs-shell";
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

    //
