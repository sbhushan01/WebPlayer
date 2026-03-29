(() => {
    // ─────────────────────────────────────────────────────────────────────────────
    // Guard against duplicate injection.
    // ─────────────────────────────────────────────────────────────────────────────
    if (window.__webPlayerInjected) return;
    window.__webPlayerInjected = true;

    if (!document.getElementById("wp-global-style")) {
        const globalStyles = document.createElement("style");
        globalStyles.id = "wp-global-style";
        globalStyles.textContent = `
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
    // SVG icon constants
    // ─────────────────────────────────────────────────────────────────────────────
    const IC = {
        play: `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true"><path d="M8 5.14v14l11-7-11-7z"/></svg>`,
        pause: `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>`,
        skipBack: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
          <path d="M12 5V2L8 6l4 4V7c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5H5c0 3.87 3.13 7 7 7s7-3.13 7-7-3.13-7-7-7z"/>
          <text x="12" y="15" text-anchor="middle" font-size="5.5" font-family="system-ui,sans-serif" font-weight="800">10</text>
        </svg>`,
        skipFwd: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
          <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z"/>
          <text x="12" y="15" text-anchor="middle" font-size="5.5" font-family="system-ui,sans-serif" font-weight="800">10</text>
        </svg>`,
        pip: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.99 2 1.99h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"/></svg>`,
        fullscreen: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`,
        rotate: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>`,
        close: `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
        launch: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true" style="vertical-align:-2px;margin-right:5px"><path d="M8 5.14v14l11-7-11-7z"/></svg>`,
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // Button registry — maps each video element to its launch button.
    // ─────────────────────────────────────────────────────────────────────────────
    const buttonRegistry = new WeakMap();

    // ─────────────────────────────────────────────────────────────────────────────
    // findVideos — scans for visible videos not yet registered.
    // ─────────────────────────────────────────────────────────────────────────────
    function findVideos() {
        try {
            document.querySelectorAll("video").forEach(video => {
                if (buttonRegistry.has(video)) return;
                const r = video.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return;
                addPlayerButton(video);
            });
        } catch (err) {
            console.warn("[WebPlayer] findVideos error:", err);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // addPlayerButton
    // ─────────────────────────────────────────────────────────────────────────────
    function addPlayerButton(video) {
        const btn = document.createElement("button");
        btn.innerHTML = `${IC.launch}Launch WebPlayer`;
        btn.className = "custom-player-overlay-btn";
        document.body.appendChild(btn);

        function positionBtn() {
            try {
                const r = video.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0 || !document.contains(video)) {
                    btn.style.display = "none";
                    return;
                }
                btn.style.display = "";
                btn.style.left    = `${r.left + 10}px`;
                btn.style.top     = `${r.top  + 10}px`;
            } catch (_) {}
        }

        let rafId = requestAnimationFrame(function loop() {
            positionBtn();
            rafId = requestAnimationFrame(loop);
        });

        function cleanup() {
            cancelAnimationFrame(rafId);
            btn.remove();
            buttonRegistry.delete(video);
        }

        btn.addEventListener("click", e => {
            e.preventDefault();
            cleanup();
            injectCustomPlayer(video);
        });

        buttonRegistry.set(video, { btn, cleanup });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Safe forward-seek helper
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
    function injectCustomPlayer(video) {
        if (!video || !video.parentElement) return;
        if (video.dataset.customPlayerActive) return;

        video.dataset.customPlayerActive = "true";
        video.controls = false;
        document.body.classList.add("webplayer-active");

        if (video.style) {
            video.dataset.originalPointerEvents = video.style.pointerEvents || "";
            video.style.setProperty("pointer-events", "none", "important");
        }

        // ── Fullscreen shell ──────────────────────────────────────────────────────
        const wpShell = document.createElement("div");
        wpShell.className = "wp-fs-shell";
        wpShell.style.touchAction = "none";
        video.parentElement.insertBefore(wpShell, video);
        wpShell.appendChild(video);

        // ── UI wrapper ────────────────────────────────────────────────────────────
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
                <button id="wp-skip-back" title="Back 10s" aria-label="Back 10 seconds">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
                    <path d="M12 5V2L8 6l4 4V7c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5H5c0 3.87 3.13 7 7 7s7-3.13 7-7-3.13-7-7-7z"/>
                    <text x="12" y="15" text-anchor="middle" font-size="5.5" font-family="system-ui,sans-serif" font-weight="800">10</text>
                  </svg>
                </button>
                <button id="wp-play" title="Play / Pause" aria-label="Play or pause">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>
                </button>
                <button id="wp-skip-fwd" title="Forward 10s" aria-label="Forward 10 seconds">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
                    <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z"/>
                    <text x="12" y="15" text-anchor="middle" font-size="5.5" font-family="system-ui,sans-serif" font-weight="800">10</text>
                  </svg>
                </button>
                <select id="wp-speed" title="Playback Speed" aria-label="Playback speed">
                    <option value="0.5">0.5×</option>
                    <option value="1" selected>1×</option>
                    <option value="1.25">1.25×</option>
                    <option value="1.5">1.5×</option>
                    <option value="2">2×</option>
                </select>
                <button id="wp-pip" title="Picture in Picture" aria-label="Picture in Picture">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.99 2 1.99h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"/></svg>
                </button>
                <button id="wp-fs" title="Fullscreen" aria-label="Toggle fullscreen">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                </button>
                <button id="wp-rotate" title="Rotate video" aria-label="Rotate video">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>
                </button>
                <button id="wp-exit" title="Exit WebPlayer" aria-label="Exit WebPlayer">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
            </div>
        `;

        const spinner       = document.createElement("div");
        spinner.className   = "webplayer-spinner";

        const feedbackOverlay     = document.createElement("div");
        feedbackOverlay.className = "webplayer-feedback";

        const gestureZone         = document.createElement("div");
        gestureZone.className     = "webplayer-gesture-zone";
        gestureZone.style.touchAction = "none";
        gestureZone.style.userSelect  = "none";

        // Block native dblclick from bubbling out of our shell
        const globalEventShield = (e) => {
            if (wpShell?.contains(e.target) || gestureZone?.contains(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        };
        window.addEventListener("dblclick", globalEventShield, true);

        // Block native touch gestures only if fullscreen
        const preventTouch = (e) => { 
            if (document.fullscreenElement) {
                e.preventDefault(); 
            }
        };
        gestureZone.addEventListener("touchstart",  preventTouch, { passive: false });
        gestureZone.addEventListener("touchend",    preventTouch, { passive: false });
        gestureZone.addEventListener("touchmove",   preventTouch, { passive: false });
        gestureZone.addEventListener("touchcancel", preventTouch, { passive: false });

        // ── rAF position tracker ──────────────────────────────────────────────────
        let isTracking = true;
        let rafId      = null;

        function trackVideoPosition() {
            if (!isTracking) return;
            try {
                const targetContainer = document.fullscreenElement || document.body;
                if (targetContainer && uiWrapper.parentNode !== targetContainer) {
                    targetContainer.appendChild(gestureZone);
                    targetContainer.appendChild(spinner);
                    targetContainer.appendChild(uiWrapper);
                    targetContainer.appendChild(feedbackOverlay);
                }

                const rect = video.getBoundingClientRect();

                if (document.fullscreenElement) {
                    gestureZone.style.left   = "0px";
                    gestureZone.style.top    = "0px";
                    gestureZone.style.width  = `${window.innerWidth}px`;
                    gestureZone.style.height = `${window.innerHeight}px`;
                } else {
                    gestureZone.style.left   = `${rect.left}px`;
                    gestureZone.style.top    = `${rect.top}px`;
                    gestureZone.style.width  = `${rect.width}px`;
                    gestureZone.style.height = `${rect.height}px`;
                }

                spinner.style.left = `${rect.left + rect.width  / 2}px`;
                spinner.style.top  = `${rect.top  + rect.height / 2}px`;

                let uiX = rect.left + rect.width / 2;
                let uiY = rect.bottom - uiWrapper.offsetHeight - 20;
                uiX = Math.max(uiWrapper.offsetWidth / 2 + 10,
                               Math.min(uiX, window.innerWidth  - uiWrapper.offsetWidth  / 2 - 10));
                uiY = Math.max(10,
                               Math.min(uiY, window.innerHeight - uiWrapper.offsetHeight - 10));
                uiWrapper.style.left = `${uiX}px`;
                uiWrapper.style.top  = `${uiY}px`;

                let feedX = rect.left + rect.width / 2;
                let feedY = rect.top  + rect.height * 0.15;
                feedX = Math.max(feedbackOverlay.offsetWidth / 2 + 10,
                                 Math.min(feedX, window.innerWidth  - feedbackOverlay.offsetWidth  / 2 - 10));
                feedY = Math.max(10,
                                 Math.min(feedY, window.innerHeight - feedbackOverlay.offsetHeight - 10));
                feedbackOverlay.style.left = `${feedX}px`;
                feedbackOverlay.style.top  = `${feedY}px`;
            } catch (_) {}

            rafId = requestAnimationFrame(trackVideoPosition);
        }
        trackVideoPosition();

        // ── Auto-hide controls ────────────────────────────────────────────────────
        const AUTO_HIDE_MS = 3000;
        let hideTimer = null;

        function showControls() {
            uiWrapper?.classList.add("wp-controls-visible");
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                uiWrapper?.classList.remove("wp-controls-visible");
            }, AUTO_HIDE_MS);
        }

        gestureZone.addEventListener("pointermove", showControls, { passive: true });
        uiWrapper.addEventListener("pointermove",   showControls, { passive: true });
        gestureZone.addEventListener("pointerdown", showControls, { passive: true });
        showControls();

        // ── Feedback pill ─────────────────────────────────────────────────────────
        let feedbackTimer = null;
        function showFeedback(text, keepAlive = false) {
            if (!feedbackOverlay) return;
            feedbackOverlay.innerText     = text;
            feedbackOverlay.style.opacity = "1";
            if (!keepAlive) {
                clearTimeout(feedbackTimer);
                feedbackTimer = setTimeout(() => {
                    if (feedbackOverlay) feedbackOverlay.style.opacity = "0";
                }, 800);
            }
        }

        function setBuffering(on) {
            spinner?.classList.toggle("wp-buffering", on);
        }

        const videoListeners = {};

        // ── Cleanup ───────────────────────────────────────────────────────────────
        function cleanup() {
            isTracking = false;
            if (rafId) cancelAnimationFrame(rafId);
            clearTimeout(feedbackTimer);
            clearTimeout(hideTimer);
            try {
                if (wpShell?.parentNode) {
                    wpShell.parentNode.insertBefore(video, wpShell);
                    wpShell.remove();
                }
                if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

                video.dataset.customPlayerActive = "";
                video.controls    = true;
                video.style.transform = "";
                video.style.filter    = "";
                if (video.style) {
                    video.style.pointerEvents = video.dataset.originalPointerEvents || "";
                }
                document.body.classList.remove("webplayer-active");

                Object.entries(videoListeners).forEach(([evt, fn]) => {
                    video.removeEventListener(evt, fn);
                });
                document.removeEventListener("fullscreenchange", onFullscreenChange);
                window.removeEventListener("dblclick", globalEventShield, true);

                gestureZone.removeEventListener("touchstart",  preventTouch);
                gestureZone.removeEventListener("touchend",    preventTouch);
                gestureZone.removeEventListener("touchmove",   preventTouch);
                gestureZone.removeEventListener("touchcancel", preventTouch);
                gestureZone.removeEventListener("pointerdown",   handlePointerDown);
                gestureZone.removeEventListener("pointermove",   handlePointerMove);
                gestureZone.removeEventListener("pointerup",     handlePointerUp);
                gestureZone.removeEventListener("pointercancel", handlePointerUp);

                gestureZone.remove();
                spinner.remove();
                uiWrapper.remove();
                feedbackOverlay.remove();

                window.removeEventListener("mouseup", mouseUpGlobalListener);
                window.removeEventListener("touchend", touchEndGlobalListener);

                addPlayerButton(video);
            } catch (e) {
                console.warn("[WebPlayer] Cleanup error:", e);
            }
        }

        uiWrapper.querySelector("#wp-exit")?.addEventListener("click", cleanup);

        function onFullscreenChange() {
            requestAnimationFrame(trackVideoPosition);
            showControls();
        }
        document.addEventListener("fullscreenchange", onFullscreenChange);

        // ── Progress bar ──────────────────────────────────────────────────────────
        const progress = uiWrapper.querySelector("#wp-progress");
        const timeCur  = uiWrapper.querySelector("#wp-time-cur");
        const timeDur  = uiWrapper.querySelector("#wp-time-dur");
        const timeRem  = uiWrapper.querySelector("#wp-time-rem");
        let isDragging = false;

        function formatTime(sec) {
            if (!Number.isFinite(sec) || sec < 0) return "0:00";
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60).toString().padStart(2, "0");
            return `${m}:${s}`;
        }

        function safeUpdateText(el, text) {
            if (el) el.innerText = text;
        }

        const mouseUpGlobalListener = () => { isDragging = false; };
        const touchEndGlobalListener = () => { isDragging = false; };

        progress?.addEventListener("mousedown",  () => { isDragging = true;  });
        progress?.addEventListener("touchstart", () => { isDragging = true;  }, { passive: true });
        window.addEventListener("mouseup", mouseUpGlobalListener);
        window.addEventListener("touchend", touchEndGlobalListener, { passive: true });

        progress?.addEventListener("input", e => {
            try {
                if (Number.isFinite(video.duration) && video.duration > 0) {
                    video.currentTime = (e.target.value / 100) * video.duration;
                    safeUpdateText(timeCur, formatTime(video.currentTime));
                }
            } catch (_) {}
        });

        videoListeners.timeupdate = () => {
            try {
                if (!Number.isFinite(video.duration) || isDragging) return;
                if (progress) progress.value = (video.currentTime / video.duration) * 100;
                safeUpdateText(timeCur, formatTime(video.currentTime));
                safeUpdateText(timeDur, formatTime(video.duration));
                const rem = video.duration - video.currentTime;
                safeUpdateText(timeRem, rem > 0 ? `-${formatTime(rem)}` : "");
            } catch (_) {}
        };
        video.addEventListener("timeupdate", videoListeners.timeupdate);

        videoListeners.loadedmetadata = () => {
            try {
                safeUpdateText(timeDur, Number.isFinite(video.duration)
                    ? formatTime(video.duration) : "Live");
            } catch (_) {}
        };
        video.addEventListener("loadedmetadata", videoListeners.loadedmetadata);

        videoListeners.waiting = () => setBuffering(true);
        videoListeners.playing = () => setBuffering(false);
        videoListeners.canplay = () => setBuffering(false);
        videoListeners.seeked  = () => setBuffering(false);
        video.addEventListener("waiting", videoListeners.waiting);
        video.addEventListener("playing", videoListeners.playing);
        video.addEventListener("canplay", videoListeners.canplay);
        video.addEventListener("seeked",  videoListeners.seeked);

        videoListeners.error = () => {
            setBuffering(false);
            const msgs = { 1: "Aborted", 2: "Network error", 3: "Decode error", 4: "Unsupported" };
            const code = video.error ? video.error.code : 0;
            showFeedback(msgs[code] || "Video error", true);
        };
        video.addEventListener("error", videoListeners.error);

        // ── Play / Pause ──────────────────────────────────────────────────────────
        const playBtn = uiWrapper.querySelector("#wp-play");

        videoListeners.play  = () => {
            if (playBtn) playBtn.innerHTML = IC.pause;
        };
        videoListeners.pause = () => {
            if (playBtn) playBtn.innerHTML = IC.play;
            showControls();
        };
        video.addEventListener("play",  videoListeners.play);
        video.addEventListener("pause", videoListeners.pause);

        playBtn?.addEventListener("click", () => {
            try { video.paused ? video.play() : video.pause(); }
            catch (err) { console.warn("[WebPlayer] play/pause:", err); }
        });

        uiWrapper.querySelector("#wp-skip-back")?.addEventListener("click", () => {
            try { video.currentTime = Math.max(0, video.currentTime - 10); } catch (_) {}
            showFeedback("−10s");
        });

        uiWrapper.querySelector("#wp-skip-fwd")?.addEventListener("click", () => {
            safeSeekForward(video, 10);
            showFeedback("+10s");
        });

        uiWrapper.querySelector("#wp-speed")?.addEventListener("change", e => {
            try { video.playbackRate = parseFloat(e.target.value); } catch (_) {}
            showFeedback(`${e.target.value}×`);
        });

        uiWrapper.querySelector("#wp-pip")?.addEventListener("click", async () => {
            try {
                document.pictureInPictureElement
                    ? await document.exitPictureInPicture()
                    : await video.requestPictureInPicture();
            } catch (_) {
                showFeedback("PiP unavailable");
            }
        });

        uiWrapper.querySelector("#wp-fs")?.addEventListener("click", () => {
            try {
                document.fullscreenElement
                    ? document.exitFullscreen()
                    : (wpShell.requestFullscreen?.() ?? video.requestFullscreen?.());
            } catch (_) {}
        });

        let currentRotation = 0;
        uiWrapper.querySelector("#wp-rotate")?.addEventListener("click", () => {
            if (document.fullscreenElement) return;
            currentRotation = (currentRotation + 90) % 360;
            video.style.transform  = `rotate(${currentRotation}deg)`;
            video.style.transition = "transform 0.3s ease";
            showFeedback(`${currentRotation}°`);
        });

        // ── GESTURE ENGINE ────────────────────────────────────────────────────────
        let pressTimer         = null;
        let isLongPressing     = false;
        let isPointerDown      = false;
        let gestureActionTaken = false;
        let originalSpeed      = 1.0;
        let startX = 0, startY = 0, lastY = 0;
        let lastTapTime = 0, lastTapX = 0;
        let swipeDirection       = null;
        let currentBrightness    = 1.0;
        let gestureThrottleTimer = null;

        const DOUBLE_TAP_MS = 350;
        const DOUBLE_TAP_PX = 40;

        function handlePointerDown(e) {
            try {
                e.preventDefault();
                e.stopPropagation();
                isPointerDown      = true;
                gestureActionTaken = false;
                swipeDirection     = null;
                gestureZone.setPointerCapture(e.pointerId);
                startX = e.clientX;
                startY = e.clientY;
                lastY  = e.clientY;
                originalSpeed = video.playbackRate;
                pressTimer = setTimeout(() => {
                    isLongPressing     = true;
                    gestureActionTaken = true;
                    try { video.playbackRate = 2.0; } catch (_) {}
                    showFeedback("2× Speed", true);
                }, 500);
            } catch (_) {}
        }

        function handlePointerMove(e) {
            try {
                e.preventDefault();
                e.stopPropagation();
                if (!isPointerDown || isLongPressing) return;
                const diffX = e.clientX - startX;
                const diffY = e.clientY - startY;
                if (Math.abs(diffX) > 15 || Math.abs(diffY) > 15) clearTimeout(pressTimer);
                if (!swipeDirection) {
                    if      (Math.abs(diffX) > 20) { swipeDirection = "horizontal"; gestureActionTaken = true; }
                    else if (Math.abs(diffY) > 20) { swipeDirection = "vertical";   gestureActionTaken = true; }
                }
                if (swipeDirection === "vertical" && !gestureThrottleTimer) {
                    const zoneRect  = gestureZone.getBoundingClientRect();
                    const videoMidX = zoneRect.left + zoneRect.width / 2;
                    const deltaY    = e.clientY - lastY;
                    lastY = e.clientY;
                    if (e.clientX > videoMidX) {
                        try {
                            const newVol = video.volume - deltaY * 0.005;
                            video.volume = Number(Math.max(0, Math.min(1, newVol)).toFixed(2));
                            showFeedback(`Vol ${Math.round(video.volume * 100)}%`, true);
                        } catch (_) {}
                    } else {
                        currentBrightness  = Math.max(0.1, Math.min(2.5, currentBrightness - deltaY * 0.01));
                        video.style.filter = `brightness(${currentBrightness})`;
                        showFeedback(`Brightness ${Math.round(currentBrightness * 100)}%`, true);
                    }
                    gestureThrottleTimer = setTimeout(() => { gestureThrottleTimer = null; }, 50);
                }
            } catch (_) {}
        }

        function handlePointerUp(e) {
            try {
                e.preventDefault();
                e.stopPropagation();
                if (!isPointerDown) return;
                isPointerDown = false;
                try { gestureZone.releasePointerCapture(e.pointerId); } catch (_) {}
                clearTimeout(pressTimer);

                const currentX  = e.clientX;
                const diffX     = currentX - startX;
                const currentMs = Date.now();
                const zoneRect  = gestureZone.getBoundingClientRect();
                const relativeX = currentX - zoneRect.left;
                const leftZone  = zoneRect.width * 0.33;
                const rightZone = zoneRect.width * 0.66;

                if (isLongPressing) {
                    try { video.playbackRate = originalSpeed; } catch (_) {}
                    isLongPressing = false;
                    if (feedbackOverlay) feedbackOverlay.style.opacity = "0";
                    return;
                }

                if (swipeDirection === "vertical") {
                    if (feedbackOverlay) feedbackOverlay.style.opacity = "0";
                    return;
                }

                if (swipeDirection === "horizontal") {
                    if (Math.abs(diffX) > 40) {
                        if (diffX > 0) { safeSeekForward(video, 10);                              showFeedback("+10s"); }
                        else           { video.currentTime = Math.max(0, video.currentTime - 10); showFeedback("−10s"); }
                        showControls();
                    }
                    return;
                }

                // ── Double-tap engine ─────────────────────────────────────────────
                if (!gestureActionTaken) {
                    const tapTimeDiff = currentMs - lastTapTime;
                    const tapDistDiff = Math.abs(currentX - lastTapX);
                    if (tapTimeDiff < DOUBLE_TAP_MS && tapDistDiff < DOUBLE_TAP_PX) {
                        if (relativeX < leftZone) {
                            video.currentTime = Math.max(0, video.currentTime - 10);
                            showFeedback("−10s");
                            showControls();
                        } else if (relativeX > rightZone) {
                            safeSeekForward(video, 10);
                            showFeedback("+10s");
                            showControls();
                        } else {
                            try {
                                if (video.paused) { video.play();  showFeedback("Play");  }
                                else              { video.pause(); showFeedback("Pause"); }
                            } catch (_) {}
                        }
                        lastTapTime = 0;
                    } else {
                        lastTapTime = currentMs;
                        lastTapX    = currentX;
                    }
                }
            } catch (_) {}
        }

        gestureZone.addEventListener("pointerdown",   handlePointerDown);
        gestureZone.addEventListener("pointermove",   handlePointerMove);
        gestureZone.addEventListener("pointerup",     handlePointerUp);
        gestureZone.addEventListener("pointercancel", handlePointerUp);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Bootstrap
    // ─────────────────────────────────────────────────────────────────────────────
    findVideos();

    let debounceTimer = null;
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(findVideos, 300);
    });

    const observeBody = () => observer.observe(document.body, { childList: true, subtree: true });
    if (document.body) {
        observeBody();
    } else {
        document.addEventListener("DOMContentLoaded", observeBody);
    }

    let scanCount = 0;
    const periodicScan = setInterval(() => {
        findVideos();
        if (++scanCount >= 30) clearInterval(periodicScan);
    }, 2000);

    // ── Stream detection badge ────────────────────────────────────────────────────
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "stream_detected" && msg.url) {
            // Handled by existing button infrastructure
        }
    });
})();
