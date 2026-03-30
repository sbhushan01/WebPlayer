function setupAlarms() {
    chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
}

function cleanupOldVideoProgress() {
    chrome.storage.local.get(null, (items) => {
        const now = Date.now();
        const keysToRemove = [];
        for (const [key, val] of Object.entries(items)) {
            // Delete if it's a legacy number OR if it has expired
            if (typeof val === 'number') {
                keysToRemove.push(key);
            } else if (val && val.ts && (now - val.ts > 7 * 24 * 60 * 60 * 1000)) {
                keysToRemove.push(key);
            }
        }
        if (keysToRemove.length > 0) chrome.storage.local.remove(keysToRemove);
    });
}

chrome.runtime.onInstalled.addListener(() => {
    setupAlarms();
    cleanupOldVideoProgress();
});
chrome.runtime.onStartup.addListener(() => {
    setupAlarms();
    cleanupOldVideoProgress();
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

        // Generate a random rule ID to prevent sleep/wake collisions
        const ruleId = Math.floor(Math.random() * 1000000) + 1;

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
