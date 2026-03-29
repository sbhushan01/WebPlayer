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

                const playerUrl = chrome.runtime.getURL(
                    `player.html?src=${encodeURIComponent(videoUrl)}&title=${encodeURIComponent(request.pageTitle || "Video")}`
                );

                chrome.tabs.create({ url: playerUrl }, (tab) => {
                    if (chrome.runtime.lastError) {
                        console.error("[WebPlayer] Failed to open tab:", chrome.runtime.lastError.message);
                        chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
                        return;
                    }

                    // BUG FIX: Only remove the CORS bypass rule when the tab is actually closed. 
                    // This prevents the video from breaking if the user hits refresh.
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

chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        if (details.tabId >= 0 && (details.url.includes('.m3u8') || details.url.includes('.mpd'))) {
            chrome.tabs.sendMessage(details.tabId, {
                action: "stream_detected",
                url: details.url
            }, () => {
                if (chrome.runtime.lastError) { /* Silently ignore if content script isn't ready */ }
            });
        }
    },
    { urls: ["<all_urls>"], types: ["xmlhttprequest", "media"] }
);