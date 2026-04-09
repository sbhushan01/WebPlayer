let pendingQueueWrite = Promise.resolve();
const hasUrlPrefix = (key) => /^https?:\/\//i.test(key);

function setupAlarms() {
    chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
}

function cleanupOldVideoProgress() {
    chrome.storage.local.get(null, (items) => {
        const now = Date.now();
        const keysToRemove = [];
        for (const [key, val] of Object.entries(items)) {
            if (key === '_wp_pending_stream' || key === '_wp_pending_streams') continue; // B2: skip queue keys
            if (!hasUrlPrefix(key)) continue; // B12: never touch unrelated local storage keys
            if (typeof val === 'number') { // legacy format: raw timestamp/position
                keysToRemove.push(key);
            } else if (val && typeof val === 'object' && typeof val.ts === 'number' && (now - val.ts > 30 * 24 * 60 * 60 * 1000)) { // B7: 30-day TTL
                keysToRemove.push(key);
            }
        }
        if (keysToRemove.length > 0) chrome.storage.local.remove(keysToRemove);
    });
}

function getPendingStreams(res) {
    const single = res._wp_pending_stream;
    const many = Array.isArray(res._wp_pending_streams) ? res._wp_pending_streams : [];
    const merged = [...many];
    if (single && single.tabId) merged.push(single);
    const dedup = [];
    const seen = new Set();
    for (const p of merged) {
        if (!p || !p.tabId || !p.url) continue;
        const k = `${p.tabId}|${p.url}`;
        if (seen.has(k)) continue;
        seen.add(k);
        dedup.push(p);
    }
    return dedup;
}

function enqueuePendingStream(next, done) {
    chrome.storage.local.get(['_wp_pending_stream', '_wp_pending_streams'], (res) => {
        const pendingItems = getPendingStreams(res);
        const filtered = pendingItems.filter(p => !(p.tabId === next.tabId && p.url === next.url));
        filtered.push(next);
        chrome.storage.local.set({ _wp_pending_streams: filtered }, () => {
            // Keep legacy key cleaned only after successful queue write
            chrome.storage.local.remove('_wp_pending_stream', () => done?.());
        });
    });
}

function enqueuePendingStreamSerialized(next) {
    pendingQueueWrite = pendingQueueWrite
        .catch(() => {})
        .then(() => new Promise((resolve) => {
            enqueuePendingStream(next, resolve);
        }));
    const currentWrite = pendingQueueWrite;
    currentWrite.finally(() => {
        if (pendingQueueWrite === currentWrite) {
            pendingQueueWrite = Promise.resolve();
        }
    });
}

if (chrome?.runtime?.onInstalled) {
    chrome.runtime.onInstalled.addListener((details) => {
        setupAlarms();
        cleanupOldVideoProgress();
        // B9: Clean up stale DNR session rules from previous extension loads
        if (chrome?.declarativeNetRequest?.getSessionRules && chrome?.declarativeNetRequest?.updateSessionRules) {
            chrome.declarativeNetRequest.getSessionRules((rules) => {
                const ids = rules.map(r => r.id);
                if (ids.length) chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
            });
        }
        if (details.reason === "install") {
            chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
        }
    });
}

if (chrome?.runtime?.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
        setupAlarms();
        cleanupOldVideoProgress();
        // B4: Also clean stale DNR rules on browser startup
        if (chrome?.declarativeNetRequest?.getSessionRules && chrome?.declarativeNetRequest?.updateSessionRules) {
            chrome.declarativeNetRequest.getSessionRules((rules) => {
                const ids = rules.map(r => r.id);
                if (ids.length) chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
            });
        }
        // B2: Re-fire pending stream launches interrupted by SW termination
        chrome.storage.local.get(['_wp_pending_stream', '_wp_pending_streams'], (res) => {
            const pendingItems = getPendingStreams(res);
            if (!pendingItems.length) return;
            let remaining = pendingItems.length;
            const done = () => {
                remaining -= 1;
                if (remaining <= 0) {
                    chrome.storage.local.remove(['_wp_pending_stream', '_wp_pending_streams']);
                }
            };
            pendingItems.forEach((pending) => {
                chrome.tabs.get(pending.tabId, (tab) => {
                    if (chrome.runtime.lastError || !tab) {
                        done();
                        return;
                    }
                    chrome.tabs.sendMessage(pending.tabId, {
                        action: 'stream_detected',
                        url: pending.url,
                        pageUrl: pending.pageUrl
                    }, { frameId: 0 }, () => {
                        if (chrome.runtime.lastError) { /* tab may not have content script */ }
                        done();
                    });
                });
            });
        });
    });
}

