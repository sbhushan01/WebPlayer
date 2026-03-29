document.addEventListener("DOMContentLoaded", async () => {
    const player = document.getElementById("main-player");
    const container = document.getElementById("video-container");
    const bufferEl = document.getElementById("buffering-indicator");
    const skipBadge = document.getElementById("skip-badge");
    const feedbackOverlay = document.getElementById("feedback-overlay");
    const gestureZone = document.getElementById("gesture-zone");

    // UI Elements
    const playBtn = document.getElementById("play-pause-btn");
    const playIconPath = document.getElementById("play-icon-path");
    const volumeSlider = document.getElementById("volume-slider");
    const muteBtn = document.getElementById("mute-btn");
    const timeCur = document.getElementById("time-current");
    const timeDur = document.getElementById("time-duration");
    const progWrapper = document.getElementById("progress-wrapper");
    const progPlayed = document.getElementById("progress-played");
    const progBuffered = document.getElementById("progress-buffered");
    const progThumb = document.getElementById("progress-thumb");
    const fsBtn = document.getElementById("fs-btn");
    const fsIcon = document.getElementById("fs-icon");
    const pipBtn = document.getElementById("pip-btn");
    const speedSelect = document.getElementById("speed-select");
    const qualitySelect = document.getElementById("quality-select");

    // EQ Elements
    const eqToggleBtn = document.getElementById("eq-toggle-btn");
    const eqPopover = document.getElementById("eq-popover");
    const eqCloseBtn = document.getElementById("eq-close-btn");
    const eqBandsContainer = document.getElementById("eq-bands-container");
    const preampSlider = document.getElementById("eq-preamp");
    const preampLabel = document.getElementById("preamp-label");

    // --- Media Session API ---
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => player.play());
        navigator.mediaSession.setActionHandler('pause', () => player.pause());
        navigator.mediaSession.setActionHandler('seekbackward', (e) => player.currentTime = Math.max(0, player.currentTime - (e.seekOffset || 10)));
        navigator.mediaSession.setActionHandler('seekforward', (e) => player.currentTime = Math.min(player.duration, player.currentTime + (e.seekOffset || 10)));
    }

    // --- URL Parsing ---
    const urlParams = new URLSearchParams(window.location.search);
    const videoSrc = urlParams.get("src");
    if (urlParams.get("title")) document.title = urlParams.get("title");

    if (!videoSrc) { showError("No video source provided."); return; }
    function showError(msg) {
        const errorBox = document.getElementById("error-box");
        if (errorBox) { errorBox.textContent = msg; errorBox.style.display = "block"; }
    }

    // --- State & Storage ---
    const cleanUrl = videoSrc.split("?")[0];
    chrome.storage.local.get([cleanUrl]).then(res => {
        if (res[cleanUrl]) {
            const seekToSaved = () => {
                if (player.duration !== Infinity) player.currentTime = res[cleanUrl];
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

    // --- HLS / DASH Initialization ---
    let currentHls = null, currentDash = null;
    function destroyEngines() {
        if (currentHls) { currentHls.destroy(); currentHls = null; }
        if (currentDash) { currentDash.reset(); currentDash = null; }
    }
    window.addEventListener("beforeunload", () => {
        destroyEngines();
        if (audioContext && audioContext.state !== "closed") audioContext.close();
    });

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
        bufferEl.classList.add("is-buffering");
        qualitySelect.style.display = "none";
        
        const cleanSrc = src.split("?")[0].toLowerCase();
        try {
            if (cleanSrc.endsWith(".m3u8")) {
                if (player.canPlayType('application/vnd.apple.mpegurl')) {
                    player.src = src;
                } else {
                    await loadScript("libs/hls.min.js");
                    if (window.Hls && Hls.isSupported()) {
                        currentHls = new Hls({ manifestLoadingMaxRetry: 4 });
                        currentHls.loadSource(src); currentHls.attachMedia(player);
                        currentHls.on(Hls.Events.MANIFEST_PARSED, (e, d) => {
                            if (d.levels.length > 1) {
                                qualitySelect.innerHTML = '<option value="-1">Auto</option>' + d.levels.map((l, i) => `<option value="${i}">${l.height}p</option>`).join('');
                                qualitySelect.style.display = "block";
                                qualitySelect.onchange = (ev) => currentHls.currentLevel = parseInt(ev.target.value);
                            }
                        });
                    } else showError("HLS not supported.");
                }
            } else if (cleanSrc.endsWith(".mpd")) {
                await loadScript("libs/dash.all.min.js");
                if (window.dashjs) {
                    currentDash = dashjs.MediaPlayer().create();
                    currentDash.initialize(player, src, true);
                } else showError("DASH not supported.");
            } else {
                player.src = src;
            }
        } catch (err) { showError(`Init failed: ${err.message}`); bufferEl.classList.remove("is-buffering"); }
    }
    attachSource(videoSrc);

    // --- SponsorBlock ---
    window.__isSkipping = false;
    async function fetchSegments() {
        try {
            let videoId = new URL(videoSrc).searchParams.get("v") || new URLSearchParams(window.location.search).get("v");
            if (!videoId || videoId.length !== 11) return []; 
            const res = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}`);
            if (!res.ok) return []; 
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (e) { return []; }
    }
    
    let skipSegments = [];
    fetchSegments().then(segs => skipSegments = segs);
    let skippedIds = new Set();
    
    player.addEventListener("timeupdate", () => {
        if (window.__isSkipping || !skipSegments.length) return;
        const t = player.currentTime;
        for (const seg of skipSegments) {
            const start = seg.segment?.[0] ?? seg.start;
            const end   = seg.segment?.[1] ?? seg.end;
            const segId = seg.UUID || start;
            if (t >= start && t < end && !skippedIds.has(segId)) {
                window.__isSkipping = true;
                skippedIds.add(segId);
                player.currentTime = end;
                skipBadge.style.display = "block";
                setTimeout(() => skipBadge.style.display = "none", 1500);
                player.addEventListener("seeked", () => window.__isSkipping = false, { once: true });
                break;
            }
        }
    });

    // --- UI Logic: Controls & Progress ---
    const formatTime = (sec) => {
        if (!isFinite(sec)) return "0:00";
        const m = Math.floor(sec / 60), s = Math.floor(sec % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };

    let isDraggingProgress = false;
    
    player.addEventListener("loadedmetadata", () => { timeDur.textContent = isFinite(player.duration) ? formatTime(player.duration) : "Live"; });
    player.addEventListener("timeupdate", () => {
        if (isDraggingProgress) return;
        timeCur.textContent = formatTime(player.currentTime);
        if (isFinite(player.duration) && player.duration > 0) {
            const pct = (player.currentTime / player.duration) * 100;
            progPlayed.style.width = `${pct}%`;
            progThumb.style.left = `${pct}%`;
        }
    });
    
    player.addEventListener("progress", () => {
        if (player.buffered.length > 0 && isFinite(player.duration)) {
            const bufferedEnd = player.buffered.end(player.buffered.length - 1);
            progBuffered.style.width = `${(bufferedEnd / player.duration) * 100}%`;
        }
    });

    const updateProgressFromEvent = (e) => {
        if (!isFinite(player.duration)) return;
        const rect = progWrapper.getBoundingClientRect();
        let pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        progPlayed.style.width = `${pct * 100}%`;
        progThumb.style.left = `${pct * 100}%`;
        player.currentTime = pct * player.duration;
    };

    progWrapper.addEventListener("pointerdown", (e) => {
        isDraggingProgress = true;
        progWrapper.classList.add("dragging");
        updateProgressFromEvent(e);
        const onMove = (ev) => updateProgressFromEvent(ev);
        const onUp = () => {
            isDraggingProgress = false;
            progWrapper.classList.remove("dragging");
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    });

    // Playback & Volume
    const togglePlay = () => player.paused ? player.play() : player.pause();
    playBtn.addEventListener("click", togglePlay);
    player.addEventListener("play", () => playIconPath.setAttribute("d", "M6 19h4V5H6v14zm8-14v14h4V5h-4z")); 
    player.addEventListener("pause", () => playIconPath.setAttribute("d", "M8 5.14v14l11-7-11-7z")); 
    
    player.addEventListener("waiting", () => bufferEl.classList.add("is-buffering"));
    player.addEventListener("playing", () => bufferEl.classList.remove("is-buffering"));

    volumeSlider.addEventListener("input", (e) => {
        player.volume = e.target.value;
        player.muted = player.volume === 0;
    });
    muteBtn.addEventListener("click", () => {
        player.muted = !player.muted;
        volumeSlider.value = player.muted ? 0 : player.volume;
    });

    const toggleFS = async () => {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) await document.exitFullscreen();
            else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        } else {
            const req = container.requestFullscreen || container.webkitRequestFullscreen;
            if (req) await req.call(container);
        }
    };
    fsBtn.addEventListener("click", toggleFS);
    
    const onFSChange = () => {
        const isFS = document.fullscreenElement || document.webkitFullscreenElement;
        fsIcon.innerHTML = isFS ? `<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>` : `<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>`;
    };
    document.addEventListener("fullscreenchange", onFSChange);
    document.addEventListener("webkitfullscreenchange", onFSChange);

    pipBtn.addEventListener("click", async () => {
        try { document.pictureInPictureElement ? await document.exitPictureInPicture() : await player.requestPictureInPicture(); } catch(e){}
    });
    speedSelect.addEventListener("change", (e) => player.playbackRate = parseFloat(e.target.value));

    // --- Hide Controls on Idle ---
    let idleTimer;
    const resetIdle = () => {
        container.classList.remove("idle");
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { if (!player.paused && !isDraggingProgress && !eqPopover.classList.contains("active")) container.classList.add("idle"); }, 3000);
    };
    container.addEventListener("pointermove", resetIdle);
    container.addEventListener("pointerdown", resetIdle);
    player.addEventListener("play", resetIdle);
    player.addEventListener("pause", () => container.classList.remove("idle"));

    // --- FIX: Gesture Zone ---
    let feedbackTimer;
    const showFeedback = (text) => {
        feedbackOverlay.textContent = text;
        feedbackOverlay.style.opacity = 1;
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => feedbackOverlay.style.opacity = 0, 800);
    };

    // 1. Prevent native browser scrolling/swiping
    gestureZone.style.touchAction = "none"; 

    let startX=0, startY=0, lastY=0, swipeDir=null, isPointerDown=false, lastTapTime=0, currentBrightness=1.0;
    let tapTimeout; // 2. Timeout for single vs double tap

    gestureZone.addEventListener("pointerdown", (e) => {
        isPointerDown = true; gestureZone.setPointerCapture(e.pointerId);
        startX = e.clientX; startY = e.clientY; lastY = e.clientY; swipeDir = null;
    });

    gestureZone.addEventListener("pointermove", (e) => {
        if (!isPointerDown) return;
        const diffX = e.clientX - startX, diffY = e.clientY - startY;
        if (!swipeDir) {
            if (Math.abs(diffX) > 20) swipeDir = "horizontal";
            else if (Math.abs(diffY) > 20) swipeDir = "vertical";
        }
        if (swipeDir === "vertical") {
            const rect = gestureZone.getBoundingClientRect();
            const deltaY = e.clientY - lastY; lastY = e.clientY;
            if (e.clientX > rect.left + rect.width / 2) {
                player.volume = Math.max(0, Math.min(1, player.volume - deltaY * 0.005));
                volumeSlider.value = player.volume;
                showFeedback(`Vol: ${Math.round(player.volume * 100)}%`);
            } else {
                currentBrightness = Math.max(0.1, Math.min(2.5, currentBrightness - deltaY * 0.01));
                player.style.filter = `brightness(${currentBrightness})`;
                showFeedback(`Brightness: ${Math.round(currentBrightness * 100)}%`);
            }
        }
    });

    gestureZone.addEventListener("pointerup", (e) => {
        if (!isPointerDown) return;
        isPointerDown = false; gestureZone.releasePointerCapture(e.pointerId);
        
        const diffX = e.clientX - startX;
        if (swipeDir === "horizontal" && Math.abs(diffX) > 40) {
            const shift = diffX > 0 ? 10 : -10;
            player.currentTime = Math.max(0, Math.min(player.duration || Infinity, player.currentTime + shift));
            showFeedback(`${shift > 0 ? '+' : ''}${shift}s`);
            return;
        }

        if (!swipeDir) {
            const now = Date.now();
            if (now - lastTapTime < 300) {
                // Double tap detected
                clearTimeout(tapTimeout);
                const rect = gestureZone.getBoundingClientRect();
                if (e.clientX < rect.left + rect.width * 0.33) { player.currentTime = Math.max(0, player.currentTime - 10); showFeedback("-10s"); }
                else if (e.clientX > rect.left + rect.width * 0.66) { player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 10); showFeedback("+10s"); }
                else toggleFS();
                lastTapTime = 0;
            } else {
                // Single tap detected
                lastTapTime = now;
                tapTimeout = setTimeout(() => {
                    togglePlay();
                    lastTapTime = 0;
                }, 300);
            }
        }
    });

    // --- Audio EQ Setup ---
    let audioContext, preampNode, eqNodes = [], mediaNodeCreated = false;
    const FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const LABELS = ["31", "62", "125", "250", "500", "1K", "2K", "4K", "8K", "16K"];
    
    let savedEq = { preamp: 1.0, bands: new Array(10).fill(0) };
    chrome.storage.sync.get("eq").then(s => { if (s.eq) savedEq = { ...savedEq, ...s.eq }; setupEQUI(); });

    function setupEQUI() {
        preampSlider.value = savedEq.preamp; preampLabel.textContent = savedEq.preamp;
        preampSlider.addEventListener("input", e => {
            const val = parseFloat(e.target.value); preampLabel.textContent = val.toFixed(1);
            if (preampNode) preampNode.gain.value = val;
            savedEq.preamp = val; chrome.storage.sync.set({ eq: savedEq });
        });

        eqBandsContainer.innerHTML = "";
        FREQS.forEach((f, i) => {
            const div = document.createElement("div"); div.className = "eq-band";
            const slider = document.createElement("input");
            slider.type = "range"; slider.min = "-15"; slider.max = "15"; slider.step = "1"; slider.value = savedEq.bands[i];
            slider.addEventListener("input", e => {
                const val = parseFloat(e.target.value);
                if (eqNodes[i]) eqNodes[i].gain.value = val;
                savedEq.bands[i] = val; chrome.storage.sync.set({ eq: savedEq });
            });
            const lbl = document.createElement("span"); lbl.textContent = LABELS[i];
            div.appendChild(slider); div.appendChild(lbl); eqBandsContainer.appendChild(div);
        });
    }

    eqToggleBtn.addEventListener("click", () => eqPopover.classList.toggle("active"));
    eqCloseBtn.addEventListener("click", () => eqPopover.classList.remove("active"));

    player.addEventListener("play", () => {
        if (audioContext && audioContext.state === "suspended") audioContext.resume();
        if (audioContext) return;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (!mediaNodeCreated) {
                const track = audioContext.createMediaElementSource(player);
                mediaNodeCreated = true;
                preampNode = audioContext.createGain(); preampNode.gain.value = savedEq.preamp;
                let prev = preampNode; track.connect(preampNode);
                FREQS.forEach((f, i) => {
                    let eq = audioContext.createBiquadFilter();
                    eq.type = (i===0) ? "lowshelf" : (i===FREQS.length-1) ? "highshelf" : "peaking";
                    eq.frequency.value = f; eq.gain.value = savedEq.bands[i];
                    if (eq.type === "peaking") eq.Q.value = 1.41;
                    eqNodes.push(eq); prev.connect(eq); prev = eq;
                });
                prev.connect(audioContext.destination);
            }
        } catch(e) {}
    });

    // --- FIX: Keyboard Shortcuts ---
    window.addEventListener("keydown", (e) => {
        // Prevent shortcuts from triggering if the user is typing in an input field
        if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;

        switch(e.key.toLowerCase()) {
            case " ":
            case "k":
                e.preventDefault();
                togglePlay();
                showFeedback(player.paused ? "Paused" : "Playing");
                break;
            case "arrowleft":
            case "j":
                e.preventDefault();
                player.currentTime = Math.max(0, player.currentTime - 10);
                showFeedback("-10s");
                break;
            case "arrowright":
            case "l":
                e.preventDefault();
                player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 10);
                showFeedback("+10s");
                break;
            case "arrowup":
                e.preventDefault();
                player.volume = Math.min(1, player.volume + 0.05);
                volumeSlider.value = player.volume;
                showFeedback(`Vol: ${Math.round(player.volume * 100)}%`);
                break;
            case "arrowdown":
                e.preventDefault();
                player.volume = Math.max(0, player.volume - 0.05);
                volumeSlider.value = player.volume;
                showFeedback(`Vol: ${Math.round(player.volume * 100)}%`);
                break;
            case "f":
                e.preventDefault();
                toggleFS();
                break;
            case "m":
                e.preventDefault();
                player.muted = !player.muted;
                volumeSlider.value = player.muted ? 0 : player.volume;
                showFeedback(player.muted ? "Muted" : "Unmuted");
                break;
        }
    });
});
