document.addEventListener("DOMContentLoaded", async () => {
    const player         = document.getElementById("main-player");
    const container      = document.getElementById("video-container");
    const bufferEl       = document.getElementById("buffering-indicator");
    const skipBadge      = document.getElementById("skip-badge");
    const feedbackOverlay= document.getElementById("feedback-overlay");
    const gestureZone    = document.getElementById("gesture-zone");
    const titleBar       = document.getElementById("title-bar");

    const playBtn        = document.getElementById("play-pause-btn");
    const playIcon       = document.getElementById("play-icon"); 
    const volumeSlider   = document.getElementById("volume-slider");
    const muteBtn        = document.getElementById("mute-btn");
    const muteIcon       = document.getElementById("mute-icon"); 
    const timeCur        = document.getElementById("time-current");
    const timeDur        = document.getElementById("time-duration");
    const progWrapper    = document.getElementById("progress-wrapper");
    const progPlayed     = document.getElementById("progress-played");
    const progBuffered   = document.getElementById("progress-buffered");
    const progThumb      = document.getElementById("progress-thumb");
    const fsBtn          = document.getElementById("fs-btn");
    const fsIcon         = document.getElementById("fs-icon"); 
    const pipBtn         = document.getElementById("pip-btn");
    const qualitySelect  = document.getElementById("quality-select");
    const speedPillsEl   = document.getElementById("speed-pills");

    const eqToggleBtn    = document.getElementById("eq-toggle-btn");
    const eqPopover      = document.getElementById("eq-popover");
    const eqCloseBtn     = document.getElementById("eq-close-btn");
    const eqBandsContainer = document.getElementById("eq-bands-container");
    const preampSlider   = document.getElementById("eq-preamp");
    const preampLabel    = document.getElementById("preamp-label");

    const shortcutsModal = document.getElementById("shortcuts-modal");
    const shortcutsBtn   = document.getElementById("shortcuts-btn");
    const shortcutsClose = document.getElementById("shortcuts-close");

    // Safe play wrapper to prevent Unhandled Promise Rejections (Fixes Line 276 Error)
    const safePlay = () => {
        const playPromise = player.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.warn("[WebPlayer] Playback prevented:", err);
            });
        }
    };

    if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play",         () => safePlay());
        navigator.mediaSession.setActionHandler("pause",        () => player.pause());
        navigator.mediaSession.setActionHandler("seekbackward", (e) => player.currentTime = Math.max(0, player.currentTime - (e.seekOffset || 10)));
        navigator.mediaSession.setActionHandler("seekforward",  (e) => player.currentTime = Math.min(player.duration, player.currentTime + (e.seekOffset || 10)));
    }

    const urlParams = new URLSearchParams(window.location.search);
    const videoSrc  = urlParams.get("src");
    const pageUrl   = urlParams.get("pageUrl") || "";
    const titleText = urlParams.get("title")   || "WebPlayer";

    if (titleText) {
        document.title   = titleText;
        titleBar.textContent = titleText;
    }

    function showError(msg) {
        const box = document.getElementById("error-box");
        document.getElementById("error-msg").textContent = msg;
        box.style.display = "flex";
    }
    
    document.getElementById("error-retry").addEventListener("click", () => {
        if (!videoSrc) { 
            showError("No video source provided."); 
            return; 
        }
        document.getElementById("error-box").style.display = "none";
        bufferEl.classList.add("is-buffering");
        attachSource(videoSrc);
    });

    if (!videoSrc) { showError("No video source provided."); return; }

    const cleanUrl = videoSrc.split("?")[0];
    
    chrome.storage.local.get([cleanUrl]).then(res => {
        if (res[cleanUrl]) {
            const savedTime = typeof res[cleanUrl] === 'number' ? res[cleanUrl] : res[cleanUrl].time;
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

    let currentHls = null, currentDash = null;
    function destroyEngines() {
        if (currentHls)  { currentHls.destroy();  currentHls  = null; }
        if (currentDash) { currentDash.reset();   currentDash = null; }
    }
    window.addEventListener("beforeunload", () => {
        destroyEngines();
        if (window.audioContext && window.audioContext.state !== "closed") window.audioContext.close();
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

    async function attachSource(src) {
        destroyEngines();
        player.crossOrigin   = "anonymous";
        bufferEl.classList.add("is-buffering");
        qualitySelect.style.display = "none";

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
                                qualitySelect.innerHTML = '<option value="-1">Auto</option>' +
                                    d.levels.map((l, i) => `<option value="${i}">${l.height}p</option>`).join("");
                                qualitySelect.style.display = "block";
                                qualitySelect.onchange = (ev) => currentHls.currentLevel = parseInt(ev.target.value);
                            }
                        });
                    } else { showError("HLS not supported in this browser."); }
                }
            } else if (cleanSrc.endsWith(".mpd")) {
                await loadScript("libs/dash.all.min.js");
                if (window.dashjs) {
                    currentDash = dashjs.MediaPlayer().create();
                    currentDash.initialize(player, src, true);
                } else { showError("DASH not supported in this browser."); }
            } else {
                player.src = src;
            }
        } catch (err) {
            showError(`Failed to load stream: ${err.message}`);
            bufferEl.classList.remove("is-buffering");
        }
    }
    attachSource(videoSrc);

    window.__isSkipping = false;

    async function fetchSegments() {
        try {
            let videoId = null;
            for (const candidate of [pageUrl, videoSrc]) {
                const match = /(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/.exec(candidate);
                if (match) {
                    videoId = match[1];
                    break;
                }
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

    function showSkipBadge() {
        skipBadge.style.display = "block";
        requestAnimationFrame(() => skipBadge.classList.add("showing"));
        setTimeout(() => {
            skipBadge.classList.remove("showing");
            setTimeout(() => { skipBadge.style.display = "none"; }, 200);
        }, 1500);
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
                showSkipBadge();
                player.addEventListener("seeked", () => { window.__isSkipping = false; }, { once: true });
                break;
            }
        }
    });

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
            if (player.buffered.start(i) <= player.currentTime + 1) {
                maxEnd = Math.max(maxEnd, player.buffered.end(i));
            }
        }
        progBuffered.style.width = `${(maxEnd / player.duration) * 100}%`;
    });

    const updateProgressFromEvent = (e) => {
        if (!isFinite(player.duration)) return;
        const rect = progWrapper.getBoundingClientRect();
        const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        progPlayed.style.width = `${pct * 100}%`;
        progThumb.style.left   = `${pct * 100}%`;
        player.currentTime = pct * player.duration;
    };

    progWrapper.addEventListener("pointerdown", (e) => {
        isDraggingProgress = true;
        progWrapper.classList.add("dragging");
        updateProgressFromEvent(e);
        const onMove = (ev) => updateProgressFromEvent(ev);
        
        const onUp   = () => {
            isDraggingProgress = false;
            progWrapper.classList.remove("dragging");
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup",   onUp);
            window.removeEventListener("pointercancel", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup",   onUp);
        window.addEventListener("pointercancel", onUp);
    });

    const togglePlay = () => player.paused ? safePlay() : player.pause();
    playBtn.addEventListener("click", togglePlay);
    player.addEventListener("play",  () => playIcon.textContent = "pause");
    player.addEventListener("pause", () => playIcon.textContent = "play_arrow");

    player.addEventListener("waiting", () => bufferEl.classList.add("is-buffering"));
    player.addEventListener("playing", () => bufferEl.classList.remove("is-buffering"));
    player.addEventListener("error",   () => bufferEl.classList.remove("is-buffering"));

    const updateVolIcon = () => {
        if (player.muted || player.volume === 0) muteIcon.textContent = "volume_off";
        else if (player.volume < 0.5) muteIcon.textContent = "volume_down";
        else muteIcon.textContent = "volume_up";
    };

    volumeSlider.addEventListener("input", (e) => {
        player.volume = parseFloat(e.target.value);
        player.muted  = player.volume === 0;
        updateVolIcon();
    });
    
    muteBtn.addEventListener("click", () => {
        player.muted        = !player.muted;
        volumeSlider.value  = player.muted ? 0 : player.volume;
        updateVolIcon();
    });

    speedPillsEl.querySelectorAll(".speed-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            speedPillsEl.querySelectorAll(".speed-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            player.playbackRate = parseFloat(pill.dataset.speed);
        });
    });

    const toggleFS = async () => {
        try {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                await (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
            } else {
                const req = container.requestFullscreen || container.webkitRequestFullscreen;
                if (req) await req.call(container);
            }
        } catch (err) {
            console.warn("Fullscreen request denied", err);
        }
    };
    fsBtn.addEventListener("click", toggleFS);

    const onFSChange = () => {
        const isFS = document.fullscreenElement || document.webkitFullscreenElement;
        fsIcon.textContent = isFS ? "fullscreen_exit" : "fullscreen";
    };
    document.addEventListener("fullscreenchange",       onFSChange);
    document.addEventListener("webkitfullscreenchange", onFSChange);

    pipBtn.addEventListener("click", async () => {
        try {
            document.pictureInPictureElement
                ? await document.exitPictureInPicture()
                : await player.requestPictureInPicture();
        } catch (err) {
            console.warn("PiP blocked", err);
            showFeedback("PiP Blocked");
        }
    });

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
    player.addEventListener("play",  resetIdle);
    player.addEventListener("pause", () => container.classList.remove("idle"));

    eqToggleBtn.addEventListener("click", () => eqPopover.classList.toggle("active"));
    eqCloseBtn.addEventListener("click",  () => eqPopover.classList.remove("active"));

    const toggleShortcuts = () => shortcutsModal.classList.toggle("active");
    shortcutsBtn.addEventListener("click",   toggleShortcuts);
    shortcutsClose.addEventListener("click", () => shortcutsModal.classList.remove("active"));
    shortcutsModal.addEventListener("click", (e) => { if (e.target === shortcutsModal) shortcutsModal.classList.remove("active"); });

    let feedbackTimer;
    const showFeedback = (text) => {
        feedbackOverlay.textContent = text;
        feedbackOverlay.style.opacity = 1;
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => feedbackOverlay.style.opacity = 0, 800);
    };

    gestureZone.style.touchAction = "none";
    gestureZone.style.userSelect = "none";
    gestureZone.style.webkitUserSelect = "none";

    let startX = 0, startY = 0, lastY = 0, swipeDir = null;
    let isPointerDown = false, lastTapTime = 0, tapTimeout, longPressTimer;
    let currentBrightness = 1.0, originalSpeed = 1.0;

    gestureZone.addEventListener("contextmenu", e => e.preventDefault());

    gestureZone.addEventListener("pointerdown", (e) => {
        isPointerDown = true;
        gestureZone.setPointerCapture(e.pointerId);
        startX = e.clientX; startY = e.clientY; lastY = e.clientY; swipeDir = null;

        originalSpeed = player.playbackRate;
        longPressTimer = setTimeout(() => {
            player.playbackRate = 2.0;
            showFeedback("2× Speed");
        }, 500);
    });

    gestureZone.addEventListener("pointermove", (e) => {
        if (!isPointerDown) return;
        const diffX = e.clientX - startX;
        const diffY = e.clientY - startY;

        if (!swipeDir) {
            if (Math.abs(diffX) > 20) { swipeDir = "horizontal"; clearTimeout(longPressTimer); }
            else if (Math.abs(diffY) > 20) { swipeDir = "vertical"; clearTimeout(longPressTimer); }
        }

        if (swipeDir === "vertical") {
            const rect  = gestureZone.getBoundingClientRect();
            const deltaY = e.clientY - lastY;
            lastY = e.clientY;

            if (e.clientX > rect.left + rect.width / 2) {
                player.volume       = Math.max(0, Math.min(1, player.volume - deltaY * 0.005));
                player.muted        = false; 
                volumeSlider.value  = player.volume;
                updateVolIcon();
                showFeedback(`Vol: ${Math.round(player.volume * 100)}%`);
            } else {
                currentBrightness       = Math.max(0.1, Math.min(2.5, currentBrightness - deltaY * 0.01));
                player.style.filter     = `brightness(${currentBrightness})`;
                showFeedback(`Brightness: ${Math.round(currentBrightness * 100)}%`);
            }
        }
    });

    gestureZone.addEventListener("pointerup", (e) => {
        if (!isPointerDown) return;
        isPointerDown = false;
        gestureZone.releasePointerCapture(e.pointerId);
        clearTimeout(longPressTimer);

        if (player.playbackRate === 2.0 && originalSpeed !== 2.0) {
            player.playbackRate = originalSpeed;
            showFeedback("1× Speed");
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
            if (now - lastTapTime < 300) {
                clearTimeout(tapTimeout);
                const rect = gestureZone.getBoundingClientRect();
                
                const ripple = document.createElement("div");
                ripple.className = "wp-ripple";
                ripple.style.position = "absolute";
                ripple.style.borderRadius = "50%";
                ripple.style.background = "var(--md-sys-color-primary)"; 
                ripple.style.transform = "scale(0)";
                ripple.style.pointerEvents = "none";
                ripple.style.opacity = "0.4";
                ripple.style.animation = "wp-ripple-anim 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
                
                ripple.style.left = `${e.clientX - rect.left - 24}px`;
                ripple.style.top = `${e.clientY - rect.top - 24}px`;
                ripple.style.width = ripple.style.height = "48px";
                
                gestureZone.appendChild(ripple);
                setTimeout(() => ripple.remove(), 400);

                if (e.clientX < rect.left + rect.width * 0.33) {
                    player.currentTime = Math.max(0, player.currentTime - 10);
                    showFeedback("−10s");
                } else if (e.clientX > rect.left + rect.width * 0.66) {
                    player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 10);
                    showFeedback("+10s");
                } else {
                    player.paused ? safePlay() : player.pause();
                    showFeedback(player.paused ? "Paused" : "Playing");
                }
                lastTapTime = 0;
            } else {
                lastTapTime = now;
                tapTimeout = setTimeout(() => {
                    player.paused ? safePlay() : player.pause();
                    lastTapTime = 0;
                }, 300);
            }
        }
    });

    // --- Web Audio API (Equalizer Implementation) ---
    window.audioContext = null; 
    let mediaElementSource, preampGain;
    const eqFilters = [];
    let isAudioInitialized = false;

    const initAudioContext = () => {
        if (isAudioInitialized || window.audioContext) return;
        
        try {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Fixes Line 483 Error: Add .catch() to the async resume promise
            if (window.audioContext.state === 'suspended') {
                window.audioContext.resume().catch(err => {
                    console.warn("[WebPlayer] AudioContext resume failed:", err);
                });
            }

            mediaElementSource = window.audioContext.createMediaElementSource(player);
            preampGain = window.audioContext.createGain();
            
            const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
            let prevNode = mediaElementSource;
            
            frequencies.forEach(freq => {
                const filter = window.audioContext.createBiquadFilter();
                filter.type = "peaking";
                filter.frequency.value = freq;
                filter.Q.value = 1.4; 
                filter.gain.value = 0;
                eqFilters.push(filter);
                
                prevNode.connect(filter);
                prevNode = filter;
            });
            
            prevNode.connect(preampGain);
            preampGain.connect(window.audioContext.destination);

            // Bind Sliders
            if (preampSlider) {
                preampSlider.addEventListener("input", (e) => {
                    const val = parseFloat(e.target.value);
                    if (preampGain) preampGain.gain.value = val;
                    if (preampLabel) preampLabel.textContent = val.toFixed(1);
                });
            }

            if (eqBandsContainer) {
                eqBandsContainer.innerHTML = "";
                frequencies.forEach((freq, i) => {
                    const bandDiv = document.createElement("div");
                    bandDiv.className = "eq-band";
                    bandDiv.innerHTML = `
                        <input type="range" min="-12" max="12" step="0.5" value="0">
                        <div class="eq-zero-mark"></div>
                        <span>${freq >= 1000 ? freq/1000 + 'k' : freq}</span>
                    `;
                    const slider = bandDiv.querySelector("input");
                    slider.addEventListener("input", (e) => {
                        if (eqFilters[i]) eqFilters[i].gain.value = parseFloat(e.target.value);
                    });
                    eqBandsContainer.appendChild(bandDiv);
                });
            }

            isAudioInitialized = true;

        } catch (err) {
            console.warn("[WebPlayer] Equalizer could not be initialized:", err);
            if (window.audioContext && window.audioContext.state !== "closed") {
                window.audioContext.close();
            }
            window.audioContext = null;
            isAudioInitialized = true; 
        }
    };

    player.addEventListener('play', () => {
        if (!isAudioInitialized) initAudioContext();
    });

});
