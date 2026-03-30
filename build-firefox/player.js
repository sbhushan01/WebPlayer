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
    const qualityContainer= document.getElementById("quality-container");
    const qualityBtn      = document.getElementById("quality-btn");
    const qualityDropdown = document.getElementById("quality-dropdown");
    const qualityIcon     = document.getElementById("quality-icon");

    const ccContainer     = document.getElementById("cc-container");
    const ccBtn           = document.getElementById("cc-btn");
    const ccDropdown      = document.getElementById("cc-dropdown");
    const ccIcon          = document.getElementById("cc-icon");

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

    // ── Safe play (suppresses unhandled rejections from autoplay policy) ──────
    const safePlay = () => {
        try {
            const p = player.play();
            if (p && typeof p.catch === "function") {
                p.catch(err => console.warn("[WebPlayer] Playback prevented:", err));
            }
        } catch (err) {
            console.warn("[WebPlayer] Playback synchronous error:", err);
        }
    };

    // ── Media Session ─────────────────────────────────────────────────────────
    if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play",         () => safePlay());
        navigator.mediaSession.setActionHandler("pause",        () => player.pause());
        navigator.mediaSession.setActionHandler("seekbackward", (e) => { player.currentTime = Math.max(0, player.currentTime - (e.seekOffset || 10)); });
        navigator.mediaSession.setActionHandler("seekforward",  (e) => { player.currentTime = Math.min(player.duration || Infinity, player.currentTime + (e.seekOffset || 10)); });
    }

    // ── URL params ────────────────────────────────────────────────────────────
    const urlParams  = new URLSearchParams(window.location.search);
    const videoSrc   = urlParams.get("src");
    const pageUrl    = urlParams.get("pageUrl") || "";
    const titleText  = urlParams.get("title")   || "WebPlayer";

    if (titleText) { document.title = titleText; titleBar.textContent = titleText; }

    // ── Error display ─────────────────────────────────────────────────────────
    function showError(msg) {
        const box = document.getElementById("error-box");
        document.getElementById("error-msg").textContent = msg;
        box.style.display = "flex";
        bufferEl.classList.remove("is-buffering"); // BUG FIX: clear spinner on error
    }

    document.getElementById("error-retry").addEventListener("click", () => {
        if (!videoSrc) { showError("No video source provided."); return; }
        document.getElementById("error-box").style.display = "none";
        bufferEl.classList.add("is-buffering");
        attachSource(videoSrc);
    });

    if (!videoSrc) { showError("No video source provided."); return; }

    // ── Playback persistence ──────────────────────────────────────────────────
    const cleanUrl = videoSrc.split("?")[0];

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
    });

    let lastSave = 0;
    player.addEventListener("timeupdate", () => {
        const now = Date.now();
        if (now - lastSave > 5000 && !window.__isSkipping && player.duration !== Infinity) {
            chrome.storage.local.set({ [cleanUrl]: { time: player.currentTime, ts: now } });
            lastSave = now;
        }
    });
    player.addEventListener("ended", () => chrome.storage.local.remove([cleanUrl]));

    // ── Stream engines ────────────────────────────────────────────────────────
    let currentHls = null, currentDash = null;
    function destroyEngines() {
        if (currentHls)  { currentHls.destroy();  currentHls  = null; }
        if (currentDash) { currentDash.reset();   currentDash = null; }
    }
    window.addEventListener("beforeunload", () => {
        destroyEngines();
        if (window.audioContext?.state !== "closed") window.audioContext?.close();
    });

    const loadedScripts = {};
    function loadScript(path) {
        if (!loadedScripts[path]) {
            loadedScripts[path] = new Promise((resolve, reject) => {
                const s = document.createElement("script");
                s.src = chrome.runtime.getURL(path);
                s.onload  = resolve;
                s.onerror = () => { delete loadedScripts[path]; reject(new Error(`Failed to load ${path}`)); };
                document.head.appendChild(s);
            });
        }
        return loadedScripts[path];
    }

    function populateQuality(levels) {
        qualityContainer.style.display = "flex";
        qualityDropdown.innerHTML = "";
        levels.forEach(({ label, value }) => {
            const btn = document.createElement("button");
            btn.className = "quality-option" + (value === -1 ? " active" : "");
            btn.textContent = label;
            btn.dataset.value = value;
            qualityDropdown.appendChild(btn);
        });
    }

    qualityDropdown.addEventListener("click", (e) => {
        const btn = e.target.closest(".quality-option");
        if (!btn) return;
        qualityDropdown.querySelectorAll(".quality-option").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
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
        ccDropdown.innerHTML = "";
        
        const offBtn = document.createElement("button");
        offBtn.className = "quality-option active";
        offBtn.textContent = "Off";
        offBtn.dataset.value = "-1";
        ccDropdown.appendChild(offBtn);

        tracks.forEach(({ label, value }) => {
            if (!label) label = `Track ${value}`;
            const btn = document.createElement("button");
            btn.className = "quality-option";
            btn.textContent = label;
            btn.dataset.value = value;
            ccDropdown.appendChild(btn);
        });
    }

    ccDropdown.addEventListener("click", (e) => {
        const btn = e.target.closest(".quality-option");
        if (!btn) return;
        ccDropdown.querySelectorAll(".quality-option").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const val = parseInt(btn.dataset.value);
        
        if (currentHls) {
            currentHls.subtitleTrack = val;
        } else if (currentDash) {
            if (val === -1) {
                currentDash.setTextTrack(-1);
            } else {
                const dashTracks = currentDash.getTracksFor('text');
                currentDash.setTextTrack(dashTracks[val] || dashTracks.find(t=>t.index === val));
            }
        } else {
            for(let i=0; i<player.textTracks.length; i++) {
                player.textTracks[i].mode = (i === val) ? "showing" : "hidden";
            }
        }

        ccIcon.textContent = val === -1 ? "closed_caption_disabled" : "closed_caption";
        ccDropdown.classList.remove("open");
    });

    qualityBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        qualityDropdown.classList.toggle("open");
        ccDropdown.classList.remove("open");
    });
    ccBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        ccDropdown.classList.toggle("open");
        qualityDropdown.classList.remove("open");
    });
    document.addEventListener("click", () => {
        qualityDropdown.classList.remove("open");
        ccDropdown.classList.remove("open");
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
    async function attachSource(src) {
        destroyEngines();
        const cleanSrcTest = src.split("?")[0].toLowerCase();
        if (!cleanSrcTest.startsWith("blob:") && !cleanSrcTest.startsWith("data:")) {
            player.crossOrigin = "anonymous";
        }
        bufferEl.classList.add("is-buffering");
        qualityContainer.style.display = "none";
        ccContainer.style.display = "none";

        const cleanSrc = src.split("?")[0].toLowerCase();
        try {
            if (cleanSrc.endsWith(".m3u8")) {
                if (player.canPlayType("application/vnd.apple.mpegurl")) {
                    player.src = src;
                } else {
                    await loadScript("libs/hls.min.js");
                    if (window.Hls && Hls.isSupported()) {
                        currentHls = new Hls({ manifestLoadingMaxRetry: 4 });
                        currentHls.loadSource(src);
                        currentHls.attachMedia(player);
                        currentHls.on(Hls.Events.MANIFEST_PARSED, (e, d) => {
                            if (d.levels.length > 1) {
                                const levels = [
                                    { label: "Auto", value: -1 },
                                    ...d.levels.map((l, i) => ({ label: `${l.height}p`, value: i }))
                                ];
                                populateQuality(levels);
                            }
                            if (d.subtitleTracks && d.subtitleTracks.length > 0) {
                                const tracks = d.subtitleTracks.map((t, i) => ({ label: t.name || t.lang, value: i }));
                                populateCC(tracks);
                            }
                        });
                    } else { showError("HLS not supported in this browser."); }
                }
            } else if (cleanSrc.endsWith(".mpd")) {
                await loadScript("libs/dash.all.min.js");
                if (window.dashjs) {
                    currentDash = dashjs.MediaPlayer().create();
                    currentDash.initialize(player, src, true);
                    
                    currentDash.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
                        const bitrates = currentDash.getBitrateInfoListFor("video");
                        if (bitrates && bitrates.length > 1) {
                            const levels = [
                                { label: "Auto", value: -1 },
                                ...bitrates.map((b, i) => ({ label: `${b.height}p`, value: i }))
                            ];
                            populateQuality(levels);
                        }
                        const textTracks = currentDash.getTracksFor("text");
                        if (textTracks && textTracks.length > 0) {
                            const tracks = textTracks.map((t, i) => ({ label: t.lang || t.id, value: i }));
                            populateCC(tracks);
                        }
                    });
                } else { showError("DASH not supported in this browser."); }
            } else {
                player.src = src;
                player.addEventListener("loadedmetadata", () => {
                    if (player.textTracks && player.textTracks.length > 0) {
                        const tracks = Array.from(player.textTracks).map((t, i) => ({ label: t.label || t.language || `Track ${i+1}`, value: i }));
                        populateCC(tracks);
                    }
                });
            }
        } catch (err) {
            showError(`Failed to load stream: ${err.message}`);
            bufferEl.classList.remove("is-buffering");
        }
    }
    attachSource(videoSrc);

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
        }, 1800);
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
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60).toString().padStart(2, "0");
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

    let pendingSeekPct = 0;
    const updateProgressFromEvent = (e) => {
        if (!isFinite(player.duration)) return;
        const rect = progWrapper.getBoundingClientRect();
        pendingSeekPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        progPlayed.style.width = `${pendingSeekPct * 100}%`;
        progThumb.style.left   = `${pendingSeekPct * 100}%`;
    };

    progWrapper.addEventListener("pointerdown", (e) => {
        isDraggingProgress = true;
        progWrapper.classList.add("dragging");
        updateProgressFromEvent(e);
        const onMove = (ev) => updateProgressFromEvent(ev);
        const onUp   = () => {
            isDraggingProgress = false;
            progWrapper.classList.remove("dragging");
            if (isFinite(player.duration)) {
                player.currentTime = pendingSeekPct * player.duration;
            }
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup",   onUp);
            window.removeEventListener("pointercancel", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup",   onUp);
        window.addEventListener("pointercancel", onUp);
    });

    // ── Playback rate helper — keeps speed pills in sync ──────────────────────
    const setPlaybackRate = (rate) => {
        player.playbackRate = rate;
        speedPillsEl.querySelectorAll(".speed-pill").forEach(p =>
            p.classList.toggle("active", parseFloat(p.dataset.speed) === rate)
        );
    };

    // ── Play / Pause ──────────────────────────────────────────────────────────
    const togglePlay = () => {
        const wasPaused = player.paused;
        wasPaused ? safePlay() : player.pause();
        showFeedback(wasPaused ? "Playing" : "Paused"); // BUG FIX: capture state before toggle
    };
    playBtn.addEventListener("click", togglePlay);
    player.addEventListener("play",  () => playIcon.textContent = "pause");
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
    });

    // ── Speed pills ───────────────────────────────────────────────────────────
    speedPillsEl.querySelectorAll(".speed-pill").forEach(pill => {
        pill.addEventListener("click", () => setPlaybackRate(parseFloat(pill.dataset.speed)));
    });

    // ── Fullscreen ────────────────────────────────────────────────────────────
    const toggleFS = async () => {
        try {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                await (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
            } else {
                const req = container.requestFullscreen || container.webkitRequestFullscreen;
                if (req) await req.call(container);
            }
        } catch (err) { console.warn("Fullscreen request denied", err); }
    };
    fsBtn.addEventListener("click", toggleFS);
    const onFSChange = () => {
        const isFS = document.fullscreenElement || document.webkitFullscreenElement;
        fsIcon.textContent = isFS ? "fullscreen_exit" : "fullscreen";
    };
    document.addEventListener("fullscreenchange",       onFSChange);
    document.addEventListener("webkitfullscreenchange", onFSChange);

    // ── PiP ───────────────────────────────────────────────────────────────────
    pipBtn.addEventListener("click", async () => {
        try {
            document.pictureInPictureElement
                ? await document.exitPictureInPicture()
                : await player.requestPictureInPicture();
        } catch (err) { console.warn("PiP blocked", err); showFeedback("PiP Blocked"); }
    });

    // ── Rotate ────────────────────────────────────────────────────────────────
    let rotationDeg = 0;
    rotateBtn.addEventListener("click", () => {
        rotationDeg = (rotationDeg + 90) % 360;
        player.style.transform  = `rotate(${rotationDeg}deg)`;
        player.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    });

    // ── Idle (auto-hide controls) ─────────────────────────────────────────────
    let idleTimer;
    const resetIdle = () => {
        container.classList.remove("idle");
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            if (!player.paused && !isDraggingProgress && !eqPopover.classList.contains("active")) {
                container.classList.add("idle");
            }
        }, 3000);
    };
    container.addEventListener("pointermove", resetIdle);
    container.addEventListener("pointerdown", resetIdle);
    eqPopover.addEventListener("pointermove", resetIdle); // BUG FIX: EQ interaction resets idle
    player.addEventListener("play",  resetIdle);
    player.addEventListener("pause", () => container.classList.remove("idle"));

    // ── Popovers ──────────────────────────────────────────────────────────────
    const closeAllPopovers = () => {
        eqPopover.classList.remove("active");
        themePopover.classList.remove("active");
        qualityDropdown.classList.remove("open");
        ccDropdown.classList.remove("open");
    };

    themeToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasActive = themePopover.classList.contains("active");
        closeAllPopovers();
        if (!wasActive) themePopover.classList.add("active");
        resetIdle();
    });
    themeCloseBtn.addEventListener("click", () => { themePopover.classList.remove("active"); resetIdle(); });

    eqToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasActive = eqPopover.classList.contains("active");
        closeAllPopovers();
        if (!wasActive) eqPopover.classList.add("active");
        resetIdle();
    });
    eqCloseBtn.addEventListener("click", () => { eqPopover.classList.remove("active"); resetIdle(); });

    // Close on outside click
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#theme-popover") && !e.target.closest("#theme-toggle-btn")) themePopover.classList.remove("active");
        if (!e.target.closest("#eq-popover") && !e.target.closest("#eq-toggle-btn")) eqPopover.classList.remove("active");
        if (!e.target.closest(".quality-dropdown") && !e.target.closest("#quality-btn")) qualityDropdown.classList.remove("open");
        if (!e.target.closest(".quality-dropdown") && !e.target.closest("#cc-btn")) ccDropdown.classList.remove("open");
    });

    // ── Shortcuts modal ───────────────────────────────────────────────────────
    const toggleShortcuts = () => shortcutsModal.classList.toggle("active");
    shortcutsBtn.addEventListener("click",   toggleShortcuts);
    shortcutsClose.addEventListener("click", () => shortcutsModal.classList.remove("active"));
    shortcutsModal.addEventListener("click", (e) => { if (e.target === shortcutsModal) shortcutsModal.classList.remove("active"); });

    // ── Feedback overlay ──────────────────────────────────────────────────────
    let feedbackTimer;
    const showFeedback = (text) => {
        feedbackOverlay.textContent = text;
        feedbackOverlay.style.opacity = 1;
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => feedbackOverlay.style.opacity = 0, 800);
    };

    // ── Keyboard shortcuts (BUG FIX: was completely unimplemented) ────────────
    document.addEventListener("keydown", (e) => {
        // Don't intercept while typing in an input
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.isContentEditable) return;
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
                showFeedback("−10s");
                break;
            case "ArrowRight":
                e.preventDefault();
                player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 10);
                showFeedback("+10s");
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
                player.muted = player.volume === 0;
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
                toggleFS();
                break;
            case "r":
            case "R":
                rotateBtn.click();
                break;
            case "?":
                toggleShortcuts();
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

    let startX = 0, startY = 0, lastY = 0, swipeDir = null;
    let isPointerDown = false, lastTapTime = 0, tapTimeout, longPressTimer;
    let currentBrightness = 1.0, originalSpeed = 1.0;

    gestureZone.addEventListener("contextmenu", e => e.preventDefault());

    gestureZone.addEventListener("dblclick", (e) => {
        e.preventDefault();
        // Fallback for native dblclick if pointer events miss the timing, 
        // but restrict to fullscreen to avoid duplicated seeks.
        const rect = gestureZone.getBoundingClientRect();
        if (e.clientX > rect.left + rect.width * 0.33 && e.clientX < rect.left + rect.width * 0.66) {
            toggleFS();
        }
    });

    gestureZone.addEventListener("pointerdown", (e) => {
        isPointerDown = true;
        gestureZone.setPointerCapture(e.pointerId);
        startX = e.clientX; startY = e.clientY; lastY = e.clientY; swipeDir = null;
        originalSpeed = player.playbackRate;
        longPressTimer = setTimeout(() => {
            setPlaybackRate(2.0); // BUG FIX: use setPlaybackRate to sync pills
            showFeedback("2× Speed");
        }, 500);
    });

    gestureZone.addEventListener("pointermove", (e) => {
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
                player.volume      = Math.max(0, Math.min(1, player.volume - deltaY * 0.005));
                player.muted       = false;
                volumeSlider.value = player.volume;
                updateVolIcon();
                showFeedback(`Vol: ${Math.round(player.volume * 100)}%`);
            } else {
                currentBrightness       = Math.max(0.1, Math.min(2.5, currentBrightness - deltaY * 0.01));
                player.style.filter     = `brightness(${currentBrightness})`;
                showFeedback(`Brightness: ${Math.round(currentBrightness * 100)}%`);
            }
        }
    });

    const handleGestureEnd = (e) => {
        if (!isPointerDown) return;
        isPointerDown = false;
        gestureZone.releasePointerCapture(e.pointerId);
        clearTimeout(longPressTimer);

        // BUG FIX: use setPlaybackRate to restore and sync pills
        if (player.playbackRate === 2.0 && originalSpeed !== 2.0) {
            setPlaybackRate(originalSpeed);
            showFeedback(`${originalSpeed}× Speed`);
            lastTapTime = 0;
            return;
        }

        const diffX = e.clientX - startX;
        if (swipeDir === "horizontal" && Math.abs(diffX) > 40) {
            const shift = diffX > 0 ? 10 : -10;
            player.currentTime = Math.max(0, Math.min(player.duration || Infinity, player.currentTime + shift));
            showFeedback(`${shift > 0 ? "+" : ""}${shift}s`);
            return;
        }

        if (!swipeDir) {
            const now = Date.now();
            if (now - lastTapTime < 250) { // Fast double tap threshold
                clearTimeout(tapTimeout);
                const rect = gestureZone.getBoundingClientRect();

                const ripple = document.createElement("div");
                ripple.className = "wp-ripple";
                ripple.style.left    = `${e.clientX - rect.left - 24}px`;
                ripple.style.top     = `${e.clientY - rect.top  - 24}px`;
                ripple.style.width   = ripple.style.height = "48px";
                gestureZone.appendChild(ripple);
                setTimeout(() => ripple.remove(), 400);

                // BUG FIX: Double tap on sides targets seeking, double tap in middle toggles Play/Pause or Fullscreen
                if (e.clientX < rect.left + rect.width * 0.33) {
                    player.currentTime = Math.max(0, player.currentTime - 10);
                    showFeedback("−10s");
                    lastTapTime = now; // Keep chain alive for triple taps
                } else if (e.clientX > rect.left + rect.width * 0.66) {
                    player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 10);
                    showFeedback("+10s");
                    lastTapTime = now; // Keep chain alive for triple taps
                } else {
                    // Double tap center toggles fullscreen for mouse, play/pause for touch
                    if (e.pointerType === "mouse") {
                        toggleFS();
                    } else {
                        const wasPaused = player.paused;
                        wasPaused ? safePlay() : player.pause();
                        showFeedback(wasPaused ? "Playing" : "Paused");
                    }
                    lastTapTime = 0;
                }
            } else {
                lastTapTime = now;
                tapTimeout = setTimeout(() => {
                    if (e.pointerType === "mouse") {
                        const wasPaused = player.paused;
                        wasPaused ? safePlay() : player.pause();
                        showFeedback(wasPaused ? "Playing" : "Paused");
                    } else {
                        resetIdle(); // single tap on touch shows UI without pausing
                    }
                    lastTapTime = 0;
                }, 250); // 250ms distinct click delay
            }
        }
    };

    gestureZone.addEventListener("pointerup", handleGestureEnd);
    gestureZone.addEventListener("pointercancel", handleGestureEnd);


    // ── Web Audio API — Equalizer with persistence ────────────────────────────
    window.audioContext = null;
    let mediaElementSource, preampGain;
    const eqFilters = [];
    let isAudioInitialized = false;

    // Save current EQ state to chrome.storage.sync
    const saveEqSettings = () => {
        chrome.storage.sync.set({
            [EQ_STORAGE_KEY]: {
                preamp: preampGain ? preampGain.gain.value : 1.0,
                bands:  eqFilters.map(f => f.gain.value)
            }
        });
    };

    const initAudioContext = () => {
        if (isAudioInitialized) return;
        isAudioInitialized = true;

        try {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
            chrome.storage.sync.get([EQ_STORAGE_KEY], (res) => {
                const saved      = res[EQ_STORAGE_KEY] || {};
                const savedBands = saved.bands  || new Array(frequencies.length).fill(0);
                const savedPreamp = saved.preamp ?? 1.0;

                // Restore preamp
                preampGain.gain.value      = savedPreamp;
                preampSlider.value         = savedPreamp;
                preampLabel.textContent    = savedPreamp.toFixed(1);
                preampSlider.addEventListener("input", (e) => {
                    const val = parseFloat(e.target.value);
                    preampGain.gain.value   = val;
                    preampLabel.textContent = val.toFixed(1);
                    saveEqSettings();
                });

                // Build and restore band sliders
                if (eqBandsContainer) {
                    eqBandsContainer.innerHTML = "";
                    frequencies.forEach((freq, i) => {
                        const savedGain = savedBands[i] ?? 0;
                        eqFilters[i].gain.value = savedGain;

                        const div = document.createElement("div");
                        div.className = "eq-band";
                        div.innerHTML = `
                            <input type="range" min="-12" max="12" step="0.5" value="${savedGain}">
                            <div class="eq-zero-mark"></div>
                            <span>${freq >= 1000 ? freq / 1000 + "k" : freq}</span>
                        `;
                        div.querySelector("input").addEventListener("input", (e) => {
                            eqFilters[i].gain.value = parseFloat(e.target.value);
                            saveEqSettings();
                        });
                        eqBandsContainer.appendChild(div);
                    });
                }
            });

        } catch (err) {
            console.warn("[WebPlayer] Equalizer could not be initialized:", err);
            if (window.audioContext?.state !== "closed") window.audioContext?.close();
            window.audioContext = null;
        }
    };

    player.addEventListener("play", () => {
        if (!isAudioInitialized) initAudioContext();
    });
});