if (chrome?.alarms?.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "keepAlive") {
            cleanupOldVideoProgress();
        }
    });
}

if (chrome?.tabs?.onRemoved) {
    chrome.tabs.onRemoved.addListener(async (tabId) => {
        if (!chrome?.storage?.session || !chrome?.declarativeNetRequest?.updateSessionRules) return;
        const tabKey = tabId.toString();
        const data = await chrome.storage.session.get(tabKey);
        if (data[tabKey]) {
            // Handle both array (new) and single-ID (legacy) formats
            const ruleIds = Array.isArray(data[tabKey]) ? data[tabKey] : [data[tabKey]];
            chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ruleIds });
            chrome.storage.session.remove(tabKey);
        }
    });
}

function domainFilter(rawUrl) {
    try {
        const u = new URL(rawUrl);
        return `${u.protocol}//${u.host}/*`;
    } catch (_) {
        return rawUrl;
    }
}

// Shared helper: sets up DNR session rules (CORS + Referer/Origin spoofing)
// for the given tab so the CDN sees a same-origin Referer rather than the
// extension's chrome-extension:// origin.
function setupDNRForTab(tabId, videoUrl, callback, refererUrl) {
    if (!Number.isInteger(tabId) || tabId < 0) {
        callback?.(false, "Invalid tab ID");
        return;
    }
    if (!chrome?.declarativeNetRequest?.updateSessionRules) {
        callback?.(false, "declarativeNetRequest unavailable");
        return;
    }

    const urlFilter = domainFilter(videoUrl);
    const ruleId      = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000000 + 1;
    const broadRuleId = ruleId + 1000000000;

    const corsHeaders = [
        { header: "Access-Control-Allow-Origin",      operation: "set",    value: "*"                  },
        { header: "Access-Control-Allow-Methods",     operation: "set",    value: "GET, HEAD, OPTIONS"  },
        { header: "Access-Control-Allow-Headers",     operation: "set",    value: "*"                  },
        { header: "Access-Control-Expose-Headers",    operation: "set",    value: "*"                  },
        { header: "Access-Control-Allow-Credentials", operation: "remove"                               },
        { header: "X-Frame-Options",                  operation: "remove"                               },
        { header: "Content-Security-Policy",          operation: "remove"                               }
    ];

    // Use the embed page URL as Referer if available (CDNs often validate
    // that the Referer matches the page that embedded the player, e.g.
    // /e/xxxxx); fall back to the stream origin.
    let reqHeaders = [];
    try {
        const streamOrigin = new URL(videoUrl).origin;
        const refValue = refererUrl || (streamOrigin + "/");
        reqHeaders = [
            { header: "Referer", operation: "set", value: refValue },
            { header: "Origin",  operation: "set", value: streamOrigin }
        ];
    } catch (e) {}

    const actionObj = {
        type: "modifyHeaders",
        responseHeaders: corsHeaders
    };
    if (reqHeaders.length > 0) {
        actionObj.requestHeaders = reqHeaders;
    }

    // Remove any existing rules for this tab first, then add new ones
    const tabKey = tabId.toString();
    const addNewRules = (removeRuleIds) => {
        chrome.declarativeNetRequest.updateSessionRules(
            {
                removeRuleIds: removeRuleIds,
                addRules: [
                    {
                        id: ruleId,
                        priority: 1,
                        action: actionObj,
                        condition: {
                            urlFilter: urlFilter,
                            tabIds: [tabId],
                            resourceTypes: ["media", "xmlhttprequest", "other"]
                        }
                    },
                    {
                        id: broadRuleId,
                        priority: 1,
                        action: actionObj,
                        condition: {
                            regexFilter: "\\.(ts|m4s|m3u8|mpd|mp4|aac|vtt|srt|key)(\\?.*)?$",
                            tabIds: [tabId],
                            resourceTypes: ["media", "xmlhttprequest", "other"],
                            isUrlFilterCaseSensitive: false
                        }
                    }
                ]
            },
            () => {
                if (chrome.runtime.lastError) {
                    console.error("[WebPlayer] Failed to add DNR rules:", chrome.runtime.lastError.message);
                    callback?.(false, chrome.runtime.lastError.message);
                    return;
                }
                if (chrome?.storage?.session?.set) {
                    chrome.storage.session.set({ [tabKey]: [ruleId, broadRuleId] });
                }
                callback?.(true);
            }
        );
    };

    // Check for existing rules to clean up before adding new ones
    if (chrome?.storage?.session?.get) {
        chrome.storage.session.get(tabKey, (data) => {
            const existing = data[tabKey] ? (Array.isArray(data[tabKey]) ? data[tabKey] : [data[tabKey]]) : [];
            addNewRules(existing);
        });
    } else {
        addNewRules([]);
    }
}

