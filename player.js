document.addEventListener("DOMContentLoaded", async () => {
    const player     = document.getElementById("main-player");
    const container  = document.getElementById("video-container");
    const bufferEl   = document.getElementById("buffering-indicator");
    const skipBadge  = document.getElementById("skip-badge");

    // FIX 6: Null checks
    if (!player || !container) {
        console.error("Critical player elements missing.");
        return; 
    }

    const urlParams  = new URLSearchParams(window.location.search);
    const videoSrc   = urlParams.get("src");
    const pageTitle  = urlParams.get("title");

    if (pageTitle) document.title = pageTitle;

    if (!videoSrc) {
        showError("No video source provided.");
        return;
    }

    // ── Global Engine Tracking (FIX 1: Memory Leaks) ─────────────
    let currentHls = null;
    let currentDash = null;

    function destroyEngines() {
        if (currentHls) { currentHls.destroy(); currentHls = null; }
        if (currentDash) { currentDash.reset(); currentDash = null; }
    }

    window.addEventListener("beforeunload", () => {
        destroyEngines(); // FIX 7: Cleanup on unload
        if (audioContext && audioContext.state !== 'closed') audioContext.close();
    });

    // ── Error helper & DRM Check (FIX 8 & 15) ────────────────────
    function showError(msg) {
        const errorBox = document.getElementById("error-box");
        if (errorBox) {
            errorBox.textContent = `⚠️ ${msg}`;
            errorBox.style.display = "block";
        }
    }

    async function checkDRM() {
        try {
            const config = [{
                initDataTypes: ['cenc'],
                videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }]
            }];
            await navigator.requestMediaKeySystemAccess('com.widevine.alpha', config);
        } catch (e) {
            showError("This stream may require Widevine DRM, which is not fully supported in this context.");
        }
    }

    // ── Buffering indicator (FIX 11: Stalled detection) ──────────
    function setBuffering(on) { bufferEl?.classList.toggle("is-buffering", on); }
    player.addEventListener("waiting",  () => setBuffering(true));
    player.addEventListener("playing",  () => setBuffering(false));
    player.addEventListener("canplay",  () => setBuffering(false));
    player.addEventListener("loadeddata", () => setBuffering(false));
    player.addEventListener("stalled", () => setBuffering(true)); 

    // Polling fallback for missed events
    setInterval(() => {
        if (player.readyState < 3 && !player.paused) setBuffering(true);
    }, 500);

    // ── Script loader with Promise Cache (FIX 2: Race Condition) ──
    const loadedScripts = {};
    function loadScript(path) {
        if (!loadedScripts[path]) {
            loadedScripts[path] = new Promise((resolve, reject) => {
                const s  = document.createElement("script");
                s.src    = chrome.runtime.getURL(path);
                s.onload = resolve;
                s.onerror = () => { delete loadedScripts[path]; reject(new Error(`Failed to load: ${path}`)); };
                document.head.appendChild(s);
            });
        }
        return loadedScripts[path];
    }

    // ── Source attachment ─────────────────────────────────────────
    async function attachSource(src) {
        destroyEngines();
        await checkDRM();
        
        const cleanSrc = src.split("?")[0].toLowerCase();
        player.crossOrigin = "anonymous";
        setBuffering(true);

        try {
            if (cleanSrc.endsWith(".m3u8")) {
                await loadScript("libs/hls.min.js");
                if (window.Hls && Hls.isSupported()) {
                    currentHls = new Hls({ manifestLoadingMaxRetry: 4 });
                    currentHls.loadSource(src);
                    currentHls.attachMedia(player);
                    currentHls.on(Hls.Events.MANIFEST_PARSED, () => player.play().catch(() => {}));
                    
                    currentHls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) {
                            switch (data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    currentHls.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    currentHls.recoverMediaError();
                                    break;
                                default:
                                    currentHls.destroy();
                                    showError(`HLS fatal error: ${data.details}`);
                                    break;
                            }
                        }
                    });
                }
            } else if (cleanSrc.endsWith(".mpd")) {
                await loadScript("libs/dash.all.min.js");
                if (window.dashjs) {
                    currentDash = dashjs.MediaPlayer().create();
                    currentDash.initialize(player, src, true);
                    currentDash.on(dashjs.MediaPlayer.events.ERROR, e => {
                        showError(`DASH error: ${e.error?.message || "unknown"}`);
                    });
                }
            } else {
                player.src = src;
                player.load();
            }
        } catch (err) {
            showError(`Could not initialise player: ${err.message}`);
            setBuffering(false);
        }
    }

    await attachSource(videoSrc);

    // ── Native video error & Retry (FIX 10) ────────────────────────
    let retryCount = 0;
    player.addEventListener("error", () => {
        setBuffering(false);
        const code = player.error?.code;

        if (code === 2 && retryCount < 3 && !currentHls && !currentDash) {
            retryCount++;
            setTimeout(() => { player.load(); player.play(); }, 1500);
            return;
        }

        const isCORS = code === 2 || code === 3 || code === 4;
        const msgs = {
            1: "Playback aborted.",
            2: "Network error — check your connection.",
            3: "Decode error — file may be corrupt.",
            4: "Format or URL not supported."
        };
        showError(isCORS ? "Network or CORS error. The host may be blocking external players." : (msgs[code] || "Could not load video."));
    });

    // ── API Skip Segment Fetch (FIX 3 & 9) ─────────────────────────
    async function fetchSegments(url) {
        try {
            const videoId = new URLSearchParams(url.split('?')[1]).get("v");
            if (!videoId) return [];
            const res = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}`);
            return await res.json();
        } catch (e) { return []; }
    }

    let skipSegments = await fetchSegments(videoSrc);
    let isSkipping   = false;
    let badgeTimer   = null;

    function flashSkipBadge(label) {
        if (!skipBadge) return;
        skipBadge.textContent = `⏭ Skipping ${label}…`;
        skipBadge.classList.add("visible");
        clearTimeout(badgeTimer);
        badgeTimer = setTimeout(() => skipBadge.classList.remove("visible"), 1400);
    }

    player.addEventListener("timeupdate", () => {
        if (isSkipping || player.readyState < 2) return;
        const t = player.currentTime;

        for (const seg of skipSegments) {
            const start = seg.segment?.[0] || seg.start;
            const end = seg.segment?.[1] || seg.end;
            
            if (t >= start && t < end) {
                isSkipping = true;
                player.currentTime = end;
                flashSkipBadge(seg.category || seg.type || "Segment");
                
                // Fix soft-lock: Wait for native seeked event
                player.addEventListener("seeked", () => {
                    isSkipping = false;
                }, { once: true });
                break;
            }
        }
    });

    // ── Equalizer (FIX 4: AudioContext resume) ─────────────────────
    const DEFAULT_LOW_GAIN  = 4;
    const DEFAULT_HIGH_GAIN = 2;
    let savedEq = { lowGain: DEFAULT_LOW_GAIN, highGain: DEFAULT_HIGH_GAIN };

    try {
        chrome.storage.sync.get("eq").then(stored => {
            if (stored.eq) savedEq = stored.eq;
        });
    } catch (e) {}

    const lowSlider  = document.getElementById("eq-low");
    const highSlider = document.getElementById("eq-high");
    const lowLabel   = document.getElementById("eq-low-label");
    const highLabel  = document.getElementById("eq-high-label");

    if (lowSlider)  { lowSlider.value  = savedEq.lowGain;  lowLabel.textContent  = `${savedEq.lowGain} dB`;  }
    if (highSlider) { highSlider.value = savedEq.highGain; highLabel.textContent = `${savedEq.highGain} dB`; }

    let audioContext, lowShelf, highShelf;

    player.addEventListener("play", () => {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        if (audioContext) return;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const track = audioContext.createMediaElementSource(player);

            lowShelf = audioContext.createBiquadFilter();
            lowShelf.type            = "lowshelf";
            lowShelf.frequency.value = 250;
            lowShelf.gain.value      = savedEq.lowGain;

            highShelf = audioContext.createBiquadFilter();
            highShelf.type            = "highshelf";
            highShelf.frequency.value = 4000;
            highShelf.gain.value      = savedEq.highGain;

            track.connect(lowShelf);
            lowShelf.connect(highShelf);
            highShelf.connect(audioContext.destination);
        } catch (err) {}
    });

    if (lowSlider) {
        lowSlider.addEventListener("input", () => {
            const val = parseFloat(lowSlider.value);
            lowLabel.textContent = `${val} dB`;
            if (lowShelf) lowShelf.gain.value = val;
            chrome.storage.sync.set({ eq: { lowGain: val, highGain: parseFloat(highSlider?.value || 0) } });
        });
    }

    if (highSlider) {
        highSlider.addEventListener("input", () => {
            const val = parseFloat(highSlider.value);
            highLabel.textContent = `${val} dB`;
            if (highShelf) highShelf.gain.value = val;
            chrome.storage.sync.set({ eq: { lowGain: parseFloat(lowSlider?.value || 0), highGain: val } });
        });
    }

    // ── Speed control & Keyboard Shortcuts ─────────────────────────
    const speedSelect = document.getElementById("speed-select");
    if (speedSelect) {
        speedSelect.addEventListener("change", () => {
            player.playbackRate = parseFloat(speedSelect.value);
        });
    }

    document.addEventListener("keydown", e => {
        if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;

        switch (e.key) {
            case " ":
            case "k":
                e.preventDefault();
                player.paused ? player.play() : player.pause();
                break;
            case "ArrowRight":
                e.preventDefault();
                player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 10);
                break;
            case "ArrowLeft":
                e.preventDefault();
                player.currentTime = Math.max(0, player.currentTime - 10);
                break;
            case "ArrowUp":
                e.preventDefault();
                player.volume = Math.min(1, parseFloat((player.volume + 0.1).toFixed(1)));
                break;
            case "ArrowDown":
                e.preventDefault();
                player.volume = Math.max(0, parseFloat((player.volume - 0.1).toFixed(1)));
                break;
            case "m":
                player.muted = !player.muted;
                break;
            case "f":
                document.fullscreenElement
                    ? document.exitFullscreen()
                    : (container?.requestFullscreen?.() ?? player.requestFullscreen?.());
                break;
        }
    });
});
