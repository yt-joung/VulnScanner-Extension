document.getElementById('btn-scan').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;

    function executeScan() {
      chrome.tabs.sendMessage(tabId, { action: "quick_scan" }, (response) => {
        if (chrome.runtime.lastError) {
          document.getElementById('status').innerText = "콘텐츠 스크립트 연결 실패. 주입 시도 중...";
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content/crawler.js"]
          }, () => {
            if (chrome.runtime.lastError) {
              document.getElementById('status').innerText = "에러: " + chrome.runtime.lastError.message;
            } else {
              setTimeout(executeScan, 500);
            }
          });
          return;
        }
        document.getElementById('status').innerText = "스캔 명령 전송됨. DevTools를 확인하세요.";
      });
    }

    executeScan();
  });
});

document.getElementById('btn-open-panel').addEventListener('click', () => {
  document.getElementById('status').innerText = "DevTools (F12)를 열어 패널을 확인하세요.";
});