if (chrome?.runtime?.onMessage) {
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "clear_pending_stream") {
        const senderTabId = sender?.tab?.id;
        chrome.storage.local.get(['_wp_pending_stream', '_wp_pending_streams'], (res) => {
            const pendingItems = getPendingStreams(res);
            if (!pendingItems.length) {
                sendResponse({ ok: true });
                return;
            }
            if (!request.url) {
                if (typeof senderTabId === 'number') {
                    const filtered = pendingItems.filter(p => p.tabId !== senderTabId);
                    chrome.storage.local.remove('_wp_pending_stream');
                    if (filtered.length) {
                        chrome.storage.local.set({ _wp_pending_streams: filtered });
                    } else {
                        chrome.storage.local.remove('_wp_pending_streams');
                    }
                } else {
                    chrome.storage.local.remove(['_wp_pending_stream', '_wp_pending_streams']);
                }
                sendResponse({ ok: true });
                return;
            }
            const filtered = pendingItems.filter((p) => {
                const sameUrl = p.url === request.url;
                const sameTab = typeof senderTabId === 'number' ? p.tabId === senderTabId : true;
                const removeThisItem = sameUrl && sameTab;
                return !removeThisItem;
            });
            chrome.storage.local.remove('_wp_pending_stream');
            if (filtered.length) {
                chrome.storage.local.set({ _wp_pending_streams: filtered });
            } else {
                chrome.storage.local.remove('_wp_pending_streams');
            }
            sendResponse({ ok: true });
        });
        return true;
    }

    if (request.action === "open_player" && request.videoSrc) {
        const videoUrl  = request.videoSrc;
        const embedUrl  = request.embedUrl || "";

        const params = new URLSearchParams({
            src:      videoUrl,
            title:    request.pageTitle || "Video",
            pageUrl:  request.pageUrl   || "",
            embedUrl: embedUrl
        });
        const playerUrl = chrome.runtime.getURL(`player.html?${params}`);

        try {
            chrome.tabs.create({ url: playerUrl }, (tab) => {
                if (chrome.runtime.lastError || !tab) {
                    console.error("[WebPlayer] Failed to open tab:", chrome.runtime.lastError?.message);
                    sendResponse({ ok: false, error: chrome.runtime.lastError?.message || "Failed to open player tab" });
                    return;
                }
                // Pre-apply DNR rules immediately so they're active before
                // player.js even loads — eliminates the SW-suspension race.
                setupDNRForTab(tab.id, videoUrl, (ok, err) => {
                    if (!ok) console.warn("[WebPlayer] Pre-setup DNR in open_player failed:", err);
                    sendResponse({ ok: true, tabId: tab.id });
                }, embedUrl || undefined);
            });
        } catch (err) {
            console.error("[WebPlayer] Exception while creating tab:", err);
            sendResponse({ ok: false, error: err?.message || String(err) });
        }
        return true;
    }

    // Called by player.js BEFORE loading the stream.  Now delegates to the
    // shared helper.  The `open_player` handler above already pre-applies
    // rules, so this acts as a refresh / safety-net for edge cases
    // (e.g. manual URL entry, retry after failure).
    if (request.action === "setup_dnr" && request.videoSrc) {
        const playerTabId = sender?.tab?.id;
        setupDNRForTab(playerTabId, request.videoSrc, (ok, err) => {
            sendResponse({ ok: !!ok, error: err || undefined });
        }, request.embedUrl || undefined);
        return true;
    }
});
}

