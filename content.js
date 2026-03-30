(() => {
    if (window.__webPlayerInjected) return;
    window.__webPlayerInjected = true;

    const getRootContainer = () => document.body || document.documentElement;

    if (!document.getElementById("wp-global-style")) {
        const globalStyles = document.createElement("style");
        globalStyles.id = "wp-global-style";
        globalStyles.textContent = `
            .webplayer-active .ytp-chrome-top, .webplayer-active .ytp-chrome-bottom,
            .webplayer-active .ytp-progress-bar-container, .webplayer-active .ytp-gradient-bottom,
            .webplayer-active .ytp-gradient-top, .webplayer-active .ytp-iv-video-content {
                display: none !important; opacity: 0 !important; pointer-events: none !important;
            }
        `;
        const root = getRootContainer();
        if (root) root.appendChild(globalStyles);
    }

    const IC = {
        play:     `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5.14v14l11-7-11-7z"/></svg>`,
        pause:    `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>`,
        skipBack: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 5V2L8 6l4 4V7c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5H5c0 3.87 3.13 7 7 7s7-3.13 7-7-3.13-7-7-7z"/><text x="12" y="15" text-anchor="middle" font-size="5.5" font-weight="800">10</text></svg>`,
        skipFwd:  `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z"/><text x="12" y="15" text-anchor="middle" font-size="5.5" font-weight="800">10</text></svg>`,
        pip:      `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.99 2 1.99h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"/></svg>`,
        fullscreen:`<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`,
        rotate:   `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>`,
        close:    `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
        launch:   `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5.14v14l11-7-11-7z"/></svg>`,
    };

    const buttonRegistry = new WeakMap();
    const interceptedUrls = new Set();
    let isSpawningPlayer = false;

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "stream_detected" && msg.url && !interceptedUrls.has(msg.url) && !isSpawningPlayer) {
            interceptedUrls.add(msg.url);
            isSpawningPlayer = true;
            chrome.runtime.sendMessage({
                action:    "open_player",
                videoSrc:  msg.url,
                pageTitle: document.title,
                pageUrl:   window.location.href
            });
            setTimeout(() => isSpawningPlayer = false, 5000);
        }
    });

    function findVideos() {
        try {
            document.querySelectorAll("video").forEach(video => {
                if (buttonRegistry.has(video)) return;
                const r = video.getBoundingClientRect();
                if (r.width < 250 || r.height < 140) return;
                addPlayerButton(video);
            });
        } catch (err) {}
    }

    function addPlayerButton(video) {
        const btn = document.createElement("button");

        const iconEl = document.createElement("span");
        iconEl.innerHTML = IC.launch;
        iconEl.style.cssText = "display:flex;align-items:center;flex-shrink:0;";

        const labelEl = document.createElement("span");
        labelEl.textContent = "Launch WebPlayer";
        labelEl.style.cssText = `
            max-width: 0; overflow: hidden; opacity: 0; white-space: nowrap;
            transition: max-width 0.25s ease, opacity 0.2s ease, margin-left 0.25s ease;
            margin-left: 0;
        `;

        btn.appendChild(iconEl);
        btn.appendChild(labelEl);
        btn.style.cssText = `
            position: absolute; z-index: 2147483647; background: rgba(20, 20, 30, 0.6);
            backdrop-filter: blur(4px); color: white; border: 1px solid rgba(255,255,255,0.1);
            padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;
            display: flex; align-items: center; transition: background 0.2s;
        `;

        btn.onmouseover = () => {
            labelEl.style.maxWidth   = "180px";
            labelEl.style.opacity    = "1";
            labelEl.style.marginLeft = "5px";
            btn.style.background     = "rgba(74, 158, 255, 0.9)";
        };
        btn.onmouseout = () => {
            labelEl.style.maxWidth   = "0";
            labelEl.style.opacity    = "0";
            labelEl.style.marginLeft = "0";
            btn.style.background     = "rgba(20, 20, 30, 0.6)";
        };

        getRootContainer()?.appendChild(btn);

        let rafId = requestAnimationFrame(function loop() {
            try {
                const r = video.getBoundingClientRect();
                if (r.width <= 0 || !document.contains(video)) {
                    btn.style.display = "none";
                } else {
                    btn.style.display = "";
                    btn.style.left    = `${r.left + window.scrollX + 10}px`;
                    btn.style.top     = `${r.top  + window.scrollY + 10}px`;
                }
            } catch (_) {}
            rafId = requestAnimationFrame(loop);
        });

        btn.addEventListener("click", e => {
            e.preventDefault();
            cancelAnimationFrame(rafId); btn.remove(); buttonRegistry.delete(video);
            injectCustomPlayer(video);
        });

        buttonRegistry.set(video, { btn });
    }

    function safeSeekForward(video, seconds) {
        try {
            const t = video.currentTime + seconds;
            video.currentTime = isFinite(video.duration) ? Math.min(video.duration, t) : t;
        } catch (e) {}
    }

    function injectCustomPlayer(video) {
        if (!video || !video.parentElement || video.dataset.customPlayerActive) return;
        video.dataset.customPlayerActive = "true";
        video.dataset.originalControls   = video.controls;
        video.controls = false;

        const root = getRootContainer();
        if (root) root.classList.add("webplayer-active");

        if (getComputedStyle(video.parentElement).position === "static") {
            video.parentElement.style.position = "relative";
        }

        const shadowHost = document.createElement("div");
        shadowHost.style.cssText = "position: absolute; pointer-events: none; z-index: 2147483647;";
        video.parentElement.appendChild(shadowHost);

        const syncOverlay = () => {
            shadowHost.style.left   = `${video.offsetLeft}px`;
            shadowHost.style.top    = `${video.offsetTop}px`;
            shadowHost.style.width  = `${video.offsetWidth}px`;
            shadowHost.style.height = `${video.offsetHeight}px`;
        };
        syncOverlay();
        const ro = new ResizeObserver(syncOverlay);
        ro.observe(video);
        ro.observe(video.parentElement);

        const shadow = shadowHost.attachShadow({ mode: "closed" });

        const styles = document.createElement("style");
        styles.textContent = `
            * { box-sizing: border-box; font-family: system-ui, sans-serif; }
            .webplayer-ui-wrapper {
                position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
                background: rgba(10,10,15,0.85); backdrop-filter: blur(8px); padding: 12px 20px;
                border-radius: 12px; display: flex; flex-direction: column; gap: 10px; opacity: 0;
                transition: opacity 0.3s; pointer-events: auto; border: 1px solid rgba(255,255,255,0.1);
                width: 90%; max-width: 600px; color: white;
            }
            .wp-controls-visible { opacity: 1; }
            .wp-progress-row { display: flex; align-items: center; gap: 10px; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
            input[type=range] { flex: 1; accent-color: #4a9eff; cursor: pointer; }
            .wp-center-row { display: flex; justify-content: center; align-items: center; gap: 12px; }
            button { background: none; border: none; color: white; cursor: pointer; padding: 4px; display: flex; align-items: center; opacity: 0.8; transition: 0.2s; }
            button:hover { opacity: 1; transform: scale(1.1); }
            .speed-pills { display: flex; background: rgba(255,255,255,0.1); border-radius: 5px; padding: 2px; gap: 1px; }
            .speed-pill { font-size: 11px; padding: 2px 7px; border-radius: 3px; opacity: 0.7; white-space: nowrap; transition: background 0.15s, opacity 0.15s; }
            .speed-pill:hover { opacity: 1; transform: none; }
            .speed-pill.active { background: rgba(74,158,255,0.85); opacity: 1; }
            .webplayer-feedback {
                position: absolute; top: 15%; left: 50%; transform: translateX(-50%);
                background: rgba(0,0,0,0.6); padding: 8px 16px; border-radius: 20px;
                font-weight: bold; opacity: 0; transition: 0.2s; color: white; pointer-events: none;
                white-space: nowrap;
            }
            .webplayer-gesture-zone {
                position: absolute; inset: 0; pointer-events: auto;
                touch-action: none; user-select: none; -webkit-user-select: none;
            }
            .wp-ripple {
                position: absolute; border-radius: 50%; background: rgba(255, 255, 255, 0.4);
                transform: scale(0); animation: wp-ripple-anim 0.4s linear; pointer-events: none;
            }
            @keyframes wp-ripple-anim { to { transform: scale(4); opacity: 0; } }
        `;
        shadow.appendChild(styles);

        const uiWrapper = document.createElement("div");
        uiWrapper.className = "webplayer-ui-wrapper";
        uiWrapper.innerHTML = `
            <div class="wp-progress-row">
                <span id="wp-time-cur">0:00</span> / <span id="wp-time-dur">--:--</span>
                <input type="range" id="wp-progress" min="0" max="100" step="0.1" value="0">
            </div>
            <div class="wp-center-row">
                <button id="wp-skip-back">${IC.skipBack}</button>
                <button id="wp-play">${IC.play}</button>
                <button id="wp-skip-fwd">${IC.skipFwd}</button>
                <div class="speed-pills" id="wp-speed-pills">
                    <button class="speed-pill" data-speed="0.5">0.5×</button>
                    <button class="speed-pill active" data-speed="1">1×</button>
                    <button class="speed-pill" data-speed="1.5">1.5×</button>
                    <button class="speed-pill" data-speed="2">2×</button>
                </div>
                <button id="wp-pip">${IC.pip}</button>
                <button id="wp-fs">${IC.fullscreen}</button>
                <button id="wp-rotate">${IC.rotate}</button>
                <button id="wp-exit">${IC.close}</button>
            </div>
        `;

        const feedbackOverlay = document.createElement("div");
        feedbackOverlay.className = "webplayer-feedback";

        const gestureZone = document.createElement("div");
        gestureZone.className = "webplayer-gesture-zone";

        shadow.appendChild(gestureZone);
        shadow.appendChild(uiWrapper);
        shadow.appendChild(feedbackOverlay);

        let hideTimer;
        const showControls = () => {
            uiWrapper.classList.add("wp-controls-visible");
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => uiWrapper.classList.remove("wp-controls-visible"), 3000);
        };

        gestureZone.addEventListener("pointermove", showControls);
        uiWrapper.addEventListener("pointermove", showControls);
        showControls();

        const showFeedback = (text) => {
            feedbackOverlay.innerText = text; feedbackOverlay.style.opacity = "1";
            setTimeout(() => feedbackOverlay.style.opacity = "0", 800);
        };

        // Speed sync helper
        const setPlaybackRate = (rate) => {
            video.playbackRate = rate;
            uiWrapper.querySelectorAll(".speed-pill").forEach(p =>
                p.classList.toggle("active", parseFloat(p.dataset.speed) === rate)
            );
        };

        let tapTimeout;
        const cleanup = () => {
            clearTimeout(tapTimeout);
            ro.disconnect();
            shadowHost.remove();
            video.dataset.customPlayerActive = "";
            video.controls = (video.dataset.originalControls === "true");
            root.classList.remove("webplayer-active");
            addPlayerButton(video);
        };

        uiWrapper.querySelector("#wp-exit").addEventListener("click", cleanup);

        const formatTime = (sec) => {
            if (!isFinite(sec) || sec < 0) return "0:00";
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60).toString().padStart(2, "0");
            return `${m}:${s}`;
        };

        const prog = uiWrapper.querySelector("#wp-progress");
        const tCur = uiWrapper.querySelector("#wp-time-cur");
        const tDur = uiWrapper.querySelector("#wp-time-dur");

        video.addEventListener("timeupdate", () => {
            if (!isFinite(video.duration)) return;
            prog.value     = (video.currentTime / video.duration) * 100;
            tCur.innerText = formatTime(video.currentTime);
            tDur.innerText = formatTime(video.duration);
        });

        prog.addEventListener("input", e => {
            if (isFinite(video.duration)) video.currentTime = (e.target.value / 100) * video.duration;
        });

        const playBtn = uiWrapper.querySelector("#wp-play");
        video.addEventListener("play",  () => playBtn.innerHTML = IC.pause);
        video.addEventListener("pause", () => playBtn.innerHTML = IC.play);
        playBtn.addEventListener("click", () => {
            // BUG FIX: capture state before toggle
            const wasPaused = video.paused;
            wasPaused ? video.play() : video.pause();
        });

        uiWrapper.querySelector("#wp-skip-back").addEventListener("click", () => { video.currentTime -= 10; showFeedback("−10s"); });
        uiWrapper.querySelector("#wp-skip-fwd").addEventListener("click",  () => { safeSeekForward(video, 10); showFeedback("+10s"); });
        uiWrapper.querySelector("#wp-pip").addEventListener("click", async () => {
            document.pictureInPictureElement ? await document.exitPictureInPicture() : await video.requestPictureInPicture();
        });
        uiWrapper.querySelector("#wp-fs").addEventListener("click", async () => {
            const container = video.parentElement;
            const req = container.requestFullscreen || container.webkitRequestFullscreen;
            document.fullscreenElement ? document.exitFullscreen() : req?.call(container);
        });

        uiWrapper.querySelectorAll(".speed-pill").forEach(pill => {
            pill.addEventListener("click", () => setPlaybackRate(parseFloat(pill.dataset.speed)));
        });

        let rot = 0;
        uiWrapper.querySelector("#wp-rotate").addEventListener("click", () => {
            rot = (rot + 90) % 360;
            video.style.transform  = `rotate(${rot}deg)`;
            video.style.transition = "transform 0.3s";
        });

        let startX = 0, startY = 0, lastY = 0, swipeDir = null;
        let isPointerDown = false, lastTapTime = 0, longPressTimer = null;
        let currentBrightness = 1.0, originalSpeed = 1.0;

        gestureZone.addEventListener("contextmenu", e => e.preventDefault());

        gestureZone.addEventListener("pointerdown", e => {
            isPointerDown = true;
            gestureZone.setPointerCapture(e.pointerId);
            startX = e.clientX; startY = e.clientY; lastY = e.clientY; swipeDir = null;
            originalSpeed = video.playbackRate;
            longPressTimer = setTimeout(() => {
                setPlaybackRate(2.0); // BUG FIX: sync pills
                showFeedback("2× Speed");
            }, 500);
        });

        gestureZone.addEventListener("pointermove", e => {
            if (!isPointerDown) return;
            const diffX = e.clientX - startX;
            const diffY = e.clientY - startY;

            if (!swipeDir) {
                if (Math.abs(diffX) > 20)      { swipeDir = "horizontal"; clearTimeout(longPressTimer); }
                else if (Math.abs(diffY) > 20) { swipeDir = "vertical";   clearTimeout(longPressTimer); }
            }

            if (swipeDir === "vertical") {
                const rect   = gestureZone.getBoundingClientRect();
                const deltaY = e.clientY - lastY;
                lastY = e.clientY;

                if (e.clientX > rect.left + rect.width / 2) {
                    video.volume = Math.max(0, Math.min(1, video.volume - deltaY * 0.005));
                    showFeedback(`Vol: ${Math.round(video.volume * 100)}%`);
                } else {
                    currentBrightness       = Math.max(0.1, Math.min(2.5, currentBrightness - deltaY * 0.01));
                    video.style.filter      = `brightness(${currentBrightness})`;
                    showFeedback(`Brightness: ${Math.round(currentBrightness * 100)}%`);
                }
            }
        });

        gestureZone.addEventListener("pointerup", e => {
            if (!isPointerDown) return;
            isPointerDown = false;
            gestureZone.releasePointerCapture(e.pointerId);
            clearTimeout(longPressTimer);

            // BUG FIX: use setPlaybackRate to restore and sync pills
            if (video.playbackRate === 2.0 && originalSpeed !== 2.0) {
                setPlaybackRate(originalSpeed);
                showFeedback(`${originalSpeed}× Speed`);
                lastTapTime = 0;
                return;
            }

            const diffX = e.clientX - startX;
            if (swipeDir === "horizontal" && Math.abs(diffX) > 40) {
                if (diffX > 0) { safeSeekForward(video, 10); showFeedback("+10s"); }
                else           { video.currentTime -= 10;    showFeedback("−10s"); }
                return;
            }

            if (!swipeDir) {
                const now = Date.now();
                if (now - lastTapTime < 200) { // UI FIX: 300→200ms
                    clearTimeout(tapTimeout);
                    const rect = gestureZone.getBoundingClientRect();

                    const ripple = document.createElement("div");
                    ripple.className = "wp-ripple";
                    ripple.style.left   = `${e.clientX - rect.left - 25}px`;
                    ripple.style.top    = `${e.clientY - rect.top  - 25}px`;
                    ripple.style.width  = ripple.style.height = "50px";
                    gestureZone.appendChild(ripple);
                    setTimeout(() => ripple.remove(), 400);

                    // BUG FIX: capture paused state BEFORE toggling, not after
                    const wasPaused = video.paused;
                    if (e.clientX < rect.left + rect.width * 0.33) {
                        video.currentTime = Math.max(0, video.currentTime - 10);
                        showFeedback("−10s");
                    } else if (e.clientX > rect.left + rect.width * 0.66) {
                        safeSeekForward(video, 10);
                        showFeedback("+10s");
                    } else {
                        wasPaused ? video.play() : video.pause();
                        showFeedback(wasPaused ? "Playing" : "Paused");
                    }
                    lastTapTime = 0;
                } else {
                    lastTapTime = now;
                    tapTimeout = setTimeout(() => {
                        video.paused ? video.play() : video.pause();
                        lastTapTime = 0;
                    }, 200); // UI FIX: 300→200ms
                }
            }
        });
    }

    findVideos();
    const observer = new MutationObserver(() => { setTimeout(findVideos, 300); });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        observer.observe(document.documentElement, { childList: true, subtree: true });
        document.addEventListener("DOMContentLoaded", () => {
            observer.disconnect();
            if (document.body) observer.observe(document.body, { childList: true, subtree: true });
        }, { once: true });
    }
})();
