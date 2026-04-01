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
            .webplayer-active .ytp-gradient-top, .webplayer-active .ytp-iv-video-content,
            .webplayer-active ytm-custom-control, .webplayer-active ytm-player-overlay-container,
            .webplayer-active ytm-mobile-video-player-overlay {
                display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important;
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


    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        try {
            chrome.runtime.onMessage.addListener((msg) => {
                if (msg.action === "stream_detected" && msg.url && !interceptedUrls.has(msg.url)) {
                    interceptedUrls.add(msg.url);
                    
                    const prompt = document.createElement("div");
                    prompt.style.cssText = `
                        position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
                        background: rgba(20, 20, 30, 0.9); backdrop-filter: blur(8px);
                        border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
                        padding: 12px 20px; color: white; display: flex; align-items: center; gap: 12px;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.3); font-family: system-ui, sans-serif;
                        animation: wp-slide-in 0.3s ease-out;
                    `;
                    prompt.innerHTML = `
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight: 600; font-size: 14px;">Stream Detected</span>
                            <span style="font-size: 12px; color: #aaa;">HLS/DASH stream available</span>
                        </div>
                        <div style="display:flex; gap: 8px;">
                            <button class="wp-prompt-ignore" style="background: rgba(255,255,255,0.1); border: none; padding: 6px 12px; border-radius: 6px; color: white; cursor: pointer; font-size: 12px; transition: 0.2s;">Ignore</button>
                            <button class="wp-prompt-launch" style="background: #4A9EFF; border: none; padding: 6px 12px; border-radius: 6px; color: white; cursor: pointer; font-size: 12px; font-weight: bold; transition: 0.2s;">Launch Player</button>
                        </div>
                    `;
                    
                    if (!document.getElementById("wp-prompt-style")) {
                        const s = document.createElement("style");
                        s.id = "wp-prompt-style";
                        s.textContent = "@keyframes wp-slide-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }";
                        getRootContainer()?.appendChild(s);
                    }
                    
                    getRootContainer()?.appendChild(prompt);
                    
                    const closePrompt = () => {
                        prompt.style.opacity = "0";
                        prompt.style.transform = "translateY(20px)";
                        prompt.style.transition = "all 0.3s ease-in";
                        setTimeout(() => prompt.remove(), 300);
                    };
                    
                    prompt.querySelector(".wp-prompt-ignore").onclick = closePrompt;
                    prompt.querySelector(".wp-prompt-launch").onclick = () => {
                        closePrompt();
                        try {
                            chrome.runtime.sendMessage({
                                action:    "open_player",
                                videoSrc:  msg.url,
                                pageTitle: document.title,
                                pageUrl:   window.location.href
                            });
                        } catch (e) {
                            console.warn("[WebPlayer] Cannot send launch message:", e);
                        }
                    };
                    
                    setTimeout(closePrompt, 15000);
                }
            });
        } catch (e) {
            console.warn("[WebPlayer] Message listener initialization error:", e);
        }
    }

    function findVideos() {
        try {
            document.querySelectorAll("video").forEach(video => {
                if (buttonRegistry.has(video)) return;
                const r = video.getBoundingClientRect();
                if (r.width < 100 || r.height < 80) return;
                addPlayerButton(video);
            });
        } catch (err) {}
    }

    function addPlayerButton(video) {
        const btn = document.createElement("button");

        const iconEl = document.createElement("span");
        setSVG(iconEl, IC.launch);
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

        // B6: Use IntersectionObserver + ResizeObserver + scroll instead of continuous rAF
        let btnVisible = false;
        const updateBtnPos = () => {
            try {
                if (!document.contains(video)) { cleanupBtn(); return; }
                const r = video.getBoundingClientRect();
                if (r.width <= 0) { btn.style.display = "none"; return; }
                btn.style.display = btnVisible ? "" : "none";
                btn.style.left = `${r.left + window.scrollX + 10}px`;
                btn.style.top  = `${r.top  + window.scrollY + 10}px`;
            } catch (_) { cleanupBtn(); }
        };
        const cleanupBtn = () => {
            btnIO.disconnect(); btnRO.disconnect();
            window.removeEventListener("scroll", updateBtnPos, true);
            btn.remove(); buttonRegistry.delete(video);
        };
        const btnIO = new IntersectionObserver(entries => {
            btnVisible = entries[0]?.isIntersecting ?? false;
            updateBtnPos();
        }, { threshold: 0.1 });
        const btnRO = new ResizeObserver(updateBtnPos);
        btnIO.observe(video); btnRO.observe(video);
        window.addEventListener("scroll", updateBtnPos, { capture: true, passive: true });
        updateBtnPos();

        btn.addEventListener("pointerdown", e => {
            e.preventDefault(); e.stopPropagation();
            cleanupBtn(); injectCustomPlayer(video);
        });
        btn.addEventListener("click", e => {
            e.preventDefault(); e.stopPropagation();
            if (buttonRegistry.has(video)) { cleanupBtn(); injectCustomPlayer(video); }
        });

        buttonRegistry.set(video, { btn });
    }

    function safeSeekForward(video, seconds) {
        try {
            const t = video.currentTime + seconds;
            video.currentTime = isFinite(video.duration) ? Math.min(video.duration, t) : t;
        } catch (e) {}
    }

    // B1: Track play() promise to prevent AbortError on rapid play/pause
    let _playPromise = null;
    function safePlay(video) {
        try {
            _playPromise = video.play();
            if (_playPromise && typeof _playPromise.catch === "function") {
                _playPromise.catch(() => {}).finally(() => { _playPromise = null; });
            }
        } catch (err) { _playPromise = null; }
    }
    async function safePause(video) {
        if (_playPromise) { try { await _playPromise; } catch (_) {} _playPromise = null; }
        video.pause();
    }

    // B8: Defensive SVG injection via DOMParser
    const setSVG = (el, svgStr) => {
        el.textContent = '';
        try {
            const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
            el.appendChild(document.importNode(doc.documentElement, true));
        } catch (_) { el.innerHTML = svgStr; }
    };

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
        
        // Prevent events from bubbling to YouTube's player
        const stopProp = e => e.stopPropagation();
        ['pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu'].forEach(evt => {
            shadowHost.addEventListener(evt, stopProp);
        });
        
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
                position: absolute; bottom: max(30px, calc(14px + env(safe-area-inset-bottom))); left: 50%; transform: translateX(-50%);
                background: rgba(26, 29, 36, 0.65); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
                padding: 16px 24px; border-radius: 28px; display: flex; flex-direction: column; gap: 12px; opacity: 0;
                transition: opacity 0.4s ease, transform 0.4s ease; pointer-events: auto; border: 1px solid rgba(255,255,255,0.08);
                width: 95%; max-width: 800px; color: #E3E3E3; box-shadow: 0px 8px 16px 2px rgba(0,0,0,0.2);
            }
            .video-container.idle .webplayer-ui-wrapper { opacity: 0; transform: translate(-50%, 20px); pointer-events: none; }
            .wp-controls-visible { opacity: 1; transform: translateX(-50%); }
            .wp-progress-row { display: flex; align-items: center; gap: 12px; width: 100%; font-size: 14px; font-variant-numeric: tabular-nums; font-weight: 500; color: #C4C7C5; }
            input[type=range] { 
                -webkit-appearance: none; appearance: none; flex: 1; 
                background: rgba(255,255,255,0.15); height: 8px; border-radius: 4px; 
                cursor: pointer; outline: none; margin: 16px 0; 
            }
            input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none; appearance: none;
                width: 20px; height: 20px; border-radius: 50%; background: #A8C7FA; 
                cursor: pointer; box-shadow: 0 0 8px rgba(0,0,0,0.4); transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            input[type=range]:active::-webkit-slider-thumb { transform: scale(1.3); }
            input[type=range]::-moz-range-thumb {
                width: 20px; height: 20px; border-radius: 50%; background: #A8C7FA; 
                cursor: pointer; border: none; box-shadow: 0 0 8px rgba(0,0,0,0.4); transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            input[type=range]:active::-moz-range-thumb { transform: scale(1.3); }
            .wp-center-row { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 4px; flex-wrap: wrap; }
            button { background: rgba(255,255,255,0.0); border: none; color: #E3E3E3; cursor: pointer; padding: 8px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s ease; width: 44px; height: 44px; }
            button:hover { background: rgba(255,255,255,0.12); transform: scale(1.05); }
            @media (max-width: 600px) {
                .webplayer-ui-wrapper { bottom: max(16px, calc(8px + env(safe-area-inset-bottom))); padding: 12px 16px; border-radius: 20px; gap: 10px; width: calc(100% - 20px); }
                .wp-center-row { flex-wrap: nowrap; overflow-x: auto; justify-content: flex-start; gap: 8px; padding-bottom: 2px; scrollbar-width: none; }
                .wp-center-row::-webkit-scrollbar { display: none; }
                .speed-pills { display: none !important; }
                button { width: 44px; height: 44px; padding: 8px; flex-shrink: 0; }
                .wp-progress-row { font-size: 13px; gap: 8px; }
                input[type=range] { margin: 10px 0; height: 8px; }
            }
            .speed-pills { display: flex; align-items: center; gap: 6px; margin: 0 8px; }
            .speed-pill { font-size: 13px; font-weight: 600; padding: 0 12px; height: 32px; border-radius: 16px; background: rgba(255,255,255,0.06); color: #C4C7C5; transition: all 0.3s ease; border: 1px solid rgba(255,255,255,0.08); width: auto; display: flex; align-items: center; }
            .speed-pill:hover { background: rgba(255,255,255,0.15); color: #E3E3E3; transform: scale(1); }
            .speed-pill.active { background: linear-gradient(135deg, #A8C7FA, #062E6F); color: #062E6F; border-color: transparent; box-shadow: 0 0 16px rgba(168, 199, 250, 0.6); }
            .webplayer-feedback {
                position: absolute; top: 18%;
                background: rgba(10, 10, 15, 0.75); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                padding: 12px 32px; border-radius: 32px; font-size: 1.15rem; font-weight: 600;
                opacity: 0; pointer-events: none; transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), left 0.15s ease, right 0.15s ease;
                z-index: 20; white-space: nowrap; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0px 8px 16px 2px rgba(0,0,0,0.2); color: white;
                left: 50%; transform: translateX(-50%);
            }
            .webplayer-feedback.feedback-left  { left: 15%; right: auto; transform: none; }
            .webplayer-feedback.feedback-right { left: auto; right: 15%; transform: none; }
            .webplayer-gesture-zone {
                position: absolute; inset: 0; pointer-events: auto;
                touch-action: none; user-select: none; -webkit-user-select: none;
            }
            .wp-ripple {
                position: absolute; border-radius: 50%; background: #A8C7FA;
                transform: scale(0); opacity: 0.5; pointer-events: none;
                animation: wp-ripple-anim 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards; box-shadow: 0 0 20px rgba(168, 199, 250, 0.6);
            }
            @keyframes wp-ripple-anim { to { transform: scale(4.5); opacity: 0; } }
            .quality-container { position: relative; display: flex; align-items: center; }
            .quality-dropdown { 
                position: absolute; bottom: calc(100% + 16px); right: -10px; 
                background: rgba(26, 29, 36, 0.95); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
                border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 8px; flex-direction: column; gap: 4px; 
                z-index: 50; box-shadow: 0px 8px 16px 2px rgba(0,0,0,0.2); min-width: 140px; display: none; 
            }
            .quality-dropdown.open { display: flex; animation: wp-slideUp 0.2s cubic-bezier(0.4,0,0.2,1); }
            @keyframes wp-slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            .quality-option { font-size: 13px; font-weight: 500; padding: 10px 16px; border-radius: 10px; width: 100%; text-align: left; background: none; color: #C4C7C5; border: none; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: flex-start; }
            .quality-option:hover { background: rgba(255,255,255,0.1); color: #E3E3E3; }
            .quality-option.active { color: #A8C7FA; background: rgba(255,255,255,0.05); }
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
                <div class="quality-container" id="wp-quality-container" style="display:none;">
                    <button id="wp-quality-btn" title="Quality">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41L9.25 5.35C8.66 5.59 8.12 5.92 7.63 6.29L5.24 5.33c-.22-.08-.47 0-.59.22L2.73 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.08.62-.08.94s.03.64.08.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.49-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                    </button>
                    <div class="quality-dropdown" id="wp-quality-dropdown"></div>
                </div>
                <div class="quality-container" id="wp-cc-container" style="display:none;">
                    <button id="wp-cc-btn" title="Subtitles/CC">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1.5c0 .28-.22.5-.5.5h-3c-.28 0-.5-.22-.5-.5v-4c0-.28.22-.5.5-.5h3c.28 0 .5.22.5.5V11zm7 0h-1.5v-.5h-2v3h2V13H18v1.5c0 .28-.22.5-.5.5h-3c-.28 0-.5-.22-.5-.5v-4c0-.28.22-.5.5-.5h3c.28 0 .5.22.5.5V11z"/></svg>
                    </button>
                    <div class="quality-dropdown" id="wp-cc-dropdown"></div>
                </div>
                <div class="speed-pills" id="wp-speed-pills">
                    <button class="speed-pill" data-speed="0.25">0.25×</button>
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

        const ytPlayer = document.querySelector(".html5-video-player") || video.closest('.html5-video-player');
        const qDropdown = uiWrapper.querySelector("#wp-quality-dropdown");
        const qContainer = uiWrapper.querySelector("#wp-quality-container");
        const ccDropdown = uiWrapper.querySelector("#wp-cc-dropdown");
        const ccContainer = uiWrapper.querySelector("#wp-cc-container");

        if (ytPlayer && ytPlayer.getAvailableQualityLevels) {
            const updateQualityMenu = () => {
                const levels = ytPlayer.getAvailableQualityLevels();
                if (levels && levels.length > 0) {
                    qContainer.style.display = "flex";
                    qDropdown.innerHTML = "";
                    levels.forEach(l => {
                        const btn = document.createElement("button");
                        btn.className = "quality-option" + (l === "auto" ? " active" : "");
                        btn.textContent = l === "auto" ? "Auto" : l;
                        btn.dataset.value = l;
                        qDropdown.appendChild(btn);
                    });
                }
            };
            updateQualityMenu();
            video.addEventListener("loadedmetadata", updateQualityMenu);
            qDropdown.addEventListener("click", e => {
                const btn = e.target.closest(".quality-option");
                if (!btn) return;
                qDropdown.querySelectorAll(".quality-option").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                ytPlayer.setPlaybackQualityRange(btn.dataset.value);
                qDropdown.classList.remove("open");
            });
        }

        const updateCCMenu = () => {
            let tracks = [];
            if (video.textTracks && video.textTracks.length > 0) {
                tracks = Array.from(video.textTracks).map((t, i) => ({ label: t.label || t.language || `Track ${i + 1}`, value: i, type: "native" }));
            } else if (ytPlayer && ytPlayer.getOption) {
                const ytTracks = ytPlayer.getOption('captions', 'tracklist') || [];
                tracks = ytTracks.map((t, i) => ({ label: t.displayName || t.languageCode, value: i, type: "yt", ytTrack: t }));
            }

            if (tracks.length > 0) {
                ccContainer.style.display = "flex";
                ccDropdown.innerHTML = `<button class="quality-option active" data-value="-1">Off</button>`;
                tracks.forEach((t) => {
                    const btn = document.createElement("button");
                    btn.className = "quality-option";
                    btn.textContent = t.label;
                    btn.dataset.value = t.value;
                    btn.dataset.type = t.type;
                    if (t.type === "yt") btn.dataset.yt = JSON.stringify(t.ytTrack);
                    ccDropdown.appendChild(btn);
                });
            } else {
                ccContainer.style.display = "none";
            }
        };
        updateCCMenu();
        video.addEventListener("loadedmetadata", updateCCMenu);
        video.addEventListener("canplay", updateCCMenu);
        
        ccDropdown.addEventListener("click", e => {
            const btn = e.target.closest(".quality-option");
            if (!btn) return;
            ccDropdown.querySelectorAll(".quality-option").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const val = parseInt(btn.dataset.value);
            const type = btn.dataset.type;
            
            if (val === -1) {
                Array.from(video.textTracks || []).forEach(t => t.mode = "disabled");
                if (ytPlayer && ytPlayer.unloadModule) ytPlayer.unloadModule("captions");
            } else {
                if (type === "native") {
                    Array.from(video.textTracks || []).forEach((t, i) => t.mode = i === val ? "showing" : "disabled");
                } else if (type === "yt") {
                    if (ytPlayer && ytPlayer.setOption) {
                        try {
                            const tObj = JSON.parse(btn.dataset.yt);
                            ytPlayer.loadModule("captions");
                            ytPlayer.setOption("captions", "track", tObj);
                        } catch(err) {}
                    }
                }
            }
            ccDropdown.classList.remove("open");
        });

        uiWrapper.querySelector("#wp-quality-btn")?.addEventListener("click", e => {
            e.stopPropagation();
            qDropdown.classList.toggle("open");
            ccDropdown.classList.remove("open");
        });
        uiWrapper.querySelector("#wp-cc-btn")?.addEventListener("click", e => {
            e.stopPropagation();
            ccDropdown.classList.toggle("open");
            qDropdown.classList.remove("open");
        });
        uiWrapper.addEventListener("click", e => {
            if (!e.target.closest("#wp-quality-container") && !e.target.closest("#wp-quality-btn")) qDropdown.classList.remove("open");
            if (!e.target.closest("#wp-cc-container") && !e.target.closest("#wp-cc-btn")) ccDropdown.classList.remove("open");
        });

        // ==========================================================
        // BUG FIX: Hide controls logic now respects `video.paused`
        // ==========================================================
        let hideTimer;
        const showControls = () => {
            uiWrapper.classList.add("wp-controls-visible");
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                if (!video.paused) {
                    uiWrapper.classList.remove("wp-controls-visible");
                }
            }, 3000);
        };

        // Ensure pausing stops the controls from hiding
        video.addEventListener("pause", showControls);
        video.addEventListener("play", showControls);

        gestureZone.addEventListener("pointermove", showControls);
        gestureZone.addEventListener("pointerdown", showControls);
        uiWrapper.addEventListener("pointermove", showControls);
        // Fallback: shadowHost has pointer-events:none which can block pointermove
        // from reaching the shadow DOM in some browsers, so also listen on the
        // underlying video element (events pass through when the host is transparent).
        video.addEventListener("pointermove", showControls);
        video.addEventListener("pointerdown", showControls);
        showControls();

        const showFeedback = (text, position) => {
            feedbackOverlay.innerText = text;
            feedbackOverlay.classList.remove("feedback-left", "feedback-right");
            if (position === "left")  feedbackOverlay.classList.add("feedback-left");
            if (position === "right") feedbackOverlay.classList.add("feedback-right");
            feedbackOverlay.style.opacity = "1";
            setTimeout(() => feedbackOverlay.style.opacity = "0", 800);
        };

        // ── SponsorBlock ──────────────────────────────────────────────────────────
        window.__isSkipping = false;
        async function fetchSegments() {
            try {
                const match = /(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/.exec(window.location.href);
                if (!match) return [];
                const res = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${match[1]}`);
                if (!res.ok) return [];
                const data = await res.json();
                return Array.isArray(data) ? data : [];
            } catch { return []; }
        }

        let skipSegments = [];
        fetchSegments().then(segs => { skipSegments = segs; });
        const skippedIds = new Set();
        const SEGMENT_LABELS = { sponsor: "Sponsor Skipped", intro: "Intro Skipped", outro: "Outro Skipped", selfpromo: "Self-Promo Skipped", interaction: "Interaction Skipped", music_offtopic: "Music Skipped", preview: "Preview Skipped" };

        video.addEventListener("timeupdate", () => {
            if (window.__isSkipping || !skipSegments.length) return;
            const t = video.currentTime;
            for (const seg of skipSegments) {
                const start = seg.segment?.[0] ?? seg.start;
                const end   = seg.segment?.[1] ?? seg.end;
                const segId = seg.UUID || start;
                if (t >= start && t < end && !skippedIds.has(segId)) {
                    window.__isSkipping = true;
                    skippedIds.add(segId);
                    video.currentTime = end;
                    showFeedback(SEGMENT_LABELS[seg.category] || "Segment Skipped");
                    video.addEventListener("seeked", () => { window.__isSkipping = false; }, { once: true });
                    setTimeout(() => { window.__isSkipping = false; }, 1000);
                    break;
                }
            }
        });

        // Speed sync helper
        const setPlaybackRate = (rate) => {
            video.playbackRate = rate;
            uiWrapper.querySelectorAll(".speed-pill").forEach(p =>
                p.classList.toggle("active", parseFloat(p.dataset.speed) === rate)
            );
        };

        let tapTimeout;
        const handleKeyDown = (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            switch (e.key) {
                case " ": case "k": case "K":
                    e.preventDefault();
                    { const wasPaused = video.paused;
                    wasPaused ? safePlay(video) : safePause(video);
                    showFeedback(wasPaused ? "Playing" : "Paused"); }
                    break;
                case "ArrowLeft":
                    e.preventDefault();
                    video.currentTime = Math.max(0, video.currentTime - 10);
                    showFeedback("−10s");
                    break;
                case "ArrowRight":
                    e.preventDefault();
                    safeSeekForward(video, 10);
                    showFeedback("+10s");
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    video.volume = Math.min(1, video.volume + 0.05);
                    video.muted = false;
                    showFeedback(`Vol: ${Math.round(video.volume * 100)}%`);
                    showControls();
                    break;
                case "ArrowDown":
                    e.preventDefault();
                    video.volume = Math.max(0, video.volume - 0.05);
                    if (video.volume === 0) video.muted = true;
                    showFeedback(`Vol: ${Math.round(video.volume * 100)}%`);
                    showControls();
                    break;
                case "m": case "M":
                    video.muted = !video.muted;
                    showFeedback(video.muted ? "Muted" : "Unmuted");
                    break;
                case "f": case "F":
                    uiWrapper.querySelector("#wp-fs").click();
                    break;
                case "r": case "R":
                    uiWrapper.querySelector("#wp-rotate").click();
                    break;
            }
        };
        document.addEventListener("keydown", handleKeyDown);

        const cleanup = () => {
            document.removeEventListener("keydown", handleKeyDown);
            clearTimeout(tapTimeout);
            clearTimeout(hideTimer);
            video.removeEventListener("pointermove", showControls);
            video.removeEventListener("pointerdown", showControls);
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
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = Math.floor(sec % 60).toString().padStart(2, "0");
            if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s}`;
            return `${m}:${s}`;
        };

        const prog = uiWrapper.querySelector("#wp-progress");
        const tCur = uiWrapper.querySelector("#wp-time-cur");
        const tDur = uiWrapper.querySelector("#wp-time-dur");

        let isScrubbing = false;
        let scrubTimeout;

        const syncTimelineStyle = (val) => {
            prog.style.background = `linear-gradient(to right, #A8C7FA ${val}%, rgba(255,255,255,0.15) ${val}%)`;
        };

        prog.addEventListener("input", e => {
            isScrubbing = true;
            clearTimeout(scrubTimeout);
            const val = e.target.value;
            syncTimelineStyle(val);
            if (isFinite(video.duration)) {
                tCur.innerText = formatTime((val / 100) * video.duration);
            }
        });

        prog.addEventListener("change", e => {
            if (isFinite(video.duration)) {
                video.currentTime = (e.target.value / 100) * video.duration;
            }
            // Add a slight delay before releasing the lock so timeupdate doesn't snap standard progress back
            scrubTimeout = setTimeout(() => { isScrubbing = false; }, 300);
        });

        video.addEventListener("timeupdate", () => {
            if (!isFinite(video.duration) || isScrubbing) return;
            const val = (video.currentTime / video.duration) * 100;
            prog.value = val;
            syncTimelineStyle(val);
            tCur.innerText = formatTime(video.currentTime);
            tDur.innerText = formatTime(video.duration);
        });

        const playBtn = uiWrapper.querySelector("#wp-play");
        video.addEventListener("play",  () => setSVG(playBtn, IC.pause));
        video.addEventListener("pause", () => setSVG(playBtn, IC.play));
        playBtn.addEventListener("click", () => {
            const wasPaused = video.paused;
            wasPaused ? safePlay(video) : safePause(video);
        });

        uiWrapper.querySelector("#wp-skip-back").addEventListener("click", () => { video.currentTime = Math.max(0, video.currentTime - 10); showFeedback("−10s"); });
        uiWrapper.querySelector("#wp-skip-fwd").addEventListener("click",  () => { safeSeekForward(video, 10); showFeedback("+10s"); });
        uiWrapper.querySelector("#wp-pip").addEventListener("click", async () => {
            document.pictureInPictureElement ? await document.exitPictureInPicture() : await video.requestPictureInPicture();
        });
        uiWrapper.querySelector("#wp-fs").addEventListener("click", async () => {
            const ytFsBtn = document.querySelector(".ytp-fullscreen-button");
            if (ytFsBtn) {
                ytFsBtn.click();
                return;
            }
            
            const container = video.closest('.html5-video-player, [data-vjs-player]') || video.parentElement;
            const req = container.requestFullscreen || container.webkitRequestFullscreen;
            try {
                if (document.fullscreenElement || document.webkitFullscreenElement) {
                    await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
                } else {
                    await req?.call(container);
                }
            } catch (err) {
                console.warn("[WebPlayer] Container FS failed:", err);
                try {
                    const vidReq = video.requestFullscreen || video.webkitRequestFullscreen;
                    await vidReq?.call(video);
                } catch (e) { console.warn("[WebPlayer] FS completely blocked", e); showFeedback("FS Blocked"); }
            }
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
        let isLongPressActive = false;

        gestureZone.addEventListener("contextmenu", e => e.preventDefault());

        gestureZone.addEventListener("dblclick", e => {
            e.preventDefault();
            // Fallback for native dblclick if pointer events miss the timing, 
            // but restrict to fullscreen to avoid duplicated seeks.
            const rect = gestureZone.getBoundingClientRect();
            if (e.clientX > rect.left + rect.width * 0.30 && e.clientX < rect.left + rect.width * 0.70) {
                uiWrapper.querySelector("#wp-fs")?.click();
            }
        });

        gestureZone.addEventListener("pointerdown", e => {
            isPointerDown = true;
            gestureZone.setPointerCapture(e.pointerId);
            startX = e.clientX; startY = e.clientY; lastY = e.clientY; swipeDir = null;
            originalSpeed = video.playbackRate;
            longPressTimer = setTimeout(() => {
                isLongPressActive = true;
                setPlaybackRate(2.0); // BUG FIX: sync pills
                showFeedback("2× Speed");
            }, 500);
        });

        gestureZone.addEventListener("pointermove", e => {
            if (!isPointerDown) return;
            // U6: Ignore gestures near screen edges (top/bottom 12%)
            const _edgeRect = gestureZone.getBoundingClientRect();
            const _yRatio = (e.clientY - _edgeRect.top) / _edgeRect.height;
            if (_yRatio < 0.12 || _yRatio > 0.88) return;
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
                    video.muted = false;
                    showFeedback(`Vol: ${Math.round(video.volume * 100)}%`, "right");
                } else {
                    currentBrightness       = Math.max(0.1, Math.min(2.5, currentBrightness - deltaY * 0.01));
                    video.style.filter      = `brightness(${currentBrightness})`;
                    showFeedback(`Brightness: ${Math.round(currentBrightness * 100)}%`, "left");
                }
            }
        });

        const handleGestureEnd = e => {
            if (!isPointerDown) return;
            isPointerDown = false;
            gestureZone.releasePointerCapture(e.pointerId);
            clearTimeout(longPressTimer);

            // BUG FIX: use isLongPressActive flag to restore and sync pills
            if (isLongPressActive) {
                isLongPressActive = false;
                setPlaybackRate(originalSpeed);
                showFeedback(`${originalSpeed}× Speed`);
                lastTapTime = 0;
                return;
            }

            const diffX = e.clientX - startX;
            if (swipeDir === "horizontal" && Math.abs(diffX) > 40) {
                if (diffX > 0) { safeSeekForward(video, 10); showFeedback("+10s"); }
                else           { video.currentTime = Math.max(0, video.currentTime - 10); showFeedback("−10s"); }
                return;
            }

            if (!swipeDir) {
                const now = Date.now();
                if (now - lastTapTime < 250) { // Fast double tap threshold
                    clearTimeout(tapTimeout);
                    const rect = gestureZone.getBoundingClientRect();

                    // #5: Percentage-based ripple sizing
                    const ripple = document.createElement("div");
                    ripple.className = "wp-ripple";
                    const rippleSize = Math.max(36, Math.min(gestureZone.clientWidth, gestureZone.clientHeight) * 0.08);
                    const half = rippleSize / 2;
                    ripple.style.left   = `${e.clientX - rect.left - half}px`;
                    ripple.style.top    = `${e.clientY - rect.top  - half}px`;
                    ripple.style.width  = ripple.style.height = `${rippleSize}px`;
                    gestureZone.appendChild(ripple);
                    setTimeout(() => ripple.remove(), 400);

                    // BUG FIX: Double tap on sides targets seeking, double tap in middle toggles Play/Pause or Fullscreen
                    if (e.clientX < rect.left + rect.width * 0.30) {
                        video.currentTime = Math.max(0, video.currentTime - 10);
                        showFeedback("−10s");
                        lastTapTime = now;
                    } else if (e.clientX > rect.left + rect.width * 0.70) {
                        safeSeekForward(video, 10);
                        showFeedback("+10s");
                        lastTapTime = now;
                    } else {
                        // Double tap center toggles fullscreen for mouse, play/pause for touch
                        if (e.pointerType === "mouse") {
                            uiWrapper.querySelector("#wp-fs")?.click();
                        } else {
                            const wasPaused = video.paused;
                            wasPaused ? safePlay(video) : safePause(video);
                            showFeedback(wasPaused ? "Playing" : "Paused");
                        }
                        lastTapTime = 0;
                    }
                } else {
                    lastTapTime = now;
                    tapTimeout = setTimeout(() => {
                        if (e.pointerType === "mouse") {
                            const wasPaused = video.paused;
                            wasPaused ? safePlay(video) : safePause(video);
                            showFeedback(wasPaused ? "Playing" : "Paused");
                        } else {
                            showControls();
                        }
                        lastTapTime = 0;
                    }, 250); // 250ms distinct click delay
                }
            }
        };

        gestureZone.addEventListener("pointerup", handleGestureEnd);
        gestureZone.addEventListener("pointercancel", handleGestureEnd);
    }

    findVideos();
    // B3: Also watch for src attribute mutations (SPA reuse of video elements)
    const observer = new MutationObserver((mutations) => {
        let needsScan = false;
        for (const m of mutations) {
            if (m.type === 'childList') { needsScan = true; break; }
            if (m.type === 'attributes' && m.target.tagName === 'VIDEO') { needsScan = true; break; }
        }
        if (needsScan) setTimeout(findVideos, 300);
    });
    const obsConfig = { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] };

    if (document.body) {
        observer.observe(document.body, obsConfig);
    } else {
        observer.observe(document.documentElement, obsConfig);
        document.addEventListener("DOMContentLoaded", () => {
            observer.disconnect();
            if (document.body) observer.observe(document.body, obsConfig);
        }, { once: true });
    }
})();
