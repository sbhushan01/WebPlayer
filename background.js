// Keep service worker alive via periodic alarms
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
});
chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
});
chrome.alarms.onAlarm.addListener(() => {});

function domainFilter(rawUrl) {
    try {
        const u = new URL(rawUrl);
        return `${u.protocol}//${u.host}/*`;
    } catch (_) {
        return rawUrl;
    }
}

let nextRuleId = 1;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "open_player" && request.videoSrc) {
        const videoUrl  = request.videoSrc;
        const urlFilter = domainFilter(videoUrl);

        const ruleId = nextRuleId++;
        if (nextRuleId > 1_000_000) nextRuleId = 1;

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

                chrome.tabs.create({ url: playerUrl }, (tab) => {
                    if (chrome.runtime.lastError) {
                        console.error("[WebPlayer] Failed to open tab:", chrome.runtime.lastError.message);
                        chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
                        return;
                    }

                    function cleanupListener(tabId) {
                        if (tabId === tab.id) {
                            chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
                            chrome.tabs.onRemoved.removeListener(cleanupListener);
                        }
                    }
                    chrome.tabs.onRemoved.addListener(cleanupListener);
                });
            }
        );
    }
});

// Cache to prevent duplicate tab spawning based on the Source Tab ID
const recentlyInterceptedTabs = new Set();

chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        if (details.tabId >= 0 && (details.url.includes('.m3u8') || details.url.includes('.mpd'))) {
            
            // Ignore stream chunks to prevent loop triggers
            if (details.url.includes('.ts') || details.url.includes('.m4s') || /seg\d+/i.test(details.url)) return;

            // Deduplicate requests based on Tab ID to prevent multiple tabs for sub-manifests
            if (recentlyInterceptedTabs.has(details.tabId)) return;
            
            recentlyInterceptedTabs.add(details.tabId);
            setTimeout(() => recentlyInterceptedTabs.delete(details.tabId), 5000);

            chrome.tabs.sendMessage(details.tabId, {
                action:  "stream_detected",
                url:     details.url,
                pageUrl: details.initiator || ""
            }, () => {
                if (chrome.runtime.lastError) { /* Silently ignore if content script isn't ready */ }
            });
        }
    },
    { urls: ["<all_urls>"], types: ["xmlhttprequest", "media"] }
);
