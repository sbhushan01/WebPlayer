document.addEventListener("DOMContentLoaded", async () => {
    const player          = document.getElementById("main-player");
    const container       = document.getElementById("video-container");
    const bufferEl        = document.getElementById("buffering-indicator");
    const skipBadge       = document.getElementById("skip-badge");
    const feedbackOverlay = document.getElementById("feedback-overlay");
    const gestureZone     = document.getElementById("gesture-zone");
    const titleBar        = document.getElementById("title-bar");

    const playBtn         = document.getElementById("play-pause-btn");
    const playIcon        = document.getElementById("play-icon");
    const volumeSlider    = document.getElementById("volume-slider");
    const muteBtn         = document.getElementById("mute-btn");
    const muteIcon        = document.getElementById("mute-icon");
    const timeCur         = document.getElementById("time-current");
    const timeDur         = document.getElementById("time-duration");
    const progWrapper     = document.getElementById("progress-wrapper");
    const progPlayed      = document.getElementById("progress-played");
    const progBuffered    = document.getElementById("progress-buffered");
    const progThumb       = document.getElementById("progress-thumb");
    const fsBtn           = document.getElementById("fs-btn");
    const fsIcon          = document.getElementById("fs-icon");
    const pipBtn          = document.getElementById("pip-btn");
    const rotateBtn       = document.getElementById("rotate-btn");
    const speedPillsEl    = document.getElementById("speed-pills");
    const speedToggleBtn  = document.getElementById("speed-toggle-btn");
    const speedPopover    = document.getElementById("speed-popover");
    const speedCloseBtn   = document.getElementById("speed-close-btn");
    const qualityContainer= document.getElementById("quality-container");
    const qualityBtn      = document.getElementById("quality-btn");
    const qualityDropdown = document.getElementById("quality-dropdown");
    const qualityIcon     = document.getElementById("quality-icon");

    const ccContainer     = document.getElementById("cc-container");
    const ccBtn           = document.getElementById("cc-btn");
    const ccDropdown      = document.getElementById("cc-dropdown");
    const ccIcon          = document.getElementById("cc-icon");

    const audioContainer  = document.getElementById("audio-container");
    const audioBtn        = document.getElementById("audio-btn");
    const audioDropdown   = document.getElementById("audio-dropdown");
    const audioIcon       = document.getElementById("audio-icon");

    const themeToggleBtn  = document.getElementById("theme-toggle-btn");
    const themePopover    = document.getElementById("theme-popover");
    const themeCloseBtn   = document.getElementById("theme-close-btn");
    const themeBtns       = document.querySelectorAll(".theme-btn");

    const eqToggleBtn     = document.getElementById("eq-toggle-btn");
    const eqPopover       = document.getElementById("eq-popover");
    const eqCloseBtn      = document.getElementById("eq-close-btn");
    const eqBandsContainer= document.getElementById("eq-bands-container");
    const preampSlider    = document.getElementById("eq-preamp");
    const preampLabel     = document.getElementById("preamp-label");

    const shortcutsModal  = document.getElementById("shortcuts-modal");
    const shortcutsBtn    = document.getElementById("shortcuts-btn");
    const shortcutsClose  = document.getElementById("shortcuts-close");

    const EQ_STORAGE_KEY  = "wp_eq_settings";

    // B1: Track play() promise to prevent AbortError on rapid play/pause
    let _playPromise = null;
    const safePlay = () => {
        try {
            _playPromise = player.play();
            if (_playPromise && typeof _playPromise.catch === "function") {
                _playPromise.catch(() => {}).finally(() => { _playPromise = null; });
            }
        } catch (err) { _playPromise = null; }
    };
    const safePause = async () => {
        if (_playPromise) { try { await _playPromise; } catch (_) {} _playPromise = null; }
        player.pause();
    };

    // ── Media Session ─────────────────────────────────────────────────────────
    if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play",         () => safePlay());
        navigator.mediaSession.setActionHandler("pause",        () => safePause());
        navigator.mediaSession.setActionHandler("seekbackward", (e) => { player.currentTime = Math.max(0, player.currentTime - (e.seekOffset || 10)); });
        navigator.mediaSession.setActionHandler("seekforward",  (e) => { player.currentTime = Math.min(player.duration || Infinity, player.currentTime + (e.seekOffset || 10)); });
    }

    // ── URL params ────────────────────────────────────────────────────────────
    const urlParams  = new URLSearchParams(window.location.search);
    const videoSrc   = urlParams.get("src");
    const pageUrl    = urlParams.get("pageUrl") || "";
    const embedUrl   = urlParams.get("embedUrl") || "";
    const isStandaloneMode = !pageUrl;
    const STANDALONE_HLS_MAX_BUFFER_BYTES = 20 * 1000 * 1000;
    const titleParam = urlParams.get("title")   || "";

    // #11: Smarter dynamic tab title — prefer explicit title, else extract filename, else hostname
    {
        let displayTitle = "WebPlayer";
        if (titleParam && titleParam !== "WebPlayer") {
            displayTitle = titleParam;
        } else if (videoSrc) {
            try {
                const u = new URL(videoSrc);
                const pathSegments = u.pathname.split("/").filter(Boolean);
                const lastSeg = pathSegments[pathSegments.length - 1] || "";
                // Strip extension for readability
                const name = lastSeg.replace(/\.(m3u8|mpd|mp4|webm|mkv|avi|mov|flv|ts)(\?.*)?$/i, "");
                if (name && name.length > 1 && name.length < 120) {
                    displayTitle = decodeURIComponent(name);
                } else {
                    displayTitle = u.hostname;
                }
            } catch (_) {}
        }
        document.title = `WebPlayer — ${displayTitle}`;
        titleBar.textContent = displayTitle;
    }

    // ── Error display (#10) ────────────────────────────────────────────────────
    const errorBox       = document.getElementById("error-box");
    const errorTypeEl    = document.getElementById("error-type");
    const errorMsgEl     = document.getElementById("error-msg");
    const errorUrlBox    = document.getElementById("error-url-container");
    const errorUrlEl     = document.getElementById("error-url");
    const errorCopyBtn   = document.getElementById("error-copy-url");
    const DEMUXER_PARSE_ERROR_TOKEN = "pipelinestatus::demuxer_error_could_not_parse";
    const DEMUXER_OPEN_CONTEXT_ERROR_TOKEN = "pipelinestatus::demuxer_error_could_not_open";
    const DEMUXER_OPEN_CONTEXT_ERROR_MESSAGE_TOKEN = "ffmpegdemuxer: open context failed";
    const DEMUXER_PARSE_ERROR_TOKEN_LOWER = DEMUXER_PARSE_ERROR_TOKEN.toLowerCase();
    const DEMUXER_OPEN_CONTEXT_ERROR_TOKEN_LOWER = DEMUXER_OPEN_CONTEXT_ERROR_TOKEN.toLowerCase();
    const DEMUXER_OPEN_CONTEXT_ERROR_MESSAGE_TOKEN_LOWER = DEMUXER_OPEN_CONTEXT_ERROR_MESSAGE_TOKEN.toLowerCase();

    function showError(msg, type, url) {
        errorMsgEl.textContent  = msg;
        errorTypeEl.textContent = type || "Error";
        if (url) {
            errorUrlEl.textContent = url;
            errorUrlBox.classList.add("visible");
        } else {
            errorUrlBox.classList.remove("visible");
        }
        errorBox.style.display = "flex";
        bufferEl.classList.remove("is-buffering");
    }

    function normalizePlaybackErrorMessage(message) {
        const raw = String(message || "").trim();
        return raw ? { raw, rawLower: raw.toLowerCase() } : null;
    }

    function mapPlaybackErrorMessage(message, fallback) {
        const normalized = normalizePlaybackErrorMessage(message);
        if (!normalized) return fallback;
        if (
            normalized.rawLower.includes(DEMUXER_OPEN_CONTEXT_ERROR_TOKEN_LOWER) ||
            normalized.rawLower.includes(DEMUXER_OPEN_CONTEXT_ERROR_MESSAGE_TOKEN_LOWER)
        ) {
            return "The stream could not be opened. The media URL may be inaccessible, blocked, expired, or unsupported.";
        }
        if (normalized.rawLower.includes(DEMUXER_PARSE_ERROR_TOKEN_LOWER)) {
            return "The stream could not be parsed. It may be malformed, unsupported, or returning invalid media segments.";
        }
        return normalized.raw;
    }

    function mapPlaybackErrorType(message, fallback) {
        const normalized = normalizePlaybackErrorMessage(message);
        if (!normalized) return fallback;
        if (
            normalized.rawLower.includes(DEMUXER_OPEN_CONTEXT_ERROR_TOKEN_LOWER) ||
            normalized.rawLower.includes(DEMUXER_OPEN_CONTEXT_ERROR_MESSAGE_TOKEN_LOWER)
        ) return "Open Error";
        if (normalized.rawLower.includes(DEMUXER_PARSE_ERROR_TOKEN_LOWER)) return "Parse Error";
        return fallback;
    }

    errorCopyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(errorUrlEl.textContent).then(() => {
            errorCopyBtn.textContent = "Copied!";
            setTimeout(() => { errorCopyBtn.textContent = "Copy URL"; }, 2000);
        }).catch(() => {});
    });

    document.getElementById("error-retry").addEventListener("click", () => {
        if (!videoSrc) { showError("No video source provided.", "Missing Source"); return; }
        errorBox.style.display = "none";
        bufferEl.classList.add("is-buffering");
        attachSource(videoSrc);
    });

    // Catch native video errors
    player.addEventListener("error", () => {
        if (currentHls || currentDash) {
            console.warn("[WebPlayer] Suppressing native video error in favor of MSE engine events:", player.error);
            return;
        }
        const err = player.error;
        const typeMap = { 1: "Aborted", 2: "Network Error", 3: "Decode Error", 4: "Source Not Supported" };
        const errTypeBase = err ? (typeMap[err.code] || "Unknown Error") : "Playback Error";
        const errMsg  = mapPlaybackErrorMessage(err?.message, "The video could not be played.");
        const errType = mapPlaybackErrorType(err?.message, errTypeBase);
        showError(errMsg, errType, videoSrc);
    });

    if (!videoSrc) { showError("No video source provided.", "Missing Source"); return; }

    // ── Chrome API availability check ─────────────────────────────────────────
    const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    const hasChromeRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL;

    // ── Playback persistence ──────────────────────────────────────────────────
    const cleanUrl = videoSrc.split("?")[0];

    if (hasChromeStorage) {
        try {
            chrome.storage.local.get([cleanUrl]).then(res => {
                if (res[cleanUrl]) {
                    const savedTime = typeof res[cleanUrl] === "number" ? res[cleanUrl] : res[cleanUrl].time;
                    const seekToSaved = () => {
                        if (player.duration !== Infinity && savedTime) player.currentTime = savedTime;
                        player.removeEventListener("loadedmetadata", seekToSaved);
                    };
                    if (player.readyState >= 1) seekToSaved();
                    else player.addEventListener("loadedmetadata", seekToSaved);
                }
            }).catch(() => {});
        } catch (_) {}
    }

    let lastSave = 0;
    player.addEventListener("timeupdate", () => {
        if (!hasChromeStorage) return;
        const now = Date.now();
        if (now - lastSave > 5000 && !window.__isSkipping && player.duration !== Infinity) {
            try { chrome.storage.local.set({ [cleanUrl]: { time: player.currentTime, ts: now } }); } catch (_) {}
            lastSave = now;
        }
    });
    player.addEventListener("ended", () => { if (hasChromeStorage) try { chrome.storage.local.remove([cleanUrl]); } catch (_) {} });

    // ── Stream engines ────────────────────────────────────────────────────────
    // EQ state is declared early because destroyEngines() can run before first playback.
    window.audioContext = null;
    let mediaElementSource, preampGain;
    const eqFilters = [];
    let isAudioInitialized = false;

    let currentHls = null, currentDash = null;
    function destroyEngines() {
        if (currentHls)  { currentHls.destroy();  currentHls  = null; }
        if (currentDash) { currentDash.reset();   currentDash = null; }
    }
    window.addEventListener("beforeunload", () => {
        destroyEngines();
        if (window.audioContext?.state !== "closed") window.audioContext?.close();
        // Clean up preview video clone if created
        if (typeof _previewVideo !== 'undefined' && _previewVideo) {
            _previewVideo.src = "";
            _previewVideo.remove();
        }
    });

    // CDN fallbacks for when local libs are unreachable
    const CDN_FALLBACKS = {
        "libs/hls.min.js":        "https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js",
        "libs/dash.all.min.js":   "https://cdn.jsdelivr.net/npm/dashjs@latest/dist/dash.all.min.js"
    };

    const loadedScripts = {};
    function loadScript(path) {
        if (!loadedScripts[path]) {
            loadedScripts[path] = new Promise((resolve, reject) => {
                const s = document.createElement("script");
                s.src = hasChromeRuntime ? chrome.runtime.getURL(path) : path;
                s.onload  = resolve;
                s.onerror = () => {
                    // Try CDN fallback before giving up
                    const cdn = CDN_FALLBACKS[path];
                    if (cdn) {
                        console.warn(`[WebPlayer] Local ${path} failed, trying CDN fallback...`);
                        const sf = document.createElement("script");
                        sf.src = cdn;
                        sf.onload  = resolve;
                        sf.onerror = () => { delete loadedScripts[path]; reject(new Error(`Failed to load ${path} (CDN fallback also failed)`)); };
                        document.head.appendChild(sf);
                    } else {
                        delete loadedScripts[path];
                        reject(new Error(`Failed to load ${path}`));
                    }
                };
                document.head.appendChild(s);
            });
        }
        return loadedScripts[path];
    }

    function populateQuality(levels) {
        qualityContainer.style.display = "flex";
        qualityDropdown.textContent = "";
        levels.forEach(({ label, value }) => {
            const btn = document.createElement("button");
            btn.className = "quality-option" + (value === -1 ? " active" : "");
            btn.textContent = label;
            btn.dataset.value = value;
            btn.setAttribute("role", "option");
            btn.setAttribute("aria-selected", value === -1 ? "true" : "false");
            qualityDropdown.appendChild(btn);
        });
        qualityDropdown.querySelectorAll(".quality-option").forEach(btn => {
            btn.tabIndex = 0;
        });
    }

    qualityDropdown.addEventListener("click", (e) => {
        const btn = e.target.closest(".quality-option");
        if (!btn) return;
        qualityDropdown.querySelectorAll(".quality-option").forEach(b => {
            b.classList.remove("active");
            b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        const val = parseInt(btn.dataset.value);
        if (currentHls) {
            currentHls.currentLevel = val;
        } else if (currentDash) {
            if (val === -1) {
                currentDash.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } });
            } else {
                currentDash.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } });
                currentDash.setQualityFor('video', val);
            }
        }
        qualityIcon.textContent = val === -1 ? "hd" : "settings";
        qualityDropdown.classList.remove("open");
    });

    function populateCC(tracks) {
        ccContainer.style.display = "flex";
        ccDropdown.textContent = "";
        
        const offBtn = document.createElement("button");
        offBtn.className = "quality-option active";
        offBtn.textContent = "Off";
        offBtn.dataset.value = "-1";
        offBtn.setAttribute("role", "option");
        offBtn.setAttribute("aria-selected", "true");
        ccDropdown.appendChild(offBtn);

        tracks.forEach(({ label, value }) => {
            if (!label) label = `Track ${value}`;
            const btn = document.createElement("button");
            btn.className = "quality-option";
            btn.textContent = label;
            btn.dataset.value = value;
            btn.setAttribute("role", "option");
            btn.setAttribute("aria-selected", "false");
            ccDropdown.appendChild(btn);
        });
        ccDropdown.querySelectorAll(".quality-option").forEach(btn => {
            btn.tabIndex = 0;
        });
    }

    ccDropdown.addEventListener("click", (e) => {
        const btn = e.target.closest(".quality-option");
        if (!btn) return;
        ccDropdown.querySelectorAll(".quality-option").forEach(b => {
            b.classList.remove("active");
            b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        const val = parseInt(btn.dataset.value);
        
        if (currentHls) {
            currentHls.subtitleTrack = val;
        } else if (currentDash) {
            if (val === -1) {
                currentDash.setTextTrack(-1);
            } else {
                const dashTracks = currentDash.getTracksFor('text');
                currentDash.setTextTrack(val);
            }
        } else {
            for (let i = 0; i < player.textTracks.length; i++) {
                player.textTracks[i].mode = (val === -1) ? "disabled" : ((i === val) ? "showing" : "hidden");
            }
        }

        ccIcon.textContent = val === -1 ? "closed_caption_disabled" : "closed_caption";
        ccDropdown.classList.remove("open");
    });

    function populateAudio(tracks, currentTrackId) {
        audioContainer.style.display = "flex";
        audioDropdown.textContent = "";

        tracks.forEach(({ label, value, id }) => {
            if (!label) label = `Track ${value}`;
            const btn = document.createElement("button");
            const isActive = (id !== undefined && id === currentTrackId) || (id === undefined && value === currentTrackId);
            btn.className = "quality-option" + (isActive ? " active" : "");
            btn.textContent = label;
            btn.dataset.value = value;
            if (id !== undefined) btn.dataset.id = id;
            btn.setAttribute("role", "option");
            btn.setAttribute("aria-selected", isActive ? "true" : "false");
            audioDropdown.appendChild(btn);
        });
        audioDropdown.querySelectorAll(".quality-option").forEach(btn => {
            btn.tabIndex = 0;
        });
    }

    audioDropdown.addEventListener("click", (e) => {
        const btn = e.target.closest(".quality-option");
        if (!btn) return;
        audioDropdown.querySelectorAll(".quality-option").forEach(b => {
            b.classList.remove("active");
            b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        
        if (currentHls) {
            currentHls.audioTrack = parseInt(btn.dataset.value);
        } else if (currentDash) {
            const dashTracks = currentDash.getTracksFor('audio');
            const targetIndex = parseInt(btn.dataset.value);
            const track = dashTracks[targetIndex] || dashTracks.find(t => t.index === targetIndex);
            if (track) currentDash.setCurrentTrack(track);
        } else {
            const tracks = Array.from(player.audioTracks || []);
            const val = parseInt(btn.dataset.value);
            for(let i = 0; i < tracks.length; i++) {
                tracks[i].enabled = (i === val);
            }
        }

        audioDropdown.classList.remove("open");
    });

    qualityBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        qualityDropdown.classList.toggle("open");
        ccDropdown.classList.remove("open");
        audioDropdown.classList.remove("open");
        qualityBtn.setAttribute("aria-expanded", qualityDropdown.classList.contains("open") ? "true" : "false");
        ccBtn.setAttribute("aria-expanded", "false");
        audioBtn.setAttribute("aria-expanded", "false");
    });
    ccBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        ccDropdown.classList.toggle("open");
        qualityDropdown.classList.remove("open");
        audioDropdown.classList.remove("open");
        ccBtn.setAttribute("aria-expanded", ccDropdown.classList.contains("open") ? "true" : "false");
        qualityBtn.setAttribute("aria-expanded", "false");
        audioBtn.setAttribute("aria-expanded", "false");
    });
    audioBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        audioDropdown.classList.toggle("open");
        qualityDropdown.classList.remove("open");
        ccDropdown.classList.remove("open");
        audioBtn.setAttribute("aria-expanded", audioDropdown.classList.contains("open") ? "true" : "false");
        qualityBtn.setAttribute("aria-expanded", "false");
        ccBtn.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("click", () => {
        qualityDropdown.classList.remove("open");
        ccDropdown.classList.remove("open");
        audioDropdown.classList.remove("open");
        qualityBtn.setAttribute("aria-expanded", "false");
        ccBtn.setAttribute("aria-expanded", "false");
        audioBtn.setAttribute("aria-expanded", "false");
    });

    // ── Theme ─────────────────────────────────────────────────────────────────
    const currentTheme = localStorage.getItem("wp_theme") || "blue";
    document.documentElement.setAttribute("data-theme", currentTheme);
    themeBtns.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.value === currentTheme);
        btn.addEventListener("click", () => {
            const t = btn.dataset.value;
            localStorage.setItem("wp_theme", t);
            document.documentElement.setAttribute("data-theme", t);
            themeBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    // ── Source attachment ─────────────────────────────────────────────────────
    function detectSourceKind(src) {
        const rawSrc = String(src || "");
        const lowerSrc = rawSrc.toLowerCase();
        let decodedSrc = lowerSrc;
        try { decodedSrc = decodeURIComponent(lowerSrc); } catch (_) {}

        // Common direct/encoded manifest markers
        if (decodedSrc.includes(".m3u8")) return "hls";
        if (decodedSrc.includes(".mpd")) return "dash";

        // Extensionless manifest endpoints often advertise format/type in query
        try {
            const u = new URL(decodedSrc, window.location.href);
            const path = (u.pathname || "").toLowerCase();
            if (path.endsWith(".m3u8")) return "hls";
            if (path.endsWith(".mpd")) return "dash";

            const queryAndHash = `${u.search || ""}${u.hash || ""}`.toLowerCase();
            if (
                /(?:^|[?&#])(?:format|type|mime|ext|container)=(?:[^&#]*(?:mpegurl|hls|m3u8))/.test(queryAndHash) ||
                /(?:^|[?&#])(?:hls|playlist|master)=/.test(queryAndHash)
            ) return "hls";

            if (
                /(?:^|[?&#])(?:format|type|mime|ext|container)=(?:[^&#]*(?:dash|mpd|application\/dash\+xml))/.test(queryAndHash) ||
                /(?:^|[?&#])(?:manifest|dash)=/.test(queryAndHash)
            ) return "dash";
        } catch (_) {}

        return "native";
    }

    async function attachSource(src) {
        destroyEngines();
        bufferEl.classList.add("is-buffering");
        qualityContainer.style.display = "none";
        ccContainer.style.display = "none";
        audioContainer.style.display = "none";

        const lowerSrc = String(src || "").toLowerCase();
        const sourceKind = detectSourceKind(src);
        const isStream = sourceKind !== "native";

        // Only set crossOrigin for direct/native playback; HLS.js and DASH.js
        // manage their own XHR pipeline — the attribute can interfere with MediaSource.
        if (!isStream && !lowerSrc.startsWith("blob:") && !lowerSrc.startsWith("data:")) {
            player.crossOrigin = "anonymous";
        }

        try {
            if (sourceKind === "hls") {
                if (player.canPlayType("application/vnd.apple.mpegurl")) {
                    // Safari native HLS — set crossOrigin since browser handles fetch
                    player.crossOrigin = "anonymous";
                    player.src = src;
                    // Explicitly trigger play for native HLS
                    player.addEventListener("loadedmetadata", () => safePlay(), { once: true });
                } else {
                    await loadScript("libs/hls.min.js");
                    if (window.Hls && Hls.isSupported()) {
                        currentHls = new Hls({
                            enableWorker: false, // <-- CHANGED TO FALSE FOR MANIFEST V3 COMPATIBILITY
                            startLevel: -1,
                            manifestLoadingMaxRetry: 6,
                            levelLoadingMaxRetry: 6,
                            fragLoadingMaxRetry: 6,
                            ...(isStandaloneMode ? {
                                lowLatencyMode: false,
                                maxBufferLength: 6,
                                maxMaxBufferLength: 8,
                                maxBufferSize: STANDALONE_HLS_MAX_BUFFER_BYTES
                            } : {})
                        });
                        currentHls.loadSource(src);
                        currentHls.attachMedia(player);
                        currentHls.on(Hls.Events.MANIFEST_PARSED, (e, d) => {
                            safePlay();
                            // U14: Always show quality if it's a stream, even if 1 level, but prefer levels > 1
                            if (d.levels && d.levels.length > 0) {
                                const levels = [
                                    ...(d.levels.length > 1 ? [{ label: "Auto", value: -1 }] : []),
                                    ...d.levels.map((l, i) => ({ label: `${l.height}p`, value: i }))
                                ];
                                populateQuality(levels);
                            }
                            if (d.subtitleTracks && d.subtitleTracks.length > 0) {
                                const tracks = d.subtitleTracks.map((t, i) => ({ label: t.name || t.lang, value: i }));
                                populateCC(tracks);
                            }
                            if (d.audioTracks && d.audioTracks.length > 0) {
                                const tracks = d.audioTracks.map((t, i) => ({ label: t.name || t.lang || `Audio ${i+1}`, value: i, id: t.id }));
                                populateAudio(tracks, currentHls.audioTrack);
                            }
                        });
                        currentHls.on(Hls.Events.AUDIO_TRACK_LOADED, (e, d) => {});
                        currentHls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (e, d) => {
                            if (d.audioTracks && d.audioTracks.length > 0) {
                                const tracks = d.audioTracks.map((t, i) => ({ label: t.name || t.lang || `Audio ${i+1}`, value: i, id: t.id }));
                                populateAudio(tracks, currentHls.audioTrack);
                            }
                        });
                        currentHls.on(Hls.Events.LEVEL_SWITCHING, () => {
                            const lvls = currentHls.levels;
                            if (lvls && lvls.length > 0) {
                                const levels = [
                                    ...(lvls.length > 1 ? [{ label: "Auto", value: -1 }] : []),
                                    ...lvls.map((l, i) => ({ label: `${l.height}p`, value: i }))
                                ];
                                populateQuality(levels);
                            }
                        });
                        // One-shot recovery flags — prevent infinite retry loops.
                        // Flags are reset on `playing` so a later transient error
                        // can also be recovered once.
                        let _hlsMediaRecovered = false;
                        let _hlsNetworkRecovered = false;
                        player.addEventListener("playing", () => {
                            _hlsMediaRecovered = false;
                            _hlsNetworkRecovered = false;
                        });
                        currentHls.on(Hls.Events.ERROR, (e, d) => {
                            if (d.fatal) {
                                const typeMap = {
                                    [Hls.ErrorTypes.NETWORK_ERROR]: "Network Error",
                                    [Hls.ErrorTypes.MEDIA_ERROR]: "Decode Error",
                                    [Hls.ErrorTypes.OTHER_ERROR]: "Stream Error"
                                };
                                if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !_hlsMediaRecovered) {
                                    console.warn('[WebPlayer] HLS media error, attempting recovery...');
                                    _hlsMediaRecovered = true;
                                    currentHls.recoverMediaError();
                                    return;
                                }
                                if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !_hlsNetworkRecovered) {
                                    console.warn('[WebPlayer] HLS network error, attempting recovery...');
                                    _hlsNetworkRecovered = true;
                                    currentHls.startLoad();
                                    return;
                                }
                                showError(
                                    mapPlaybackErrorMessage(d.details, 'Fatal playback error'),
                                    mapPlaybackErrorType(d.details, typeMap[d.type] || "Stream Error"),
                                    src
                                );
                                currentHls.destroy();
                                currentHls = null;
                            }
                        });
                    } else { showError("HLS not supported in this browser."); }
                }
            } else if (sourceKind === "dash") {
                await loadScript("libs/dash.all.min.js");
                if (window.dashjs) {
                    currentDash = dashjs.MediaPlayer().create();
                    if (isStandaloneMode) {
                        currentDash.updateSettings({
                            streaming: {
                                buffer: {
                                    bufferTimeDefault: 4,
                                    bufferTimeAtTopQuality: 6,
                                    bufferTimeAtTopQualityLongForm: 8
                                },
                                liveDelay: 4
                            }
                        });
                    }
                    currentDash.initialize(player, src, true);
                    
                    currentDash.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
                        safePlay();
                        const bitrates = currentDash.getBitrateInfoListFor("video");
                        if (bitrates && bitrates.length > 0) {
                            const levels = [
                                ...(bitrates.length > 1 ? [{ label: "Auto", value: -1 }] : []),
                                ...bitrates.map((b, i) => ({ label: `${b.height}p`, value: i }))
                            ];
                            populateQuality(levels);
                        }
                        const textTracks = currentDash.getTracksFor("text");
                        if (textTracks && textTracks.length > 0) {
                            const tracks = textTracks.map((t, i) => ({ label: t.lang || t.id, value: i }));
                            populateCC(tracks);
                        }
                        const audioTracks = currentDash.getTracksFor("audio");
                        if (audioTracks && audioTracks.length > 0) {
                            const activeTrack = currentDash.getCurrentTrackFor("audio");
                            const tracks = audioTracks.map((t, i) => ({ label: t.lang || t.id || `Audio ${i+1}`, value: i, id: t.id }));
                            populateAudio(tracks, activeTrack ? activeTrack.index : 0);
                        }
                    });
                    currentDash.on(dashjs.MediaPlayer.events.ERROR, (e) => {
                        if (e.error) {
                            showError(
                                mapPlaybackErrorMessage(e.error.message, 'Stream playback failed'),
                                mapPlaybackErrorType(e.error.message, "DASH Error"),
                                src
                            );
                        }
                    });
                } else { showError("DASH not supported in this browser."); }
            } else {
                player.src = src;
                player.addEventListener("loadedmetadata", () => {
                    safePlay();
                    if (player.textTracks && player.textTracks.length > 0) {
                        const tracks = Array.from(player.textTracks).map((t, i) => ({ label: t.label || t.language || `Track ${i+1}`, value: i }));
                        populateCC(tracks);
                    }
                    if (player.audioTracks && player.audioTracks.length > 0) {
                        const tracks = Array.from(player.audioTracks).map((t, i) => ({ label: t.label || t.language || `Audio ${i+1}`, value: i, id: t.id }));
                        const active = Array.from(player.audioTracks).findIndex(t => t.enabled);
                        populateAudio(tracks, active === -1 ? 0 : active);
                    }
                }, { once: true });
            }
        } catch (err) {
            showError(`Failed to load stream: ${err.message}`, "Load Error", src);
            bufferEl.classList.remove("is-buffering");
        }
    }
    // Ask background to refresh DNR rules (CORS + Referer) for this tab.
    // The open_player handler already pre-applies rules when it creates the
    // tab, so this is a refresh / safety-net.  Retry up to 2 extra times in
    // case the service worker was suspended when the message arrived.
    const _canMessage = typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function";
    if (_canMessage && videoSrc) {
        const sendSetupDnr = (retriesLeft) => {
            try {
                chrome.runtime.sendMessage(
                    { action: "setup_dnr", videoSrc: videoSrc, embedUrl: embedUrl },
                    (resp) => {
                        if (chrome.runtime.lastError) {
                            console.warn("[WebPlayer] setup_dnr attempt failed:", chrome.runtime.lastError.message);
                            if (retriesLeft > 0) {
                                setTimeout(() => sendSetupDnr(retriesLeft - 1), 300);
                                return;
                            }
                            // All retries exhausted — proceed anyway; the
                            // open_player pre-applied rules may still be active.
                        }
                        attachSource(videoSrc);
                    }
                );
            } catch (_) {
                // Extension context unavailable — load directly
                attachSource(videoSrc);
            }
        };
        sendSetupDnr(2);
    } else {
        attachSource(videoSrc);
    }

    // ── SponsorBlock ──────────────────────────────────────────────────────────
    window.__isSkipping = false;

    async function fetchSegments() {
        try {
            let videoId = null;
            for (const candidate of [pageUrl, videoSrc]) {
                const match = /(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/.exec(candidate);
                if (match) { videoId = match[1]; break; }
            }
            if (!videoId) return [];
            const res = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}`);
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch { return []; }
    }

    let skipSegments = [];
    fetchSegments().then(segs => { skipSegments = segs; });
    const skippedIds = new Set();

    // UI FIX: show specific segment category in badge
    const SEGMENT_LABELS = {
        sponsor:        "Sponsor Skipped",
        intro:          "Intro Skipped",
        outro:          "Outro Skipped",
        selfpromo:      "Self-Promo Skipped",
        interaction:    "Interaction Skipped",
        music_offtopic: "Music Skipped",
        preview:        "Preview Skipped",
    };

    function showSkipBadge(category = "sponsor") {
        skipBadge.textContent = SEGMENT_LABELS[category] || "Segment Skipped";
        skipBadge.style.display = "block";
        requestAnimationFrame(() => skipBadge.classList.add("showing"));
        setTimeout(() => {
            skipBadge.classList.remove("showing");
            setTimeout(() => { skipBadge.style.display = "none"; }, 200);
        }, 2500); // U12: Visible for 2.5s for readability
    }

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
                showSkipBadge(seg.category);
                player.addEventListener("seeked", () => { window.__isSkipping = false; }, { once: true });
                setTimeout(() => { window.__isSkipping = false; }, 1000);
                break;
            }
        }
    });

    // ── Progress bar ──────────────────────────────────────────────────────────
    const formatTime = (sec) => {
        if (!isFinite(sec)) return "0:00";
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60).toString().padStart(2, "0");
        if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s}`;
        return `${m}:${s}`;
    };

    let isDraggingProgress = false;

    player.addEventListener("loadedmetadata", () => {
        timeDur.textContent = isFinite(player.duration) ? formatTime(player.duration) : "Live";
    });
    player.addEventListener("timeupdate", () => {
        if (isDraggingProgress) return;
        timeCur.textContent = formatTime(player.currentTime);
        if (isFinite(player.duration) && player.duration > 0) {
            const pct = (player.currentTime / player.duration) * 100;
            progPlayed.style.width = `${pct}%`;
            progThumb.style.left   = `${pct}%`;
        }
    });
    player.addEventListener("progress", () => {
        if (!isFinite(player.duration) || player.duration === 0) return;
        let maxEnd = 0;
        for (let i = 0; i < player.buffered.length; i++) {
            if (player.buffered.start(i) <= player.currentTime + 1)
                maxEnd = Math.max(maxEnd, player.buffered.end(i));
        }
        progBuffered.style.width = `${(maxEnd / player.duration) * 100}%`;
    });

    // ── Seek thumbnail preview (#3) ───────────────────────────────────────────
    const seekPreview      = document.getElementById("seek-preview");
    const seekPreviewCanvas = document.getElementById("seek-preview-canvas");
    const seekPreviewTime  = document.getElementById("seek-preview-time");
    const seekCtx          = seekPreviewCanvas.getContext("2d");
    let seekPreviewTimer   = null;
    let lastPreviewTime    = -1;

    // Use a hidden clone video for thumbnail generation to avoid flicker on main player
    let _previewVideo = null;
    let _previewVideoReady = false;
    const getPreviewVideo = () => {
        if (_previewVideo) return _previewVideo;
        _previewVideo = document.createElement("video");
        _previewVideo.preload = "auto";
        _previewVideo.muted = true;
        _previewVideo.playsInline = true;
        _previewVideo.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none;z-index:-1;";
        // For native/direct sources we can clone the src directly
        if (player.src && !player.src.startsWith("blob:")) {
            _previewVideo.crossOrigin = "anonymous";
            _previewVideo.src = player.src;
        } else {
            // HLS/DASH use blob URLs — can't clone, fall back to main player seeking
            _previewVideo = null;
            return null;
        }
        _previewVideo.addEventListener("loadeddata", () => { _previewVideoReady = true; }, { once: true });
        document.body.appendChild(_previewVideo);
        return _previewVideo;
    };

    const capturePreviewFrame = (time) => {
        const pv = getPreviewVideo();
        if (pv && _previewVideoReady) {
            // Use clone video — no flicker on main player
            const onSeeked = () => {
                try { seekCtx.drawImage(pv, 0, 0, 320, 180); } catch (_) {}
                pv.removeEventListener("seeked", onSeeked);
            };
            pv.addEventListener("seeked", onSeeked, { once: true });
            pv.currentTime = time;
        } else if (!pv && player.paused && player.readyState >= 2) {
            // Fallback: seek main player only when paused (blob/stream sources)
            const savedTime = player.currentTime;
            const onSeeked = () => {
                try { seekCtx.drawImage(player, 0, 0, 320, 180); } catch (_) {}
                player.removeEventListener("seeked", onSeeked);
                if (!isDraggingProgress) player.currentTime = savedTime;
            };
            player.addEventListener("seeked", onSeeked, { once: true });
            player.currentTime = time;
        }
    };

    progWrapper.addEventListener("pointermove", (e) => {
        if (isDraggingProgress || !isFinite(player.duration) || player.duration === 0) {
            seekPreview.classList.remove("visible"); return;
        }
        const rect = progWrapper.getBoundingClientRect();
        const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const time = pct * player.duration;

        // Position the preview tooltip
        const leftPx = Math.max(85, Math.min(rect.width - 85, e.clientX - rect.left));
        seekPreview.style.left = `${leftPx}px`;
        seekPreviewTime.textContent = formatTime(time);
        seekPreview.classList.add("visible");

        // Debounced canvas thumbnail
        clearTimeout(seekPreviewTimer);
        seekPreviewTimer = setTimeout(() => {
            if (Math.abs(time - lastPreviewTime) < 0.5) return;
            lastPreviewTime = time;
            capturePreviewFrame(time);
        }, 200);
    });
    progWrapper.addEventListener("pointerleave", () => {
        seekPreview.classList.remove("visible");
        clearTimeout(seekPreviewTimer);
        lastPreviewTime = -1;
    });

    let pendingSeekPct = 0;
    const getPointerX = (e) => {
        // Support both pointer and touch events
        if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
        if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
        return e.clientX;
    };
    const updateProgressFromEvent = (e) => {
        if (!isFinite(player.duration)) return;
        const rect = progWrapper.getBoundingClientRect();
        pendingSeekPct = Math.max(0, Math.min(1, (getPointerX(e) - rect.left) / rect.width));
        progPlayed.style.width = `${pendingSeekPct * 100}%`;
        progThumb.style.left   = `${pendingSeekPct * 100}%`;
        timeCur.textContent = formatTime(pendingSeekPct * player.duration);
        
        // Show and update seek thumbnail during drag
        const time = pendingSeekPct * player.duration;
        const leftPx = Math.max(85, Math.min(rect.width - 85, pendingSeekPct * rect.width));
        seekPreview.style.left = `${leftPx}px`;
        seekPreviewTime.textContent = formatTime(time);
        seekPreview.classList.add("visible");
        
        clearTimeout(seekPreviewTimer);
        seekPreviewTimer = setTimeout(() => {
            if (Math.abs(time - lastPreviewTime) < 0.5) return;
            lastPreviewTime = time;
            const onSeeked = () => {
                try { seekCtx.drawImage(player, 0, 0, 320, 180); } catch (_) {}
                player.removeEventListener("seeked", onSeeked);
            };
            if (player.readyState >= 2) {
                player.addEventListener("seeked", onSeeked, { once: true });
                player.currentTime = time;
            }
        }, 150);
    };

    progWrapper.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingProgress = true;
        
        window.__wasPlayingBeforeDrag = !player.paused;
        if (window.__wasPlayingBeforeDrag) safePause();
        
        progWrapper.classList.add("dragging");
        try { progWrapper.setPointerCapture(e.pointerId); } catch (_) {}
        updateProgressFromEvent(e);
        const onMove = (ev) => { ev.preventDefault(); updateProgressFromEvent(ev); };
        const onUp   = (ev) => {
            isDraggingProgress = false;
            seekPreview.classList.remove("visible");
            progWrapper.classList.remove("dragging");
            try { progWrapper.releasePointerCapture(ev.pointerId); } catch (_) {}
            
            if (isFinite(player.duration)) {
                player.currentTime = pendingSeekPct * player.duration;
                if (window.__wasPlayingBeforeDrag) {
                    player.addEventListener("seeked", () => safePlay(), { once: true });
                }
            }
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup",   onUp);
            window.removeEventListener("pointercancel", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup",   onUp);
        window.addEventListener("pointercancel", onUp);
    });

    // Touch event fallback for mobile devices where pointer events may not fire reliably
    progWrapper.addEventListener("touchstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingProgress = true;
        
        window.__wasPlayingBeforeDrag = !player.paused;
        if (window.__wasPlayingBeforeDrag) safePause();
        
        progWrapper.classList.add("dragging");
        updateProgressFromEvent(e);
    }, { passive: false });
    progWrapper.addEventListener("touchmove", (e) => {
        if (!isDraggingProgress) return;
        e.preventDefault();
        e.stopPropagation();
        updateProgressFromEvent(e);
    }, { passive: false });
    const completeTouchDrag = (shouldSeek) => {
        if (!isDraggingProgress) return;
        isDraggingProgress = false;
        seekPreview.classList.remove("visible");
        progWrapper.classList.remove("dragging");
        if (shouldSeek && isFinite(player.duration)) {
            player.currentTime = pendingSeekPct * player.duration;
            if (window.__wasPlayingBeforeDrag) {
                player.addEventListener("seeked", () => safePlay(), { once: true });
            }
        }
    };
    progWrapper.addEventListener("touchend", (e) => {
        if (!isDraggingProgress) return;
        e.preventDefault();
        completeTouchDrag(true);
    }, { passive: false });
    // Catch touch events that end outside the progress bar element
    document.addEventListener("touchend", () => completeTouchDrag(true), { passive: true });
    document.addEventListener("touchcancel", () => completeTouchDrag(false), { passive: true });

    // ── Playback rate helper — keeps speed pills in sync ──────────────────────
    const speedMicroRange  = document.getElementById("speed-micro-range");
    const speedMicroLabel  = document.getElementById("speed-micro-label");
    qualityBtn.setAttribute("aria-haspopup", "listbox");
    qualityBtn.setAttribute("aria-expanded", "false");
    qualityBtn.setAttribute("aria-controls", "quality-dropdown");
    ccBtn.setAttribute("aria-haspopup", "listbox");
    ccBtn.setAttribute("aria-expanded", "false");
    ccBtn.setAttribute("aria-controls", "cc-dropdown");
    audioBtn.setAttribute("aria-haspopup", "listbox");
    audioBtn.setAttribute("aria-expanded", "false");
    audioBtn.setAttribute("aria-controls", "audio-dropdown");
    speedToggleBtn.setAttribute("aria-haspopup", "dialog");
    speedToggleBtn.setAttribute("aria-expanded", "false");
    speedToggleBtn.setAttribute("aria-controls", "speed-popover");
    themeToggleBtn.setAttribute("aria-haspopup", "dialog");
    themeToggleBtn.setAttribute("aria-expanded", "false");
    themeToggleBtn.setAttribute("aria-controls", "theme-popover");
    eqToggleBtn.setAttribute("aria-haspopup", "dialog");
    eqToggleBtn.setAttribute("aria-expanded", "false");
    eqToggleBtn.setAttribute("aria-controls", "eq-popover");
    muteBtn.setAttribute("aria-pressed", player.muted ? "true" : "false");
    rotateBtn.setAttribute("aria-pressed", "false");
    pipBtn.setAttribute("aria-pressed", "false");
    fsBtn.setAttribute("aria-pressed", "false");

    const setPlaybackRate = (rate) => {
        player.playbackRate = rate;
        speedPillsEl.querySelectorAll(".speed-pill").forEach(p =>
            p.classList.toggle("active", parseFloat(p.dataset.speed) === rate)
        );
        speedMicroRange.value = rate;
        speedMicroLabel.textContent = `${rate.toFixed(2)}×`;
    };

    // ── Play / Pause ──────────────────────────────────────────────────────────
    const togglePlay = () => {
        const wasPaused = player.paused;
        wasPaused ? safePlay() : safePause();
        showFeedback(wasPaused ? "Playing" : "Paused"); // BUG FIX: capture state before toggle
    };
    playBtn.addEventListener("click", togglePlay);
    player.addEventListener("play", () => {
        if (currentHls && typeof currentHls.startLoad === "function") {
            try { currentHls.startLoad(); } catch (_) {}
        }
        if (window.audioContext?.state === "suspended") {
            window.audioContext.resume().catch(() => {});
        }
        playIcon.textContent = "pause";
    });
    player.addEventListener("pause", () => playIcon.textContent = "play_arrow");

    // ── Buffering ─────────────────────────────────────────────────────────────
    // BUG FIX: also clear spinner on canplay and pause (prevents permanent spinner)
    player.addEventListener("waiting",  () => bufferEl.classList.add("is-buffering"));
    player.addEventListener("playing",  () => bufferEl.classList.remove("is-buffering"));
    player.addEventListener("canplay",  () => bufferEl.classList.remove("is-buffering"));
    player.addEventListener("pause",    () => bufferEl.classList.remove("is-buffering"));
    player.addEventListener("error",    () => bufferEl.classList.remove("is-buffering"));

    // ── Volume ────────────────────────────────────────────────────────────────
    const updateVolIcon = () => {
        if (player.muted || player.volume === 0) muteIcon.textContent = "volume_off";
        else if (player.volume < 0.5)            muteIcon.textContent = "volume_down";
        else                                      muteIcon.textContent = "volume_up";
    };

    volumeSlider.addEventListener("input", (e) => {
        player.volume = parseFloat(e.target.value);
        player.muted  = player.volume === 0;
        updateVolIcon();
    });
    muteBtn.addEventListener("click", () => {
        if (player.volume === 0 && player.muted) {
            player.volume = 1;
            player.muted = false;
        } else if (player.volume === 0 && !player.muted) {
            player.volume = 1;
        } else {
            player.muted = !player.muted;
        }
        volumeSlider.value = player.muted ? 0 : player.volume;
        updateVolIcon();
        muteBtn.setAttribute("aria-pressed", player.muted ? "true" : "false");
    });

    // ── Speed controls ─────────────────────────────────────────────────────────
    speedPillsEl.querySelectorAll(".speed-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            setPlaybackRate(parseFloat(pill.dataset.speed));
            resetIdle();
        });
    });

    speedMicroRange.addEventListener("input", (e) => {
        setPlaybackRate(parseFloat(e.target.value));
        resetIdle();
    });

    speedToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasActive = speedPopover.classList.contains("active");
        closeAllPopovers();
        if (!wasActive) {
            speedPopover.classList.add("active");
            speedToggleBtn.setAttribute("aria-expanded", "true");
        }
        resetIdle();
    });

    speedCloseBtn.addEventListener("click", () => {
        speedPopover.classList.remove("active");
        speedToggleBtn.setAttribute("aria-expanded", "false");
        resetIdle();
    });

    // ── Fullscreen ────────────────────────────────────────────────────────────
    let rotationDeg = 0;
    const toggleFS = async (triggerEvent) => {
        try {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                // U5: Unlock orientation when exiting fullscreen
                try { screen.orientation?.unlock?.(); } catch (_) {}
                const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
                if (exitFn) await exitFn.call(document);
            } else {
                if (triggerEvent && !triggerEvent.isTrusted) { showFeedback("Fullscreen blocked"); return; }
                if (!triggerEvent && document.userActivation && !document.userActivation.isActive) {
                    showFeedback("Fullscreen blocked");
                    return;
                }
                const req = container.requestFullscreen || container.webkitRequestFullscreen;
                const fsEnabled = (document.fullscreenEnabled !== false) || !!document.webkitFullscreenEnabled;
                if (!req || !fsEnabled) { showFeedback("Fullscreen unavailable"); return; }
                await req.call(container);
                // U5: Lock to landscape natively on mobile for horizontal videos
                try {
                    const isHorizontal = player.videoWidth >= player.videoHeight;
                    if (isHorizontal || rotationDeg % 180 !== 0) {
                        await screen.orientation?.lock?.('landscape');
                    }
                    if (rotationDeg % 180 !== 0) {
                        player.style.transform = 'none';
                    }
                } catch (_) {}
            }
        } catch (err) {
            const msg = String(err?.message || "");
            if (err?.name === "NotAllowedError" || msg.includes("user gesture") || msg.includes("Permissions check failed")) {
                showFeedback("Fullscreen blocked");
                return;
            }
            console.warn("Fullscreen request denied", err);
        }
    };
    fsBtn.addEventListener("click", (e) => toggleFS(e));
    const onFSChange = () => {
        const isFS = document.fullscreenElement || document.webkitFullscreenElement;
        fsIcon.textContent = isFS ? "fullscreen_exit" : "fullscreen";
        if (!isFS && rotationDeg % 180 !== 0) {
            player.style.transform = `rotate(${rotationDeg}deg)`;
        }
        fsBtn.setAttribute("aria-pressed", isFS ? "true" : "false");
    };
    document.addEventListener("fullscreenchange",       onFSChange);
    document.addEventListener("webkitfullscreenchange", onFSChange);

    // ── PiP ───────────────────────────────────────────────────────────────────
    pipBtn.addEventListener("click", async () => {
        try {
            document.pictureInPictureElement
                ? await document.exitPictureInPicture()
                : await player.requestPictureInPicture();
            pipBtn.setAttribute("aria-pressed", document.pictureInPictureElement ? "true" : "false");
        } catch (err) { console.warn("PiP blocked", err); showFeedback("PiP Blocked"); }
    });
    player.addEventListener("enterpictureinpicture", () => pipBtn.setAttribute("aria-pressed", "true"));
    player.addEventListener("leavepictureinpicture", () => pipBtn.setAttribute("aria-pressed", "false"));

    // ── Rotate ────────────────────────────────────────────────────────────────
    rotateBtn.addEventListener("click", () => {
        rotationDeg = (rotationDeg + 90) % 360;
        player.style.transform  = `rotate(${rotationDeg}deg)`;
        player.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
        rotateBtn.setAttribute("aria-pressed", rotationDeg !== 0 ? "true" : "false");
    });

    // ── Idle (auto-hide controls) ─────────────────────────────────────────────
    let idleTimer;
    const resetIdle = () => {
        container.classList.remove("idle");
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            if (!player.paused && !isDraggingProgress &&
                !eqPopover.classList.contains("active") &&
                !themePopover.classList.contains("active") &&
                !shortcutsModal.classList.contains("active") &&
                !speedPopover.classList.contains("active") &&
                !qualityDropdown.classList.contains("open") &&
                !ccDropdown.classList.contains("open") &&
                !audioDropdown.classList.contains("open")) {
                container.classList.add("idle");
            }
        }, 3000);
    };
    container.addEventListener("pointermove", resetIdle);
    container.addEventListener("pointerdown", resetIdle);
    eqPopover.addEventListener("pointermove", resetIdle); // BUG FIX: EQ interaction resets idle
    player.addEventListener("play",  resetIdle);
    player.addEventListener("pause", () => container.classList.remove("idle"));

    // Keep mobile viewport height in sync with dynamic browser UI (address/tool bars)
    const syncViewportHeight = () => {
        const vh = (window.visualViewport?.height || window.innerHeight) * 0.01;
        document.documentElement.style.setProperty("--wp-vh", `${vh}px`);
    };
    syncViewportHeight();
    window.addEventListener("resize", syncViewportHeight, { passive: true });
    window.visualViewport?.addEventListener("resize", syncViewportHeight, { passive: true });

    // Scroll indicator for mobile controls row (Bug #2 fix)
    const controlsRowEl = document.querySelector('.controls-row');
    if (controlsRowEl) {
        const updateScrollIndicator = () => {
            const hasOverflow = controlsRowEl.scrollWidth > controlsRowEl.clientWidth + 4;
            const nearEnd = controlsRowEl.scrollLeft + controlsRowEl.clientWidth >= controlsRowEl.scrollWidth - 8;
            const nearStart = controlsRowEl.scrollLeft <= 8;
            controlsRowEl.classList.toggle('can-scroll-right', hasOverflow && !nearEnd);
            controlsRowEl.classList.toggle('can-scroll-left', hasOverflow && !nearStart);
        };
        controlsRowEl.addEventListener('scroll', updateScrollIndicator, { passive: true });
        new ResizeObserver(updateScrollIndicator).observe(controlsRowEl);
        updateScrollIndicator();
    }

    // ── Popovers ──────────────────────────────────────────────────────────────
    const closeAllPopovers = () => {
        eqPopover.classList.remove("active");
        themePopover.classList.remove("active");
        speedPopover.classList.remove("active");
        qualityDropdown.classList.remove("open");
        ccDropdown.classList.remove("open");
        audioDropdown.classList.remove("open");
        themeToggleBtn.setAttribute("aria-expanded", "false");
        eqToggleBtn.setAttribute("aria-expanded", "false");
        qualityBtn.setAttribute("aria-expanded", "false");
        ccBtn.setAttribute("aria-expanded", "false");
        audioBtn.setAttribute("aria-expanded", "false");
        speedToggleBtn.setAttribute("aria-expanded", "false");
    };

    themeToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasActive = themePopover.classList.contains("active");
        closeAllPopovers();
        if (!wasActive) {
            themePopover.classList.add("active");
            themeToggleBtn.setAttribute("aria-expanded", "true");
        }
        resetIdle();
    });
    themeCloseBtn.addEventListener("click", () => {
        themePopover.classList.remove("active");
        themeToggleBtn.setAttribute("aria-expanded", "false");
        resetIdle();
    });

    eqToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasActive = eqPopover.classList.contains("active");
        closeAllPopovers();
        if (!wasActive) {
            eqPopover.classList.add("active");
            eqToggleBtn.setAttribute("aria-expanded", "true");
        }
        resetIdle();
    });
    eqCloseBtn.addEventListener("click", () => {
        eqPopover.classList.remove("active");
        eqToggleBtn.setAttribute("aria-expanded", "false");
        resetIdle();
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#theme-popover") && !e.target.closest("#theme-toggle-btn")) {
            themePopover.classList.remove("active");
            themeToggleBtn.setAttribute("aria-expanded", "false");
        }
        if (!e.target.closest("#eq-popover") && !e.target.closest("#eq-toggle-btn")) {
            eqPopover.classList.remove("active");
            eqToggleBtn.setAttribute("aria-expanded", "false");
        }
        if (!e.target.closest("#speed-popover") && !e.target.closest("#speed-toggle-btn")) {
            speedPopover.classList.remove("active");
            speedToggleBtn.setAttribute("aria-expanded", "false");
        }
        if (!e.target.closest("#quality-dropdown") && !e.target.closest("#quality-btn")) {
            qualityDropdown.classList.remove("open");
            qualityBtn.setAttribute("aria-expanded", "false");
        }
        if (!e.target.closest("#cc-dropdown") && !e.target.closest("#cc-btn")) {
            ccDropdown.classList.remove("open");
            ccBtn.setAttribute("aria-expanded", "false");
        }
        if (!e.target.closest("#audio-dropdown") && !e.target.closest("#audio-btn")) {
            audioDropdown.classList.remove("open");
            audioBtn.setAttribute("aria-expanded", "false");
        }
    });

    [qualityDropdown, ccDropdown, audioDropdown].forEach(dropdown => {
        dropdown.addEventListener("keydown", (e) => {
            const options = Array.from(dropdown.querySelectorAll(".quality-option"));
            if (!options.length) return;
            const activeElement = document.activeElement;
            const currentIndex = options.indexOf(activeElement);
            if (e.key === "ArrowDown") {
                e.preventDefault();
                options[(currentIndex + 1 + options.length) % options.length].focus();
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                options[(currentIndex - 1 + options.length) % options.length].focus();
            } else if (e.key === "Enter" || e.key === " ") {
                if (activeElement?.classList?.contains("quality-option")) {
                    e.preventDefault();
                    activeElement.click();
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                closeAllPopovers();
            }
        });
    });

    // ── Shortcuts side panel (#9) ─────────────────────────────────────────────
    let shortcutsLastFocusedEl = null;
    const isInAriaHiddenTree = (el) => {
        let node = el;
        while (node && node !== document.body) {
            if (node.getAttribute?.("aria-hidden") === "true") return true;
            node = node.parentElement;
        }
        return false;
    };
    const getShortcutsFocusableEls = () =>
        Array.from(shortcutsModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(el => !el.hasAttribute("disabled") && !isInAriaHiddenTree(el));

    const openShortcuts = () => {
        if (shortcutsModal.classList.contains("active")) return;
        shortcutsLastFocusedEl = document.activeElement;
        shortcutsModal.classList.add("active");
        requestAnimationFrame(() => {
            (getShortcutsFocusableEls()[0] || shortcutsClose).focus();
        });
    };
    const closeShortcuts = () => {
        if (!shortcutsModal.classList.contains("active")) return;
        shortcutsModal.classList.remove("active");
        if (shortcutsLastFocusedEl && shortcutsLastFocusedEl.isConnected) {
            shortcutsLastFocusedEl.focus();
        } else {
            shortcutsBtn.focus();
        }
    };
    const toggleShortcuts = () => {
        if (shortcutsModal.classList.contains("active")) closeShortcuts();
        else openShortcuts();
    };

    shortcutsBtn.addEventListener("click", toggleShortcuts);
    shortcutsClose.addEventListener("click", closeShortcuts);
    shortcutsModal.addEventListener("keydown", (e) => {
        if (!shortcutsModal.classList.contains("active")) return;
        if (e.key === "Escape") {
            e.preventDefault();
            closeShortcuts();
            return;
        }
        if (e.key !== "Tab") return;
        const focusable = getShortcutsFocusableEls();
        if (!focusable.length) return;
        const currentIndex = focusable.indexOf(document.activeElement);
        if (e.shiftKey) {
            if (currentIndex <= 0) {
                e.preventDefault();
                focusable[focusable.length - 1].focus();
            }
        } else if (currentIndex === -1 || currentIndex === focusable.length - 1) {
            e.preventDefault();
            focusable[0].focus();
        }
    });

    // ── Feedback overlay (#4: directional positioning) ─────────────────────────
    let feedbackTimer;
    const showFeedback = (text, position) => {
        feedbackOverlay.textContent = text;
        feedbackOverlay.classList.remove("feedback-left", "feedback-right");
        if (position === "left")  feedbackOverlay.classList.add("feedback-left");
        if (position === "right") feedbackOverlay.classList.add("feedback-right");
        feedbackOverlay.style.opacity = 1;
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => feedbackOverlay.style.opacity = 0, 800);
    };

    const isTextEntryTarget = (target) => {
        if (!target) return false;
        if (target.isContentEditable) return true;
        const tag = target.tagName;
        if (tag === "TEXTAREA" || tag === "SELECT") return true;
        if (tag !== "INPUT") return false;
        const type = (target.type || "").toLowerCase();
        return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type);
    };

    // ── Keyboard shortcuts (BUG FIX: was completely unimplemented) ────────────
    document.addEventListener("keydown", (e) => {
        // Don't intercept while typing in a text-entry field
        if (isTextEntryTarget(e.target)) return;
        // Don't intercept modifier combos
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        switch (e.key) {
            case " ":
            case "k":
            case "K":
                e.preventDefault();
                togglePlay();
                break;
            case "ArrowLeft":
                e.preventDefault();
                player.currentTime = Math.max(0, player.currentTime - 10);
                showFeedback("−10s", "left");
                break;
            case "ArrowRight":
                e.preventDefault();
                player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 10);
                showFeedback("+10s", "right");
                break;
            case "ArrowUp":
                e.preventDefault();
                player.volume = Math.min(1, player.volume + 0.05);
                player.muted = false;
                volumeSlider.value = player.volume;
                updateVolIcon();
                showFeedback(`Vol: ${Math.round(player.volume * 100)}%`);
                break;
            case "ArrowDown":
                e.preventDefault();
                player.volume = Math.max(0, player.volume - 0.05);
                player.muted = player.volume < 0.001;
                volumeSlider.value = player.volume;
                updateVolIcon();
                showFeedback(`Vol: ${Math.round(player.volume * 100)}%`);
                break;
            case "m":
            case "M":
                player.muted = !player.muted;
                volumeSlider.value = player.muted ? 0 : player.volume;
                updateVolIcon();
                showFeedback(player.muted ? "Muted" : "Unmuted");
                break;
            case "f":
            case "F":
                toggleFS(e);
                break;
            case "r":
            case "R":
                rotateBtn.click();
                break;
            case "?":
                toggleShortcuts();
                break;
            case "Escape":
                // Close any open modals/popovers
                if (shortcutsModal.classList.contains("active")) { closeShortcuts(); }
                else { closeAllPopovers(); }
                break;
            default:
                return; // Don't call resetIdle for unbound keys
        }
        resetIdle();
    });

    // ── Gesture zone ──────────────────────────────────────────────────────────
    gestureZone.style.touchAction    = "none";
    gestureZone.style.userSelect     = "none";
    gestureZone.style.webkitUserSelect = "none";

    // Bug 7: Compute safe-area-aware edge exclusion zone for swipe gestures
    const _safeAreaProbe = document.createElement('div');
    _safeAreaProbe.style.cssText = 'position:fixed;left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);pointer-events:none;visibility:hidden;';
    document.body.appendChild(_safeAreaProbe);
    const _getEdgeExclusion = () => {
        const cs = getComputedStyle(_safeAreaProbe);
        const saLeft = parseInt(cs.left, 10) || 0;
        const saRight = parseInt(cs.right, 10) || 0;
        return { left: Math.max(40, saLeft + 20), right: Math.max(40, saRight + 20) };
    };

    let startX = 0, startY = 0, lastY = 0, swipeDir = null;
    let isPointerDown = false, lastTapTime = 0, tapTimeout, longPressTimer;
    let currentBrightness = 1.0, originalSpeed = 1.0;
    let isLongPressActive = false;

    gestureZone.addEventListener("contextmenu", e => e.preventDefault());

    gestureZone.addEventListener("dblclick", (e) => {
        e.preventDefault();
        // Fallback for native dblclick if pointer events miss the timing, 
        // but restrict to fullscreen to avoid duplicated seeks.
        const rect = gestureZone.getBoundingClientRect();
        if (e.clientX > rect.left + rect.width * 0.30 && e.clientX < rect.left + rect.width * 0.70) {
            toggleFS(e);
        }
    });

    gestureZone.addEventListener("pointerdown", (e) => {
        isPointerDown = true;
        try { gestureZone.setPointerCapture(e.pointerId); } catch (_) {}
        startX = e.clientX; startY = e.clientY; lastY = e.clientY; swipeDir = null;
        originalSpeed = player.playbackRate;
        longPressTimer = setTimeout(() => {
            if (!isPointerDown) return; // Guard against cancelled gestures
            isLongPressActive = true;
            setPlaybackRate(2.0); // BUG FIX: use setPlaybackRate to sync pills
            showFeedback("2× Speed");
        }, 500);
    });

    gestureZone.addEventListener("pointermove", (e) => {
        if (!isPointerDown || isLongPressActive) return;
        // U6: Ignore gestures near screen edges (safe-area aware)
        const _edgeRect = gestureZone.getBoundingClientRect();
        const _yRatio = (e.clientY - _edgeRect.top) / _edgeRect.height;
        const _topPx = e.clientY - _edgeRect.top;
        const _bottomPx = _edgeRect.bottom - e.clientY;
        const _minEdgePx = 48;
        if (_topPx < _minEdgePx || _bottomPx < _minEdgePx || _yRatio < 0.12 || _yRatio > 0.88) return;
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
                player.volume      = Math.max(0, Math.min(1, player.volume - deltaY * 0.005));
                player.muted       = false;
                volumeSlider.value = player.volume;
                updateVolIcon();
                showFeedback(`Vol: ${Math.round(player.volume * 100)}%`, "right");
            } else {
                currentBrightness       = Math.max(0.1, Math.min(2.5, currentBrightness - deltaY * 0.01));
                player.style.filter     = `brightness(${currentBrightness})`;
                showFeedback(`Brightness: ${Math.round(currentBrightness * 100)}%`, "left");
            }
        }
    });

    const handleGestureEnd = (e) => {
        if (!isPointerDown) return;
        isPointerDown = false;
        // Bug 5: Clear longPressTimer FIRST to prevent race with pointercancel
        clearTimeout(longPressTimer);
        try {
            if (gestureZone.hasPointerCapture(e.pointerId)) gestureZone.releasePointerCapture(e.pointerId);
        } catch (err) {
            console.warn("[WebPlayer] Pointer capture release failed:", err);
        }

        // Bug 5: Always restore speed on pointercancel, even if timer fired mid-event
        if (isLongPressActive || (e.type === "pointercancel" && player.playbackRate !== originalSpeed)) {
            isLongPressActive = false;
            setPlaybackRate(originalSpeed);
            showFeedback(`${originalSpeed}× Speed`);
            lastTapTime = 0;
            return;
        }

        const diffX = e.clientX - startX;
        if (swipeDir === "horizontal" && Math.abs(diffX) > 40) {
            // Bug 7: Ignore swipes that started near screen edges (safe-area aware)
            const _edge = _getEdgeExclusion();
            if (startX < _edge.left || startX > window.innerWidth - _edge.right) return;
            const shift = diffX > 0 ? 10 : -10;
            player.currentTime = Math.max(0, Math.min(player.duration || Infinity, player.currentTime + shift));
            showFeedback(`${shift > 0 ? "+" : ""}${shift}s`, shift > 0 ? "right" : "left");
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
                ripple.style.left    = `${e.clientX - rect.left - half}px`;
                ripple.style.top     = `${e.clientY - rect.top  - half}px`;
                ripple.style.width   = ripple.style.height = `${rippleSize}px`;
                gestureZone.appendChild(ripple);
                setTimeout(() => ripple.remove(), 400);

                // BUG FIX: Double tap on sides targets seeking, double tap in middle toggles Play/Pause or Fullscreen
                if (e.clientX < rect.left + rect.width * 0.30) {
                    player.currentTime = Math.max(0, player.currentTime - 10);
                    showFeedback("−10s", "left");
                    lastTapTime = now;
                    // Brief cooldown to prevent accidental triple-tap double-seek
                    setTimeout(() => { if (lastTapTime === now) lastTapTime = 0; }, 300);
                } else if (e.clientX > rect.left + rect.width * 0.70) {
                    player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 10);
                    showFeedback("+10s", "right");
                    lastTapTime = now;
                    setTimeout(() => { if (lastTapTime === now) lastTapTime = 0; }, 300);
                } else {
                    // Double tap center toggles fullscreen for both mouse and touch
                    toggleFS(e);
                    lastTapTime = 0;
                }
            } else {
                lastTapTime = now;
                tapTimeout = setTimeout(() => {
                    if (e.pointerType === "mouse") {
                        const wasPaused = player.paused;
                        wasPaused ? safePlay() : safePause();
                        showFeedback(wasPaused ? "Playing" : "Paused");
                    } else {
                        if (container.classList.contains("idle")) {
                            resetIdle(); // show and start timer
                        } else {
                            container.classList.add("idle"); // hide immediately
                            clearTimeout(idleTimer);
                            closeAllPopovers();
                        }
                    }
                    lastTapTime = 0;
                }, 250); // 250ms distinct click delay
            }
        }
    };

    gestureZone.addEventListener("pointerup", handleGestureEnd);
    gestureZone.addEventListener("pointercancel", handleGestureEnd);


    // ── Web Audio API — Equalizer with persistence ────────────────────────────

    // B10: EQ storage with sync → local fallback on quota error
    const eqStorage = hasChromeStorage ? (chrome.storage.sync || chrome.storage.local) : null;
    let activePresetName = null;
    const EQ_PRESETS = {
        "Flat":        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        "Bass Boost":  [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
        "Treble Boost":[0, 0, 0, 0, 0, 2, 4, 6, 8, 8],
        "Podcast":     [-2, -1, 0, 4, 6, 6, 4, 2, 0, -2],
        "Cinema":      [4, 3, 2, 0, -1, 0, 2, 4, 5, 3],
        "Loudness":    [6, 4, 0, -2, -1, 0, 2, 4, 6, 8]
    };
    const eqPresetsContainer = document.getElementById("eq-presets");

    const saveEqSettings = () => {
        if (!eqStorage) return;
        const data = {
            [EQ_STORAGE_KEY]: {
                preamp: preampGain ? preampGain.gain.value : 1.0,
                bands:  eqFilters.map(f => f.gain.value),
                preset: activePresetName
            }
        };
        try {
            eqStorage.set(data).catch?.(() => { try { chrome.storage.local.set(data); } catch (_) {} });
        } catch (_) { try { chrome.storage.local.set(data); } catch (_e) {} }
    };

    const updatePresetHighlight = (name) => {
        activePresetName = name;
        eqPresetsContainer.querySelectorAll(".eq-preset-pill").forEach(p =>
            p.classList.toggle("active", p.dataset.preset === name)
        );
    };

    const applyPreset = (name) => {
        const gains = EQ_PRESETS[name];
        if (!gains) return;
        gains.forEach((g, i) => {
            if (eqFilters[i]) eqFilters[i].gain.value = g;
        });
        // Sync slider UI
        const sliders = eqBandsContainer.querySelectorAll('input[type="range"]');
        sliders.forEach((s, i) => { s.value = gains[i] ?? 0; });
        updatePresetHighlight(name);
        saveEqSettings();
    };

    // Build preset pills
    Object.keys(EQ_PRESETS).forEach(name => {
        const pill = document.createElement("button");
        pill.className = "eq-preset-pill";
        pill.textContent = name;
        pill.dataset.preset = name;
        pill.addEventListener("click", () => applyPreset(name));
        eqPresetsContainer.appendChild(pill);
    });

    const initAudioContext = () => {
        if (isAudioInitialized) return;

        try {
            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextCtor) { isAudioInitialized = true; return; }
            if (!window.audioContext || window.audioContext.state === "closed") {
                window.audioContext = new AudioContextCtor();
            }
            if (window.audioContext.state === "suspended") {
                window.audioContext.resume().catch(err => console.warn("[WebPlayer] AudioContext resume failed:", err));
            }

            mediaElementSource = window.audioContext.createMediaElementSource(player);
            preampGain          = window.audioContext.createGain();

            const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
            let prevNode = mediaElementSource;
            frequencies.forEach(freq => {
                const filter = window.audioContext.createBiquadFilter();
                filter.type = "peaking"; filter.frequency.value = freq; filter.Q.value = 1.4; filter.gain.value = 0;
                eqFilters.push(filter);
                prevNode.connect(filter); prevNode = filter;
            });
            prevNode.connect(preampGain);
            preampGain.connect(window.audioContext.destination);

            // BUG FIX: load saved EQ settings and build sliders with restored values
            const _loadEqCb = (res) => {
                const saved      = res[EQ_STORAGE_KEY] || {};
                const savedBands = saved.bands  || new Array(frequencies.length).fill(0);
                const savedPreamp = saved.preamp ?? 1.0;

                // Restore preset highlight
                if (saved.preset) updatePresetHighlight(saved.preset);

                // Restore preamp
                preampGain.gain.value      = savedPreamp;
                preampSlider.value         = savedPreamp;
                preampLabel.textContent    = savedPreamp.toFixed(1);
                preampSlider.addEventListener("input", (e) => {
                    const val = parseFloat(e.target.value);
                    preampGain.gain.value   = val;
                    preampLabel.textContent = val.toFixed(1);
                    updatePresetHighlight(null); // custom tweak clears preset
                    saveEqSettings();
                });

                // Build and restore band sliders
                if (eqBandsContainer) {
                    eqBandsContainer.textContent = "";
                    frequencies.forEach((freq, i) => {
                        const savedGain = savedBands[i] ?? 0;
                        eqFilters[i].gain.value = savedGain;

                        const div = document.createElement("div");
                        div.className = "eq-band";
                        const divInput = document.createElement("input");
                        divInput.type = "range"; divInput.min = "-12"; divInput.max = "12"; divInput.step = "0.5"; divInput.value = savedGain;
                        const divMark = document.createElement("div"); divMark.className = "eq-zero-mark";
                        const divSpan = document.createElement("span"); divSpan.textContent = freq >= 1000 ? freq / 1000 + "k" : freq;
                        div.append(divInput, divMark, divSpan);
                        divInput.addEventListener("input", (e) => {
                            eqFilters[i].gain.value = parseFloat(e.target.value);
                            updatePresetHighlight(null); // manual adjustment clears preset
                            saveEqSettings();
                        });
                        eqBandsContainer.appendChild(div);
                    });
                }
            };
            if (eqStorage) { try { eqStorage.get([EQ_STORAGE_KEY], _loadEqCb); } catch (_) { _loadEqCb({}); } }
            else { _loadEqCb({}); }
            isAudioInitialized = true;

        } catch (err) {
            isAudioInitialized = false;
            console.warn("[WebPlayer] Equalizer could not be initialized:", err?.name || err, err?.message || "");
            if (window.audioContext?.state !== "closed") window.audioContext?.close();
            window.audioContext = null;
            mediaElementSource = null;
            preampGain = null;
            eqFilters.length = 0;
        }
    };

    // U11: EQ Reset button — now also resets preset to Flat
    const eqResetBtn = document.getElementById("eq-reset-btn");
    if (eqResetBtn) {
        eqResetBtn.addEventListener("click", () => {
            eqFilters.forEach(f => { f.gain.value = 0; });
            if (preampGain) { preampGain.gain.value = 1.0; }
            preampSlider.value = 1.0;
            preampLabel.textContent = "1.0";
            eqBandsContainer.querySelectorAll('input[type="range"]').forEach(s => { s.value = 0; });
            updatePresetHighlight("Flat");
            saveEqSettings();
        });
    }

    player.addEventListener("play", () => {
        if (!isAudioInitialized) initAudioContext();
    });
});
