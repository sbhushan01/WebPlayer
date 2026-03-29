document.addEventListener("DOMContentLoaded", async () => {
    const player     = document.getElementById("main-player");
    const container  = document.getElementById("video-container");
    const bufferEl   = document.getElementById("buffering-indicator");
    const skipBadge  = document.getElementById("skip-badge");
    const skipBadgeText = document.getElementById("skip-badge-text");
    const liveBadge  = document.getElementById("live-badge");
    const qualitySelect = document.getElementById("quality-select");

    if (!player || !container) return;

    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => player.play());
        navigator.mediaSession.setActionHandler('pause', () => player.pause());
        navigator.mediaSession.setActionHandler('seekbackward', (e) => player.currentTime = Math.max(0, player.currentTime - (e.seekOffset || 10)));
        navigator.mediaSession.setActionHandler('seekforward', (e) => player.currentTime = Math.min(player.duration, player.currentTime + (e.seekOffset || 10)));
    }

    let lastPointerDownTime = 0, isDoubleTapping = false;
    container.addEventListener("pointerdown", (e) => {
        if (!e.isPrimary) return;
        const now = Date.now();
        if (now - lastPointerDownTime < 300) {
            isDoubleTapping = true;
            e.preventDefault(); e.stopPropagation();

            const rect = container.getBoundingClientRect();
            const relativeX = e.clientX - rect.left;
            
            if (relativeX < rect.width * 0.33) {
                player.currentTime = Math.max(0, player.currentTime - 10);
            } else if (relativeX > rect.width * 0.66) {
                player.currentTime = Math.min(Number.isFinite(player.duration) ? player.duration : Infinity, player.currentTime + 10);
            } else {
                document.fullscreenElement ? document.exitFullscreen().catch(()=>{}) : (container.requestFullscreen?.() ?? player.requestFullscreen?.());
            }
            lastPointerDownTime = 0;
        } else {
            isDoubleTapping = false; lastPointerDownTime = now;
        }
    }, true);

    container.addEventListener("pointerup", (e) => {
        if (isDoubleTapping && e.isPrimary) { e.preventDefault(); e.stopPropagation(); isDoubleTapping = false; }
    }, true);
    container.addEventListener("dblclick", e => { e.preventDefault(); e.stopPropagation(); }, true);

    const urlParams = new URLSearchParams(window.location.search);
    const videoSrc  = urlParams.get("src");
    const pageTitle = urlParams.get("title");
    if (pageTitle) { document.title = pageTitle; }

    if (!videoSrc) { showError("No video source provided."); return; }

    function showError(msg) {
        const errorBox = document.getElementById("error-box");
        if (errorBox) { errorBox.textContent = `${msg}`; errorBox.style.display = "block"; }
    }

    player.addEventListener("loadedmetadata", () => {
        if (player.duration === Infinity) {
            liveBadge.style.display = "flex";
        } else {
            liveBadge.style.display = "none";
        }
    });

    const cleanUrl = videoSrc.split("?")[0];
    chrome.storage.local.get([cleanUrl]).then(res => {
        if (res[cleanUrl]) {
            const seekToSaved = () => {
                if (player.duration !== Infinity) {
                    player.currentTime = res[cleanUrl];
                }
                player.removeEventListener('loadedmetadata', seekToSaved);
            };
            if (player.readyState >= 1) seekToSaved();
            else player.addEventListener('loadedmetadata', seekToSaved);
        }
    });

    let lastSave = 0;
    player.addEventListener("timeupdate", () => {
        const now = Date.now();
        if (now - lastSave > 5000 && !window.__isSkipping && player.duration !== Infinity) {
            chrome.storage.local.set({ [cleanUrl]: player.currentTime });
            lastSave = now;
        }
    });
    player.addEventListener("ended", () => chrome.storage.local.remove([cleanUrl]));

    let currentHls = null, currentDash = null;
    function destroyEngines() {
        if (currentHls)  { currentHls.destroy(); currentHls   = null; }
        if (currentDash) { currentDash.reset();  currentDash  = null; }
    }
    window.addEventListener("beforeunload", () => {
        destroyEngines();
        if (audioContext && audioContext.state !== "closed") audioContext.close();
    });

    function setBuffering(on) { bufferEl?.classList.toggle("is-buffering", on); }
    player.addEventListener("waiting",    () => setBuffering(true));
    player.addEventListener("playing",    () => setBuffering(false));
    player.addEventListener("canplay",    () => setBuffering(false));
    player.addEventListener("loadeddata", () => setBuffering(false));
    player.addEventListener("seeked",     () => setBuffering(false));

    const loadedScripts = {};
    function loadScript(path) {
        if (!loadedScripts[path]) {
            loadedScripts[path] = new Promise((resolve, reject) => {
                const s = document.createElement("script"); s.src = chrome.runtime.getURL(path);
                s.onload = resolve; s.onerror = () => { delete loadedScripts[path]; reject(); };
                document.head.appendChild(s);
            });
        }
        return loadedScripts[path];
    }

    async function attachSource(src) {
        destroyEngines();
        player.crossOrigin = "anonymous";
        setBuffering(true);
        qualitySelect.style.display = "none";
        
        const cleanSrc = src.split("?")[0].toLowerCase();

        try {
            if (cleanSrc.endsWith(".m3u8")) {
                if (player.canPlayType('application/vnd.apple.mpegurl')) {
                    player.src = src;
                    player.addEventListener('loadedmetadata', () => player.play().catch(()=>{}), { once: true });
                } else {
                    await loadScript("libs/hls.min.js");
                    if (window.Hls && Hls.isSupported()) {
                        currentHls = new Hls({ manifestLoadingMaxRetry: 4 });
                        currentHls.loadSource(src); 
                        currentHls.attachMedia(player);
                        
                        currentHls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                            player.play().catch(()=>{});
                            if (data.levels && data.levels.length > 1) {
                                qualitySelect.innerHTML = '<option value="-1">Auto</option>' + 
                                    data.levels.map((l, i) => `<option value="${i}">${l.height}p</option>`).join('');
                                qualitySelect.style.display = "inline-flex";
                                qualitySelect.onchange = (e) => { currentHls.currentLevel = parseInt(e.target.value); };
                            }
                        });

                        currentHls.on(Hls.Events.ERROR, (event, data) => {
                            if (data.fatal) {
                                switch (data.type) {
                                    case Hls.ErrorTypes.NETWORK_ERROR:
                                        console.warn("[WebPlayer] HLS Network Error, recovering...");
                                        currentHls.startLoad();
                                        break;
                                    case Hls.ErrorTypes.MEDIA_ERROR:
                                        console.warn("[WebPlayer] HLS Media Error, recovering...");
                                        currentHls.recoverMediaError();
                                        break;
                                    default:
                                        destroyEngines();
                                        showError("Fatal HLS playback error.");
                                        break;
                                }
                            }
                        });
                    } else {
                        showError("HLS is not supported in this browser.");
                    }
                }
            } else if (cleanSrc.endsWith(".mpd")) {
                await loadScript("libs/dash.all.min.js");
                if (window.dashjs) {
                    currentDash = dashjs.MediaPlayer().create();
                    currentDash.initialize(player, src, true);
                    
                    currentDash.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
                        const bitrates = currentDash.getBitrateInfoListFor('video');
                        if (bitrates && bitrates.length > 1) {
                            qualitySelect.innerHTML = '<option value="-1">Auto</option>' + 
                                bitrates.map((b, i) => `<option value="${i}">${b.height}p</option>`).join('');
                            qualitySelect.style.display = "inline-flex";
                            qualitySelect.onchange = (e) => {
                                const val = parseInt(e.target.value);
                                currentDash.updateSettings({
                                    streaming: { abr: { autoSwitchBitrate: { video: val === -1 } } }
                                });
                                if (val !== -1) currentDash.setQualityFor('video', val);
                            };
                        }
                    });

                    currentDash.on(dashjs.MediaPlayer.events.ERROR, (e) => {
                        if (e.error === "download") console.warn("[WebPlayer] DASH download failed.");
                    });
                } else {
                    showError("DASH is not supported in this browser.");
                }
            } else {
                player.src = src; 
                player.load();
            }
        } catch (err) { 
            showError(`Stream initialization failed: ${err.message}`); 
            setBuffering(false); 
        }
    }

    await attachSource(videoSrc);

    player.addEventListener("error", () => {
        setBuffering(false);
        const code = player.error?.code;
        showError((code === 2 || code === 3 || code === 4) ? "Network/CORS error." : "Could not load video.");
    });

    window.__isSkipping = false;
    async function fetchSegments() {
        try {
            let videoId = new URL(videoSrc).searchParams.get("v") || new URLSearchParams(window.location.search).get("v");
            if (!videoId) return [];
            const res = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}`);
            return await res.json();
        } catch (e) { return []; }
    }

    let skipSegments = await fetchSegments();
    let badgeTimer = null, skippedIds = new Set();
    const SKIP_ICON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="flex-shrink:0" aria-hidden="true"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>`;

    function flashSkipBadge(label) {
        if (!skipBadge) return;
        if (!skipBadge.querySelector("svg")) skipBadge.insertAdjacentHTML("afterbegin", SKIP_ICON_SVG);
        if (skipBadgeText) skipBadgeText.textContent = `Skipping ${label}`;
        skipBadge.classList.add("visible");
        clearTimeout(badgeTimer); badgeTimer = setTimeout(() => skipBadge.classList.remove("visible"), 1400);
    }

    player.addEventListener("timeupdate", () => {
        if (window.__isSkipping || player.readyState < 2) return;
        const t = player.currentTime;
        for (const seg of skipSegments) {
            const start = seg.segment?.[0] ?? seg.start;
            const end   = seg.segment?.[1] ?? seg.end;
            const segId = seg.UUID || start;

            if (t >= start && t < end && !skippedIds.has(segId)) {
                window.__isSkipping = true;
                skippedIds.add(segId);
                player.currentTime = end;
                flashSkipBadge(seg.category || seg.type || "Segment");
                player.addEventListener("seeked", () => { window.__isSkipping = false; }, { once: true });
                break;
            }
        }
    });

    const FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const LABELS = ["31", "62", "125", "250", "500", "1K", "2K", "4K", "8K", "16K"];
    
    let savedEq = { preamp: 1.0, bands: new Array(10).fill(0) };
    try {
        const stored = await chrome.storage.sync.get("eq");
        if (stored.eq) savedEq = { ...savedEq, ...stored.eq };
    } catch (e) {}

    let audioContext, preampNode;
    let eqNodes = [];
    let mediaNodeCreated = false;

    const containerEl = document.getElementById("eq-bands-container");
    const preampSlider = document.getElementById("eq-preamp");
    const preampLabel  = document.getElementById("preamp-label");

    if (preampSlider) {
        preampSlider.value = savedEq.preamp;
        preampLabel.textContent = `${savedEq.preamp}x`;
        preampSlider.addEventListener("input", e => {
            const val = parseFloat(e.target.value);
            preampLabel.textContent = `${val.toFixed(1)}x`;
            if (preampNode) preampNode.gain.value = val;
            savedEq.preamp = val;
            chrome.storage.sync.set({ eq: savedEq });
        });
    }

    FREQS.forEach((f, i) => {
        const bandDiv = document.createElement("div");
        bandDiv.className = "eq-band";
        const valLabel = document.createElement("span");
        valLabel.className = "eq-val-label";
        valLabel.textContent = `${savedEq.bands[i]} dB`;
        
        const slider = document.createElement("input");
        slider.type = "range"; slider.min = "-15"; slider.max = "15"; slider.step = "1";
        slider.value = savedEq.bands[i];
        
        slider.addEventListener("input", e => {
            const val = parseFloat(e.target.value);
            valLabel.textContent = `${val > 0 ? '+'+val : val} dB`;
            if (eqNodes[i]) eqNodes[i].gain.value = val;
            savedEq.bands[i] = val;
            chrome.storage.sync.set({ eq: savedEq });
        });

        const fLabel = document.createElement("span");
        fLabel.textContent = LABELS[i];

        bandDiv.appendChild(valLabel);
        bandDiv.appendChild(slider);
        bandDiv.appendChild(fLabel);
        containerEl.appendChild(bandDiv);
    });

    player.addEventListener("play", () => {
        if (audioContext && audioContext.state === "suspended") audioContext.resume();
        if (audioContext) return;
        
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (!mediaNodeCreated) {
                const track = audioContext.createMediaElementSource(player);
                mediaNodeCreated = true;

                preampNode = audioContext.createGain();
                preampNode.gain.value = savedEq.preamp;
                
                let prevNode = preampNode;
                track.connect(preampNode);

                FREQS.forEach((f, i) => {
                    let eq = audioContext.createBiquadFilter();
                    eq.type = (i === 0) ? "lowshelf" : (i === FREQS.length - 1) ? "highshelf" : "peaking";
                    eq.frequency.value = f;
                    eq.gain.value = savedEq.bands[i];
                    if (eq.type === "peaking") eq.Q.value = 1.41;
                    
                    eqNodes.push(eq);
                    prevNode.connect(eq);
                    prevNode = eq;
                });

                prevNode.connect(audioContext.destination);
            }
        } catch (err) { console.warn("[WebPlayer] Audio graph failed:", err); }
    });

    const speedSelect = document.getElementById("speed-select");
    if (speedSelect) speedSelect.addEventListener("change", () => player.playbackRate = parseFloat(speedSelect.value));

    document.getElementById("pip-btn")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        try { 
            document.pictureInPictureElement ? await document.exitPictureInPicture() : await player.requestPictureInPicture(); 
            btn.classList.remove("disabled");
            btn.title = "Picture in Picture";
        } catch (err) { 
            console.error("PiP failed:", err);
            btn.disabled = true;
            btn.title = "PiP Disabled by Browser";
            showError("Picture-in-Picture is unavailable for this video.");
        }
    });

    const fsBtn  = document.getElementById("fs-btn");
    const fsIcon = document.getElementById("fs-icon");
    const ICON_FS_ENTER = `<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>`;
    const ICON_FS_EXIT  = `<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>`;

    fsBtn?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        try { 
            document.fullscreenElement ? await document.exitFullscreen() : await (container.requestFullscreen?.() ?? player.requestFullscreen?.()); 
        } catch (err) {
            btn.disabled = true;
            btn.title = "Fullscreen Disabled";
            showError("Fullscreen is blocked by the browser.");
        }
    });

    document.addEventListener("fullscreenchange", () => {
        if (fsIcon) fsIcon.innerHTML = document.fullscreenElement ? ICON_FS_EXIT : ICON_FS_ENTER;
        const textSpan = fsBtn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
    });

    document.addEventListener("keydown", e => {
        if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)) return;
        switch (e.key) {
            case " ": case "k": e.preventDefault(); player.paused ? player.play() : player.pause(); break;
            case "ArrowRight": e.preventDefault(); player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 10); break;
            case "ArrowLeft":  e.preventDefault(); player.currentTime = Math.max(0, player.currentTime - 10); break;
            case "ArrowUp":    e.preventDefault(); player.volume = Math.min(1, parseFloat((player.volume + 0.1).toFixed(1))); break;
            case "ArrowDown":  e.preventDefault(); player.volume = Math.max(0, parseFloat((player.volume - 0.1).toFixed(1))); break;
            case "m": player.muted = !player.muted; break;
            case "f": fsBtn.click(); break;
        }
    });
});