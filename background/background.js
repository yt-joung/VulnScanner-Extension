console.log("VulnScanner 백그라운드 서비스 워커 로드됨");

chrome.runtime.onInstalled.addListener(() => {
    console.log("확장 프로그램 설치됨");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "log_network") {
        // 네트워크 로깅 처리
        sendResponse({ status: "logged" });
    } else if (request.action === "inject_inspector") {
        chrome.scripting.executeScript({
            target: { tabId: request.tabId },
            files: ["content/inspector.js"]
        }).then(() => {
            sendResponse({ status: "injected" });
        }).catch(err => {
            console.error("Inspector injection failed:", err);
            sendResponse({ status: "error", message: err.message });
        });
        return true; // Async response
    }
});

chrome.commands.onCommand.addListener((command) => {
    if (command === "quick_scan") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            const tabId = tabs[0].id;

            function executeScan() {
                // Check if tab still exists
                chrome.tabs.get(tabId, (tab) => {
                    if (chrome.runtime.lastError || !tab) return;

                    chrome.tabs.sendMessage(tabId, { action: "quick_scan" }, (response) => {
                        if (chrome.runtime.lastError) {
                            const errorMsg = chrome.runtime.lastError.message;
                            console.log("Scan error (will retry injection):", errorMsg);

                            // If context invalidated, stop retrying
                            if (errorMsg.includes("Extension context invalidated")) {
                                return;
                            }

                            // Inject and retry
                            chrome.scripting.executeScript({
                                target: { tabId: tabId },
                                files: ["content/crawler.js"]
                            }, () => {
                                if (chrome.runtime.lastError) {
                                    console.error("Script injection failed:", chrome.runtime.lastError.message);
                                } else {
                                    setTimeout(executeScan, 500);
                                }
                            });
                            return;
                        }

                        if (response && response.data) {
                            console.log("Background received scan data, forwarding to panel...");
                            chrome.runtime.sendMessage({
                                action: "scan_complete",
                                data: response.data
                            }).catch(err => console.log("Panel not open, ignoring:", err));
                        }
                    });
                });
            }

            executeScan();
        });
    }
});
