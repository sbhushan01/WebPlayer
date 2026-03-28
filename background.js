// FIX: The CORS rule now uses a domain-based urlFilter instead of the raw
// signed URL. Signed URLs, CDN redirects, and query-string changes would
// cause the exact-URL filter to silently miss the request.  Extracting just
// the scheme + host covers all paths on that origin.

function domainFilter(rawUrl) {
    try {
        const u = new URL(rawUrl);
        // Match everything on this origin: "https://example.com/*"
        return `${u.protocol}//${u.hostname}/*`;
    } catch (_) {
        // Fallback: use the raw URL (original behaviour) if parsing fails.
        return rawUrl;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "open_player" && request.videoSrc) {
        const videoUrl  = request.videoSrc;
        const urlFilter = domainFilter(videoUrl);
        // Use a timestamp-based ID to avoid collisions across rapid calls.
        const ruleId    = (Date.now() % 1_000_000) + 1;

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