const recentlyInterceptedTabs = new Set();
const isPlayerRequest = (details) => {
    try {
        if (details.tabId < 0) return false;
        if (!details.documentUrl) return false;
        const documentUrl = new URL(details.documentUrl);
        return documentUrl.href.startsWith(chrome.runtime.getURL("player.html"));
    } catch (_err) {
        return false;
    }
};

if (chrome?.webRequest?.onHeadersReceived) {
    chrome.webRequest.onHeadersReceived.addListener(
        (details) => {
            const lowerUrl = (details.url || "").toLowerCase();
            if (details.tabId >= 0 && (lowerUrl.includes('.m3u8') || lowerUrl.includes('.mpd'))) {
                if (isPlayerRequest(details)) return;
                if (lowerUrl.includes('.ts') || lowerUrl.includes('.m4s') || /seg\d+/i.test(lowerUrl)) return;

                if (recentlyInterceptedTabs.has(details.tabId)) return;
                
                recentlyInterceptedTabs.add(details.tabId);
                setTimeout(() => recentlyInterceptedTabs.delete(details.tabId), 5000);

                // B2: Store pending stream queue in case SW dies before user confirms (serialized writes)
                const embedUrl = details.documentUrl || details.initiator || "";
                const nextPending = {
                    url: details.url,
                    tabId: details.tabId,
                    pageUrl: details.initiator || "",
                    embedUrl: embedUrl,
                    ts: Date.now()
                };
                enqueuePendingStreamSerialized(nextPending);

                chrome.tabs.sendMessage(details.tabId, {
                    action:   "stream_detected",
                    url:      details.url,
                    pageUrl:  details.initiator || "",
                    embedUrl: embedUrl
                }, { frameId: 0 }, () => {
                    if (chrome.runtime.lastError) { /* Silently ignore */ }
                });
            }
        },
        { urls: ["<all_urls>"], types: ["xmlhttprequest", "media"] }
    );
}

// B4: Guard against MAX_NUMBER_OF_DYNAMIC_RULES (5000 for session rules)
// Periodically prune rules for tabs that no longer exist
if (chrome?.alarms?.onAlarm && chrome?.declarativeNetRequest?.getSessionRules && chrome?.storage?.session?.get) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "keepAlive") {
            chrome.declarativeNetRequest.getSessionRules((rules) => {
                if (rules.length > 100) { // If accumulating too many rules, prune orphans
                    chrome.storage.session.get(null, (data) => {
                        const validRuleIds = new Set(
                            Object.values(data).flatMap(v => Array.isArray(v) ? v : [v]).map(Number).filter(Boolean)
                        );
                        const orphanIds = rules.map(r => r.id).filter(id => !validRuleIds.has(id));
                        if (orphanIds.length) {
                            chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: orphanIds });
                        }
                    });
                }
            });
        }
    });
}
