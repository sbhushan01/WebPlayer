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
        play: `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5.14v14l11-7-11-7z"/></svg>`,
        pause: `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>`,
        skipBack: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 5V2L8 6l4 4V7c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5H5c0 3.87 3.13 7 7 7s7-3.13 7-7-3.13-7-7-7z"/><text x="12" y="15" text-anchor="middle" font-size="5.5" font-weight="800">10</text></svg>`,
        skipFwd: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z"/><text x="12" y="15" text-anchor="middle" font-size="5.5" font-weight="800">10</text></svg>`,
        pip: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.99 2 1.99h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"/></svg>`,
        fullscreen: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`,
        rotate: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>`,
        close: `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
        launch: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="vertical-align:-2px;margin-right:5px"><path d="M8 5.14v14l11-7-11-7z"/></svg>`,
    };

    const buttonRegistry = new WeakMap();

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
        btn.innerHTML = `${IC.launch} Launch WebPlayer`;
        btn.style.cssText = `
            position: absolute; z-index: 2147483647; background: rgba(20, 20, 30, 0.6); backdrop-filter: blur(4px);
            color: white; border: 1px solid rgba(255, 255, 255, 0.1); padding: 6px 10px; border-radius: 6px; font-size: 12px;
            cursor: pointer; display: flex; align-items: center; max-width: 34px; overflow: hidden; white-space: nowrap; transition: 0.2s;
        `;
        btn.onmouseover = () => { btn.style.maxWidth = "200px"; btn.style.background = "rgba(74, 158, 255, 0.9)"; };
        btn.onmouseout = () => { btn.style.maxWidth = "34px"; btn.style.background = "rgba(20, 20, 30, 0.6)"; };
        
        getRootContainer()?.appendChild(btn);

        let rafId = requestAnimationFrame(function loop() {
            try {
                const r = video.getBoundingClientRect();
                if (r.width <= 0 || !document.contains(video)) { btn.style.display = "none"; return; }
                btn.style.display = ""; btn.style.left = `${r.left + 10}px`; btn.style.top = `${r.top + 10}px`;
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
        try { const t = video.currentTime + seconds; video.currentTime = isFinite(video.duration) ? Math.min(video.duration, t) : t; } catch (e) {}
    }

    function injectCustomPlayer(video) {
        if (!video || !video.parentElement || video.dataset.customPlayerActive) return;
        video.dataset.customPlayerActive = "true";
        video.dataset.originalControls = video.controls;
        video.controls = false;
        
        const root = getRootContainer();
        if (root) root.classList.add("webplayer-active");

        // --- FIX: Overlay Injection (Do not reparent video) ---
        if (getComputedStyle(video.parentElement).position === "static") {
            video.parentElement.style.position = "relative";
        }

        const shadowHost = document.createElement("div");
        shadowHost.style.position = "absolute"; shadowHost.style.inset = "0"; 
        shadowHost.style.pointerEvents = "none"; shadowHost.style.zIndex = "2147483647";
        video.parentElement.appendChild(shadowHost);

        const shadow = shadowHost.attachShadow({ mode: "closed" });

        const styles = document.createElement("style");
        styles.textContent = `
            * { box-sizing: border-box; font-family: system-ui, sans-serif; }
            .webplayer-ui-wrapper { 
                position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
                background: rgba(10,10,15,0.85); backdrop-filter: blur(8px); padding: 12px 20px;
                border-radius: 12px; display: flex; flex-direction: column; gap: 10px; opacity: 0; transition: opacity 0.3s;
                pointer-events: auto; border: 1px solid rgba(255,255,255,0.1); width: 90%; max-width: 600px; color: white;
            }
            .wp-controls-visible { opacity: 1; }
            .wp-progress-row { display: flex; align-items: center; gap: 10px; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
            input[type=range] { flex: 1; accent-color: #4a9eff; cursor: pointer; }
            .wp-center-row { display: flex; justify-content: center; gap: 12px; }
            button { background: none; border: none; color: white; cursor: pointer; padding: 4px; display:flex; align-items:center; opacity: 0.8; transition: 0.2s;}
            button:hover { opacity: 1; transform: scale(1.1); }
            select { background: #222; color: white; border: none; border-radius: 4px; padding: 2px 4px; font-size: 13px; cursor: pointer;}
            .webplayer-feedback {
                position: absolute; top: 15%; left: 50%; transform: translateX(-50%);
                background: rgba(0,0,0,0.6); padding: 8px 16px; border-radius: 20px; font-weight: bold; opacity: 0; transition: 0.2s; color: white; pointer-events: none;
            }
            .webplayer-gesture-zone { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
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
                <select id="wp-speed">
                    <option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option>
                </select>
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

        const cleanup = () => {
            shadowHost.remove(); // Safely remove just the overlay
            video.dataset.customPlayerActive = "";
            video.controls = (video.dataset.originalControls === "true");
            root.classList.remove("webplayer-active");
            addPlayerButton(video);
        };

        uiWrapper.querySelector("#wp-exit").addEventListener("click", cleanup);

        const formatTime = (sec) => {
            if (!isFinite(sec) || sec < 0) return "0:00";
            const m = Math.floor(sec / 60); const s = Math.floor(sec % 60).toString().padStart(2, "0");
            return `${m}:${s}`;
        };

        const prog = uiWrapper.querySelector("#wp-progress");
        const tCur = uiWrapper.querySelector("#wp-time-cur");
        const tDur = uiWrapper.querySelector("#wp-time-dur");

        video.addEventListener("timeupdate", () => {
            if (!isFinite(video.duration)) return;
            prog.value = (video.currentTime / video.duration) * 100;
            tCur.innerText = formatTime(video.currentTime);
            tDur.innerText = formatTime(video.duration);
        });

        prog.addEventListener("input", e => {
            if (isFinite(video.duration)) video.currentTime = (e.target.value / 100) * video.duration;
        });

        const playBtn = uiWrapper.querySelector("#wp-play");
        video.addEventListener("play", () => playBtn.innerHTML = IC.pause);
        video.addEventListener("pause", () => playBtn.innerHTML = IC.play);
        playBtn.addEventListener("click", () => video.paused ? video.play() : video.pause());
        
        uiWrapper.querySelector("#wp-skip-back").addEventListener("click", () => { video.currentTime -= 10; showFeedback("−10s"); });
        uiWrapper.querySelector("#wp-skip-fwd").addEventListener("click", () => { safeSeekForward(video, 10); showFeedback("+10s"); });
        uiWrapper.querySelector("#wp-speed").addEventListener("change", e => { video.playbackRate = parseFloat(e.target.value); });
        uiWrapper.querySelector("#wp-pip").addEventListener("click", async () => { document.pictureInPictureElement ? await document.exitPictureInPicture() : await video.requestPictureInPicture(); });
        
        uiWrapper.querySelector("#wp-fs").addEventListener("click", async () => {
            const req = video.requestFullscreen || video.webkitRequestFullscreen;
            document.fullscreenElement ? document.exitFullscreen() : req?.call(video);
        });

        let rot = 0;
        uiWrapper.querySelector("#wp-rotate").addEventListener("click", () => {
            rot = (rot + 90) % 360; video.style.transform = `rotate(${rot}deg)`; video.style.transition = "transform 0.3s";
        });

        // --- FIX: Gesture Engine (Timeout Logic) ---
        let startX=0, lastTap=0, tapTimeout;
        gestureZone.addEventListener("pointerdown", e => { startX = e.clientX; });
        gestureZone.addEventListener("pointerup", e => {
            const diffX = e.clientX - startX;
            if (Math.abs(diffX) > 40) {
                if (diffX > 0) { safeSeekForward(video, 10); showFeedback("+10s"); }
                else { video.currentTime -= 10; showFeedback("−10s"); }
            } else {
                const now = Date.now();
                if (now - lastTap < 300) { 
                    // Double Tap detected
                    clearTimeout(tapTimeout);
                    const rect = gestureZone.getBoundingClientRect();
                    if (e.clientX < rect.left + rect.width * 0.5) { video.currentTime -= 10; showFeedback("-10s"); }
                    else { safeSeekForward(video, 10); showFeedback("+10s"); }
                    lastTap = 0;
                } else {
                    // Single Tap detected
                    lastTap = now;
                    tapTimeout = setTimeout(() => {
                        video.paused ? video.play() : video.pause(); 
                        lastTap = 0;
                    }, 300);
                }
            }
        });
    }

    findVideos();
    const observer = new MutationObserver(() => { setTimeout(findVideos, 300); });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
})();
