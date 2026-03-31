function setupAlarms() {
    chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
}

function cleanupOldVideoProgress() {
    chrome.storage.local.get(null, (items) => {
        const now = Date.now();
        const keysToRemove = [];
        for (const [key, val] of Object.entries(items)) {
            if (key === '_wp_pending_stream') continue; // B2: skip queue key
            if (typeof val === 'number') {
                keysToRemove.push(key);
            } else if (val && val.ts && (now - val.ts > 30 * 24 * 60 * 60 * 1000)) { // B7: 30-day TTL
                keysToRemove.push(key);
            }
        }
        if (keysToRemove.length > 0) chrome.storage.local.remove(keysToRemove);
    });
}

chrome.runtime.onInstalled.addListener((details) => {
    setupAlarms();
    cleanupOldVideoProgress();
    // B9: Clean up stale DNR session rules from previous extension loads
    chrome.declarativeNetRequest.getSessionRules((rules) => {
        const ids = rules.map(r => r.id);
        if (ids.length) chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
    });
    if (details.reason === "install") {
        chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
    }
});
chrome.runtime.onStartup.addListener(() => {
    setupAlarms();
    cleanupOldVideoProgress();
    // B4: Also clean stale DNR rules on browser startup
    chrome.declarativeNetRequest.getSessionRules((rules) => {
        const ids = rules.map(r => r.id);
        if (ids.length) chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
    });
    // B2: Re-fire any pending stream launch that was interrupted by SW termination
    chrome.storage.local.get('_wp_pending_stream', (res) => {
        const pending = res._wp_pending_stream;
        if (pending && pending.tabId) {
            chrome.tabs.get(pending.tabId, (tab) => {
                if (chrome.runtime.lastError || !tab) {
                    chrome.storage.local.remove('_wp_pending_stream');
                    return;
                }
                chrome.tabs.sendMessage(pending.tabId, {
                    action: 'stream_detected',
                    url: pending.url,
                    pageUrl: pending.pageUrl
                }, () => {
                    if (chrome.runtime.lastError) { /* tab may not have content script */ }
                });
                chrome.storage.local.remove('_wp_pending_stream');
            });
        }
    });
});
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepAlive") {
        cleanupOldVideoProgress();
    }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const tabKey = tabId.toString();
    const data = await chrome.storage.session.get(tabKey);
    if (data[tabKey]) {
        chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [data[tabKey]] });
        chrome.storage.session.remove(tabKey);
    }
});

function domainFilter(rawUrl) {
    try {
        const u = new URL(rawUrl);
        return `${u.protocol}//${u.host}/*`;
    } catch (_) {
        return rawUrl;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "open_player" && request.videoSrc) {
        const videoUrl  = request.videoSrc;
        const urlFilter = domainFilter(videoUrl);

        // Generate a random rule ID with a large space to prevent collisions
        const ruleId = crypto.getRandomValues(new Uint32Array(1))[0] % 2000000000 + 1;

        chrome.declarativeNetRequest.updateSessionRules(
            {
                addRules: [
                    {
                        id: ruleId,
                        priority: 1,
                        action: {
                            type: "modifyHeaders",
                            responseHeaders: [
                                { header: "Access-Control-Allow-Origin",      operation: "set",    value: "*"                  },
                                { header: "Access-Control-Allow-Methods",     operation: "set",    value: "GET, HEAD, OPTIONS"  },
                                { header: "Access-Control-Allow-Headers",     operation: "set",    value: "*"                  },
                                { header: "Access-Control-Expose-Headers",    operation: "set",    value: "*"                  },
                                { header: "Access-Control-Allow-Credentials", operation: "remove"                               },
                                { header: "X-Frame-Options",                  operation: "remove"                               },
                                { header: "Content-Security-Policy",          operation: "remove"                               }
                            ]
                        },
                        condition: {
                            urlFilter: urlFilter,
                            resourceTypes: ["media", "xmlhttprequest", "other"]
                        }
                    }
                ]
            },
            () => {
                if (chrome.runtime.lastError) {
                    console.error("[WebPlayer] Failed to add DNR rule:", chrome.runtime.lastError.message);
                    return;
                }

                const params = new URLSearchParams({
                    src:     videoUrl,
                    title:   request.pageTitle || "Video",
                    pageUrl: request.pageUrl   || ""
                });
                const playerUrl = chrome.runtime.getURL(`player.html?${params}`);

                try {
                    chrome.tabs.create({ url: playerUrl }, (tab) => {
                        if (chrome.runtime.lastError || !tab) {
                            console.error("[WebPlayer] Failed to open tab:", chrome.runtime.lastError?.message);
                            chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
                            return;
                        }
                        chrome.storage.session.set({ [tab.id.toString()]: ruleId });
                    });
                } catch (err) {
                    console.error("[WebPlayer] Exception while creating tab:", err);
                    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
                }
            }
        );
    }
});

const recentlyInterceptedTabs = new Set();

chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        if (details.tabId >= 0 && (details.url.includes('.m3u8') || details.url.includes('.mpd'))) {
            if (details.url.includes('.ts') || details.url.includes('.m4s') || /seg\d+/i.test(details.url)) return;

            if (recentlyInterceptedTabs.has(details.tabId)) return;
            
            recentlyInterceptedTabs.add(details.tabId);
            setTimeout(() => recentlyInterceptedTabs.delete(details.tabId), 5000);

            // B2: Store pending stream in case SW dies before user confirms
            chrome.storage.local.set({ _wp_pending_stream: {
                url: details.url,
                tabId: details.tabId,
                pageUrl: details.initiator || "",
                ts: Date.now()
            }});

            chrome.tabs.sendMessage(details.tabId, {
                action:  "stream_detected",
                url:     details.url,
                pageUrl: details.initiator || ""
            }, () => {
                if (chrome.runtime.lastError) { /* Silently ignore */ }
            });
        }
    },
    { urls: ["<all_urls>"], types: ["xmlhttprequest", "media"] }
);

// B4: Guard against MAX_NUMBER_OF_DYNAMIC_RULES (5000 for session rules)
// Periodically prune rules for tabs that no longer exist
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepAlive") {
        chrome.declarativeNetRequest.getSessionRules((rules) => {
            if (rules.length > 100) { // If accumulating too many rules, prune orphans
                chrome.storage.session.get(null, (data) => {
                    const validRuleIds = new Set(Object.values(data).map(Number).filter(Boolean));
                    const orphanIds = rules.map(r => r.id).filter(id => !validRuleIds.has(id));
                    if (orphanIds.length) {
                        chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: orphanIds });
                    }
                });
            }
        });
    }
});
