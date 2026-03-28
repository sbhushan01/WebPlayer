(() => {
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

        // ── GLOBAL CAPTURE EVENT SHIELD ───────────────────────────────────────────
        const globalEventShield = (e) => {
            if (wpShell?.contains(e.target) || gestureZone?.contains(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        };
        window.addEventListener("dblclick", globalEventShield, true);

        // ── rAF position tracker ─────────────────────────────────────────────────
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
            } catch (err) {
                // Ignore benign frame calculation errors
            }

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
        uiWrapper.addEventListener("pointermove", showControls, { passive: true });
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
            if (rafId)       cancelAnimationFrame(rafId);
            clearTimeout(feedbackTimer);
            clearTimeout(hideTimer);

            try {
                if (wpShell?.parentNode) {
                    wpShell.parentNode.insertBefore(video, wpShell);
                    wpShell.remove();
                }

                if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                }

                video.dataset.customPlayerActive = "";
                video.controls = true;
                video.style.transform  = "";
                video.style.filter     = "";
                
                if (video.style) {
                    video.style.pointerEvents = video.dataset.originalPointerEvents || "";
                }
                
                document.body.classList.remove("webplayer-active");

                Object.entries(videoListeners).forEach(([evt, fn]) => {
                    video.removeEventListener(evt, fn);
                });
                document.removeEventListener("fullscreenchange", onFullscreenChange);
                window.removeEventListener("dblclick", globalEventShield, true);

                gestureZone.removeEventListener("pointerdown",   handlePointerDown);
                gestureZone.removeEventListener("pointermove",   handlePointerMove);
                gestureZone.removeEventListener("pointerup",     handlePointerUp);
                gestureZone.removeEventListener("pointercancel", handlePointerUp);

                gestureZone.remove();
                spinner.remove();
                uiWrapper.remove();
                feedbackOverlay.remove();

                if (launchBtn) launchBtn.style.display = "block";
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

        function safeUpdateText(element, text) {
            if (element) element.innerText = text;
        }

        progress?.addEventListener("mousedown",  () => { isDragging = true; });
        progress?.addEventListener("touchstart", () => { isDragging = true; }, { passive: true });
        progress?.addEventListener("mouseup",    () => { isDragging = false; });
        progress?.addEventListener("touchend",   () => { isDragging = false; }, { passive: true });

        progress?.addEventListener("input", e => {
            try {
                if (Number.isFinite(video.duration) && video.duration > 0) {
                    video.currentTime = (e.target.value / 100) * video.duration;
                    safeUpdateText(timeCur, formatTime(video.currentTime));
                }
            } catch (err) {
                console.warn("Input error:", err);
            }
        });

        videoListeners.timeupdate = () => {
            try {
                if (!Number.isFinite(video.duration) || isDragging) return;
                const pct = (video.currentTime / video.duration) * 100;
                if (progress) progress.value = pct;
                
                safeUpdateText(timeCur, formatTime(video.currentTime));
                safeUpdateText(timeDur, formatTime(video.duration));
                const rem = video.duration - video.currentTime;
                safeUpdateText(timeRem, rem > 0 ? `-${formatTime(rem)}` : "");
            } catch (e) {
                // Silently catch timeupdate iteration crashes
            }
        };
        video.addEventListener("timeupdate", videoListeners.timeupdate);

        videoListeners.loadedmetadata = () => {
            try {
                safeUpdateText(timeDur, Number.isFinite(video.duration) ? formatTime(video.duration) : "Live");
            } catch (e) {}
        };
        video.addEventListener("loadedmetadata", videoListeners.loadedmetadata);

        videoListeners.waiting = () => setBuffering(true);
        videoListeners.playing = () => setBuffering(false);
        videoListeners.canplay = () => setBuffering(false);
        video.addEventListener("waiting", videoListeners.waiting);
        video.addEventListener("playing", videoListeners.playing);
        video.addEventListener("canplay", videoListeners.canplay);

        videoListeners.error = () => {
            setBuffering(false);
            const msgs = { 1: "⚠️ Aborted", 2: "⚠️ Network error", 3: "⚠️ Decode error", 4: "⚠️ Unsupported" };
            const code = video.error ? video.error.code : 0;
            showFeedback(msgs[code] || "⚠️ Video error", true);
        };
        video.addEventListener("error", videoListeners.error);

        // ── Play / Pause ──────────────────────────────────────────────────────────
        const playBtn = uiWrapper.querySelector("#wp-play");

        videoListeners.play  = () => { safeUpdateText(playBtn, "⏸"); };
        videoListeners.pause = () => {
            safeUpdateText(playBtn, "▶");
            showControls(); 
        };
        video.addEventListener("play",  videoListeners.play);
        video.addEventListener("pause", videoListeners.pause);

        playBtn?.addEventListener("click", () => {
            try { video.paused ? video.play() : video.pause(); }
            catch (err) { console.warn("[WebPlayer] play/pause:", err); }
        });

        uiWrapper.querySelector("#wp-skip-back")?.addEventListener("click", () => {
            try { video.currentTime = Math.max(0, video.currentTime - 10); } catch(e){}
            showFeedback("⏪ −10s");
        });
        
        uiWrapper.querySelector("#wp-skip-fwd")?.addEventListener("click", () => {
            safeSeekForward(video, 10);
            showFeedback("⏩ +10s");
        });

        uiWrapper.querySelector("#wp-speed")?.addEventListener("change", e => {
            try { video.playbackRate = parseFloat(e.target.value); } catch(e){}
            showFeedback(`⚡ ${e.target.value}×`);
        });

        uiWrapper.querySelector("#wp-pip")?.addEventListener("click", async () => {
            try {
                document.pictureInPictureElement
                    ? await document.exitPictureInPicture()
                    : await video.requestPictureInPicture();
            } catch (err) {
                console.warn("[WebPlayer] PiP:", err);
                showFeedback("⚠️ PiP unavailable");
            }
        });

        uiWrapper.querySelector("#wp-fs")?.addEventListener("click", () => {
            try {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                } else {
                    (wpShell.requestFullscreen?.() ?? video.requestFullscreen?.());
                }
            } catch (err) {
                console.warn("[WebPlayer] Fullscreen:", err);
            }
        });

        let currentRotation = 0;
        uiWrapper.querySelector("#wp-rotate")?.addEventListener("click", () => {
            if (document.fullscreenElement) return;
            currentRotation = (currentRotation + 90) % 360;
            video.style.transform  = `rotate(${currentRotation}deg)`;
            video.style.transition = "transform 0.3s ease";
            showFeedback(`↻ ${currentRotation}°`);
        });

        // ─────────────────────────────────────────────────────────────────────────
        // GESTURE ENGINE (Converted to hoisted functions)
        // ─────────────────────────────────────────────────────────────────────────
        let pressTimer         = null;
        let isLongPressing     = false;
        let isPointerDown      = false;
        let gestureActionTaken = false;
        let originalSpeed      = 1.0;

        let startX = 0, startY = 0, lastY = 0;
        let lastTapTime = 0, lastTapX = 0;
        let swipeDirection    = null;
        let currentBrightness = 1.0;
        let gestureThrottleTimer = null;

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
                    showFeedback("⚡ 2× Speed", true);
                }, 500);
            } catch (err) {}
        }

        function handlePointerMove(e) {
            try {
                e.preventDefault();
                e.stopPropagation();

                if (!isPointerDown) return;

                const diffX = e.clientX - startX;
                const diffY = e.clientY - startY;

                if (isLongPressing) return; 

                if (Math.abs(diffX) > 15 || Math.abs(diffY) > 15) {
                    clearTimeout(pressTimer);
                }

                if (!swipeDirection) {
                    if (Math.abs(diffX) > 20) {
                        swipeDirection     = "horizontal";
                        gestureActionTaken = true;
                    } else if (Math.abs(diffY) > 20) {
                        swipeDirection     = "vertical";
                        gestureActionTaken = true;
                    }
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
                            showFeedback(`🔊 ${Math.round(video.volume * 100)}%`, true);
                        } catch (_) {}
                    } else {
                        currentBrightness  = Math.max(0.1, Math.min(2.5, currentBrightness - deltaY * 0.01));
                        video.style.filter = `brightness(${currentBrightness})`;
                        showFeedback(`☀️ ${Math.round(currentBrightness * 100)}%`, true);
                    }

                    gestureThrottleTimer = setTimeout(() => { gestureThrottleTimer = null; }, 50);
                }
            } catch (err) {}
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
                    isLongPressing                = false;
                    if (feedbackOverlay) feedbackOverlay.style.opacity = "0";
                    return;
                }

                if (swipeDirection === "vertical") {
                    if (feedbackOverlay) feedbackOverlay.style.opacity = "0";
                    return;
                }

                if (swipeDirection === "horizontal") {
                    if (Math.abs(diffX) > 40) {
                        if (diffX > 0) {
                            safeSeekForward(video, 10);
                            showFeedback("⏩ +10s");
                        } else {
                            video.currentTime = Math.max(0, video.currentTime - 10);
                            showFeedback("⏪ −10s");
                        }
                    }
                    return;
                }

                // ── Custom Double-tap Engine ──────────────────────────────────────────
                if (!gestureActionTaken) {
                    const tapTimeDiff = currentMs  - lastTapTime;
                    const tapDistDiff = Math.abs(currentX - lastTapX);

                    if (tapTimeDiff < 300 && tapDistDiff < 40) {
                        if (relativeX < leftZone) {
                            video.currentTime = Math.max(0, video.currentTime - 10);
                            showFeedback("⏪ −10s");
                        } else if (relativeX > rightZone) {
                            safeSeekForward(video, 10);
                            showFeedback("⏩ +10s");
                        } else {
                            try {
                                if (video.paused) { video.play();  showFeedback("▶ Play");  }
                                else              { video.pause(); showFeedback("⏸ Pause"); }
                            } catch (err) {}
                        }
                        lastTapTime = 0; 
                    } else {
                        lastTapTime = currentMs;
                        lastTapX    = currentX;
                    }
                }
            } catch (err) {}
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

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener("DOMContentLoaded", () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }
})();
