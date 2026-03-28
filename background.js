// FIX: The CORS rule now uses a domain-based urlFilter instead of the raw
// signed URL. Signed URLs, CDN redirects, and query-string changes would
// cause the exact-URL filter to silently miss the request. Extracting just
// the scheme + host covers all paths on that origin.

function domainFilter(rawUrl) {
    try {
        const u = new URL(rawUrl);
        // FIX: Match everything on this origin: "https://example.com/*"
        // Changed u.hostname to u.host to ensure ports (e.g. :8080) are included
        return `${u.protocol}//${u.host}/*`;
    } catch (_) {
        // Fallback: use the raw URL (original behaviour) if parsing fails.
        return rawUrl;
    }
}

// FIX: Use a monotonic counter instead of Date.now() to avoid rule ID collisions
let nextRuleId = 1;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "open_player" && request.videoSrc) {
        const videoUrl  = request.videoSrc;
        const urlFilter = domainFilter(videoUrl);
        
        const ruleId = nextRuleId++;
        if (nextRuleId > 1_000_000) nextRuleId = 1;

        chrome.declarativeNetRequest.updateDynamicRules(
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
                                { header: "Access-Control-Allow-Credentials", operation: "remove"                               },
                                { header: "X-Frame-Options",                  operation: "remove"                               },
                                { header: "Content-Security-Policy",          operation: "remove"                               }
                            ]
                        },
                        condition: {
                            // FIX: domain-based filter — survives signed URLs and
                            // CDN path changes while still scoping to the right origin.
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
                        chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
                        return;
                    }

                    // Remove the header-override rule when the player tab closes.
                    chrome.tabs.onRemoved.addListener(function cleanupListener(tabId) {
                        if (tabId === tab.id) {
                            chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
                            chrome.tabs.onRemoved.removeListener(cleanupListener);
                        }
                    });
                });
            }
        );
    }
});

// FIX 14: Auto-detect streaming manifests in network traffic
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        // FIX: Ensure tabId >= 0 to prevent background-originated requests from causing errors
        if (details.tabId >= 0 && (details.url.includes('.m3u8') || details.url.includes('.mpd'))) {
            // Signal to content script to display an "Open in WebPlayer" badge globally
            chrome.tabs.sendMessage(details.tabId, {
                action: "stream_detected",
                url: details.url
            }).catch(() => {});
        }
    },
    { urls: ["<all_urls>"], types: ["xmlhttprequest", "media"] }
);
