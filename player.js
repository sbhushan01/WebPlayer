document.addEventListener("DOMContentLoaded", async () => {
    const player     = document.getElementById("main-player");
    const container  = document.getElementById("video-container");
    const bufferEl   = document.getElementById("buffering-indicator");
    const skipBadge  = document.getElementById("skip-badge");

    const urlParams  = new URLSearchParams(window.location.search);
    const videoSrc   = urlParams.get("src");
    const pageTitle  = urlParams.get("title");

    if (pageTitle) document.title = pageTitle;

    if (!videoSrc) {
        showError("No video source provided.");
        return;
    }

    // ── Error helper ──────────────────────────────────────────────────────────
    function showError(msg) {
        const errorBox = document.getElementById("error-box");
        if (errorBox) {
            errorBox.textContent = `⚠️ ${msg}`;
            errorBox.style.display = "block";
        }
    }

    // ── Buffering indicator ───────────────────────────────────────────────────
    function setBuffering(on) {
        bufferEl?.classList.toggle("is-buffering", on);
    }
    player.addEventListener("waiting",  () => setBuffering(true));
    player.addEventListener("playing",  () => setBuffering(false));
    player.addEventListener("canplay",  () => setBuffering(false));
    player.addEventListener("loadeddata", () => setBuffering(false));

    // ── Script loader ─────────────────────────────────────────────────────────
    function loadScript(path) {
        return new Promise((resolve, reject) => {
            const s  = document.createElement("script");
            s.src    = chrome.runtime.getURL(path);
            s.onload = resolve;
            s.onerror = () => reject(new Error(`Failed to load: ${path}`));
            document.head.appendChild(s);
        });
    }

    // ── Source attachment with engine-failure fallback ─────────────────────────
    // FIX: If the HLS/DASH library loads but the media engine then fails (e.g.
    // MSE not available in this context), we show a clear error instead of
    // leaving a blank player.  We also emit a "fatal-error" event so any future
    // listeners can react.
    async function attachSource(src) {
        const cleanSrc = src.split("?")[0].toLowerCase();
        player.crossOrigin = "anonymous";
        setBuffering(true);

        try {
            if (cleanSrc.endsWith(".m3u8")) {
                // ── HLS ──────────────────────────────────────────────────────
                await loadScript("libs/hls.min.js");

                if (window.Hls && Hls.isSupported()) {
                    const hls = new Hls({
                        // Aggressive retry for transient network errors
                        manifestLoadingMaxRetry: 4,
                        levelLoadingMaxRetry:    4,
                        fragLoadingMaxRetry:     4
                    });

                    hls.loadSource(src);
                    hls.attachMedia(player);

                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        player.play().catch(() => {});
                    });

                    // FIX: distinguish recoverable vs fatal HLS errors
                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) {
                            switch (data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    // Try to recover once
                                    hls.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    hls.recoverMediaError();
                                    break;
                                default:
                                    hls.destroy();
                                    showError(`HLS fatal error: ${data.details}`);
                                    break;
                            }
                        }
                    });

                } else if (player.canPlayType("application/vnd.apple.mpegurl")) {
                    // Safari native HLS
                    player.src = src;
                    player.load();
                } else {
                    showError("HLS streams are not supported in this browser.");
                }

            } else if (cleanSrc.endsWith(".mpd")) {
                // ── DASH ─────────────────────────────────────────────────────
                await loadScript("libs/dash.all.min.js");

                // FIX: verify the library actually initialised after load
                if (!window.dashjs) {
                    showError("DASH library failed to initialise.");
                    return;
                }

                const dashPlayer = dashjs.MediaPlayer().create();
                dashPlayer.initialize(player, src, true);

                dashPlayer.on(dashjs.MediaPlayer.events.ERROR, e => {
                    const msg = e.error?.message || e.error?.code || "unknown";
                    showError(`DASH error: ${msg}`);
                });

                // FIX: if MediaSource / MSE is not available, surface it clearly
                if (!window.MediaSource) {
                    showError("Your browser does not support Media Source Extensions (required for DASH).");
                    dashPlayer.reset();
                }

            } else {
                // ── Plain video / direct URL ──────────────────────────────────
                player.src = src;
                player.load();
            }
        } catch (err) {
            // Script load failure or unexpected exception
            showError(`Could not initialise player: ${err.message}`);
            setBuffering(false);
        }
    }

    await attachSource(videoSrc);

    // ── Native video error ─────────────────────────────────────────────────────
    player.addEventListener("error", () => {
        setBuffering(false);
        const msgs = {
            1: "Playback aborted.",
            2: "Network error — check your connection or CORS headers.",
            3: "Decode error — file may be corrupt or in an unsupported format.",
            4: "Format or URL not supported."
        };
        showError(msgs[player.error?.code] || "Could not load video — the source may be protected or unavailable.");
    });

    // ── Skip segments with visible badge ──────────────────────────────────────
    // fetchSegments is a placeholder; replace with a real API call as needed.
    async function fetchSegments(url) {
        // Example stubs — wire to SponsorBlock or your own API here
        return [
            { start: 15,  end: 30,  type: "intro"   },
            { start: 120, end: 180, type: "sponsor"  }
        ];
    }

    let skipSegments = await fetchSegments(videoSrc);
    let isSkipping   = false;
    let badgeTimer   = null;

    function flashSkipBadge(label) {
        if (!skipBadge) return;
        skipBadge.textContent = `⏭ Skipping ${label}…`;
        skipBadge.classList.add("visible");
        clearTimeout(badgeTimer);
        badgeTimer = setTimeout(() => {
            skipBadge.classList.remove("visible");
        }, 1400);
    }

    player.addEventListener("timeupdate", () => {
        if (isSkipping || player.readyState < 2) return;
        const t = player.currentTime;

        for (const seg of skipSegments) {
            if (t >= seg.start && t < seg.end) {
                isSkipping         = true;
                player.currentTime = seg.end;
                flashSkipBadge(seg.type);
                setTimeout(() => { isSkipping = false; }, 500);
                break;
            }
        }
    });

    // ── Equalizer ─────────────────────────────────────────────────────────────
    const DEFAULT_LOW_GAIN  = 4;
    const DEFAULT_HIGH_GAIN = 2;
    let savedEq = { lowGain: DEFAULT_LOW_GAIN, highGain: DEFAULT_HIGH_GAIN };

    try {
        const stored = await chrome.storage.sync.get("eq");
        if (stored.eq) savedEq = stored.eq;
    } catch (e) {
        console.warn("[WebPlayer] Could not read EQ:", e);
    }

    const lowSlider  = document.getElementById("eq-low");
    const highSlider = document.getElementById("eq-high");
    const lowLabel   = document.getElementById("eq-low-label");
    const highLabel  = document.getElementById("eq-high-label");

    if (lowSlider)  { lowSlider.value  = savedEq.lowGain;  lowLabel.textContent  = `${savedEq.lowGain} dB`;  }
    if (highSlider) { highSlider.value = savedEq.highGain; highLabel.textContent = `${savedEq.highGain} dB`; }

    let audioContext, lowShelf, highShelf;

    player.addEventListener("play", () => {
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
        } catch (err) {
            console.warn("[WebPlayer] AudioContext error:", err);
        }
    }, { once: true });

    if (lowSlider) {
        lowSlider.addEventListener("input", () => {
            const val = parseFloat(lowSlider.value);
            lowLabel.textContent = `${val} dB`;
            if (lowShelf) lowShelf.gain.value = val;
            chrome.storage.sync.set({ eq: { lowGain: val, highGain: parseFloat(highSlider.value) } });
        });
    }

    if (highSlider) {
        highSlider.addEventListener("input", () => {
            const val = parseFloat(highSlider.value);
            highLabel.textContent = `${val} dB`;
            if (highShelf) highShelf.gain.value = val;
            chrome.storage.sync.set({ eq: { lowGain: parseFloat(lowSlider.value), highGain: val } });
        });
    }

    // ── Speed control ─────────────────────────────────────────────────────────
    const speedSelect = document.getElementById("speed-select");
    if (speedSelect) {
        speedSelect.addEventListener("change", () => {
            player.playbackRate = parseFloat(speedSelect.value);
        });
    }

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
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
                // FIX: fullscreen targets the container, not the bare video
                document.fullscreenElement
                    ? document.exitFullscreen()
                    : (container?.requestFullscreen?.() ?? player.requestFullscreen?.());
                break;
        }
    });
});
