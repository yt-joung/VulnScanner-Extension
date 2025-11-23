import { db } from '../utils/db.js';
import { Settings } from '../utils/settings.js';

// --- Global State ---
let currentScanData = null; // Holds the data from the latest "Current Page Scan"
let selectedTargetId = null;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await db.init();
    await loadTargets();
    setupEventListeners();

    // Tab Handling
    document.getElementById('tab-crawling').addEventListener('click', (e) => { openTab('Crawling'); e.target.classList.add('active'); });
    document.getElementById('tab-security').addEventListener('click', (e) => { openTab('Security'); e.target.classList.add('active'); });
    document.getElementById('tab-network').addEventListener('click', (e) => { openTab('Network'); e.target.classList.add('active'); });
    document.getElementById('tab-inspector').addEventListener('click', (e) => { openTab('Inspector'); e.target.classList.add('active'); });
    document.getElementById('tab-explorer').addEventListener('click', (e) => { openTab('Explorer'); e.target.classList.add('active'); loadExplorerData(); });

    // Initial Tab
    document.getElementById('tab-crawling').click();
});

function openTab(tabName) {
    const tabcontent = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    const tablinks = document.getElementsByClassName("tablinks");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
}

function setupEventListeners() {
    // Target Management
    document.getElementById('btn-add-target').addEventListener('click', () => showModal('modal-add-target'));
    document.getElementById('btn-confirm-add-target').addEventListener('click', createTarget);
    document.getElementById('btn-manage-targets').addEventListener('click', () => {
        loadManageTargetsUI();
        showModal('modal-manage-targets');
    });
    document.getElementById('target-select').addEventListener('change', (e) => {
        selectedTargetId = e.target.value ? parseInt(e.target.value) : null;
        if (document.getElementById('Explorer').style.display === 'block') {
            loadExplorerData();
        }
    });

    // Scanning & Saving
    document.getElementById('btn-refresh-dom').addEventListener('click', executeScan);
    document.getElementById('btn-save-scan').addEventListener('click', saveCurrentScan);

    // Settings
    document.getElementById('btn-settings').addEventListener('click', () => {
        console.log("Settings button clicked");
        try {
            loadSettingsUI();
            showModal('modal-settings');
        } catch (e) {
            console.error("Error opening settings:", e);
        }
    });
    document.getElementById('btn-add-filter').addEventListener('click', addFilter);
    document.getElementById('btn-reset-filters').addEventListener('click', resetFilters);

    // Explorer
    document.getElementById('btn-explorer-search').addEventListener('click', loadExplorerData);
    document.getElementById('btn-explorer-delete').addEventListener('click', deleteSelectedScans);

    // Modals
    document.querySelectorAll('.close').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        });
    });
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = "none";
        }
    };
}

// --- Target Logic ---
async function loadTargets() {
    const targets = await db.getAllTargets();
    const select = document.getElementById('target-select');
    select.innerHTML = '<option value="">대상 선택 (저장용)</option>';
    targets.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = t.name;
        select.appendChild(option);
    });

    // Restore selection if valid
    if (selectedTargetId) {
        select.value = selectedTargetId;
    }
}

async function createTarget() {
    const name = document.getElementById('input-target-name').value.trim();
    const desc = document.getElementById('input-target-desc').value.trim();
    if (!name) return alert("대상 이름을 입력하세요.");

    try {
        await db.createTarget(name, desc);
        document.getElementById('input-target-name').value = '';
        document.getElementById('input-target-desc').value = '';
        document.getElementById('modal-add-target').style.display = 'none';
        await loadTargets();
    } catch (e) {
        alert("대상 생성 실패: " + e.message);
    }
}

async function loadManageTargetsUI() {
    const targets = await db.getAllTargets();
    const list = document.getElementById('target-list');
    list.innerHTML = '';

    if (targets.length === 0) {
        list.innerHTML = '<li>저장된 대상이 없습니다.</li>';
        return;
    }

    targets.forEach(t => {
        const li = document.createElement('li');
        li.style.padding = "5px";
        li.style.borderBottom = "1px solid #eee";
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";

        li.innerHTML = `
            <span><b>${escapeHtml(t.name)}</b> <span style="color:#888; font-size:0.8em;">(${t.description || '설명 없음'})</span></span>
            <button class="danger btn-delete-target" data-id="${t.id}" style="padding: 2px 8px; font-size: 12px;">삭제</button>
        `;
        list.appendChild(li);
    });

    document.querySelectorAll('.btn-delete-target').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm("정말 삭제하시겠습니까? 연관된 모든 스캔 데이터도 삭제됩니다.")) {
                await db.deleteTarget(parseInt(e.target.dataset.id));
                loadManageTargetsUI();
                loadTargets(); // Refresh dropdown
            }
        });
    });
}

// --- Scanning Logic ---
function executeScan() {
    const tabId = chrome.devtools.inspectedWindow.tabId;

    // Check if tab is valid
    if (!tabId) {
        console.error("No tabId found");
        return;
    }

    try {
        chrome.tabs.sendMessage(tabId, { action: "quick_scan" }, (response) => {
            if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message;
                console.log("Scan error (will retry injection):", errorMsg);

                if (errorMsg.includes("Extension context invalidated")) {
                    alert("확장 프로그램이 갱신되었습니다. DevTools를 닫고 다시 열어주세요.");
                    return;
                }

                document.getElementById('dom-results').innerText = "콘텐츠 스크립트 연결 실패. 스크립트 주입 시도 중...";
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ["content/crawler.js"]
                }, () => {
                    if (chrome.runtime.lastError) {
                        document.getElementById('dom-results').innerText = "에러: 스크립트 주입 실패. (" + chrome.runtime.lastError.message + ")";
                    } else {
                        setTimeout(executeScan, 500);
                    }
                });
                return;
            }

            if (response && response.data) {
                processScanData(response.data);
            } else {
                document.getElementById('dom-results').innerText = "데이터를 가져올 수 없습니다.";
            }
        });
    } catch (e) {
        console.error("Execute scan exception:", e);
        if (e.message && e.message.includes("Extension context invalidated")) {
            alert("확장 프로그램이 갱신되었습니다. DevTools를 닫고 다시 열어주세요.");
        }
    }
}

async function processScanData(data) {
    // Apply Filters
    const filters = await Settings.getCommentFilters();
    const regexes = filters.map(f => new RegExp(f));

    data.comments = data.comments.filter(comment => {
        // Keep comment if it doesn't match ANY filter
        const content = typeof comment === 'string' ? comment : comment.content;
        return !regexes.some(rx => rx.test(content));
    });

    // Apply Max Links Limit
    const maxLinks = await Settings.getMaxLinks();
    if (data.links.length > maxLinks) {
        data.links = data.links.slice(0, maxLinks);
    }

    currentScanData = {
        url: await getTabUrl(),
        timestamp: new Date().toISOString(),
        ...data
    };

    renderScanResult(currentScanData, 'dom-results');
}

function getTabUrl() {
    return new Promise(resolve => {
        chrome.devtools.inspectedWindow.eval('window.location.href', (result) => resolve(result));
    });
}

function renderScanResult(data, containerId) {
    let html = '';

    // 1. Links
    html += `<h4>링크 (${data.links.length})</h4>`;
    html += `<div style="max-height: 100px; overflow-y: auto;"><ul>`;
    data.links.forEach(l => html += `<li><a href="${l}" target="_blank">${l}</a></li>`);
    html += `</ul></div>`;

    // 2. Forms
    html += `<h4>폼 (${data.forms.length})</h4>`;
    data.forms.forEach((f, i) => {
        const issues = f.issues && f.issues.length > 0 ? `<br><span style="color:red">⚠️ ${f.issues.join(', ')}</span>` : '';
        html += `<details><summary>Form #${i + 1} (${f.method}) ${issues}</summary>`;
        html += `<pre>${data.rawForms[i]}</pre>`;
        html += `</details>`;
    });

    // 3. Comments
    html += `<h4>주석 (${data.comments.length})</h4>`;
    html += `<ul>`;
    data.comments.forEach((c, index) => {
        const content = typeof c === 'string' ? c : c.content; // Handle legacy string data
        const lineNumber = c.lineNumber ? ` <button class="btn-view-source" data-line="${c.lineNumber}" style="padding:1px 5px; font-size:10px; margin-left:5px;">소스 보기 (Line ${c.lineNumber})</button>` : '';
        html += `<li>${escapeHtml(content.substring(0, 100))}${lineNumber}</li>`;
    });
    html += `</ul>`;

    // Add event listeners for source view buttons
    setTimeout(() => {
        document.querySelectorAll('.btn-view-source').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const line = parseInt(e.target.dataset.line);
                const url = await getTabUrl();
                chrome.devtools.panels.openResource(url, line - 1, () => {
                    console.log("Jumped to line", line);
                });
            });
        });
    }, 0);

    // 4. Scripts
    html += `<h4>스크립트 (${data.scripts.length})</h4>`;
    html += `<ul>`;
    data.scripts.forEach(s => {
        if (s.type === 'external') html += `<li>Src: ${s.src}</li>`;
        else html += `<li>Inline: ${escapeHtml(s.content)}</li>`;
    });
    html += `</ul>`;

    document.getElementById(containerId).innerHTML = html;
}

function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- Saving Logic ---
async function saveCurrentScan() {
    if (!currentScanData) return alert("저장할 스캔 데이터가 없습니다. 먼저 스캔을 수행하세요.");
    if (!selectedTargetId) return alert("저장할 대상을 선택하세요.");

    try {
        await db.saveScan(selectedTargetId, currentScanData);
        const status = document.getElementById('save-status');
        status.innerText = "저장 완료!";
        setTimeout(() => status.innerText = "", 2000);
    } catch (e) {
        alert("저장 실패: " + e.message);
    }
}

// --- Settings Logic ---
async function loadSettingsUI() {
    // Load Filters
    const filters = await Settings.getCommentFilters();
    const list = document.getElementById('settings-filters-list');
    list.innerHTML = '';
    filters.forEach(f => {
        const li = document.createElement('li');
        li.innerHTML = `<code>${escapeHtml(f)}</code> <button style="padding: 2px 5px; font-size: 10px;" class="danger btn-remove-filter" data-filter="${escapeHtml(f)}">X</button>`;
        list.appendChild(li);
    });

    document.querySelectorAll('.btn-remove-filter').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            await Settings.removeFilter(e.target.dataset.filter);
            loadSettingsUI();
        });
    });

    // Load General Settings
    const maxLinks = await Settings.getMaxLinks();
    document.getElementById('input-max-links').value = maxLinks;

    // Save General Settings Handler (Remove old listener to prevent duplicates if any)
    const saveBtn = document.getElementById('btn-save-general-settings');
    const newBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newBtn, saveBtn);

    newBtn.addEventListener('click', async () => {
        const val = parseInt(document.getElementById('input-max-links').value);
        if (val > 0) {
            await Settings.saveMaxLinks(val);
            alert("설정이 저장되었습니다.");
        } else {
            alert("올바른 숫자를 입력하세요.");
        }
    });
}

async function addFilter() {
    const pattern = document.getElementById('input-new-filter').value;
    if (!pattern) return;
    try {
        new RegExp(pattern); // Validate Regex
        await Settings.addFilter(pattern);
        document.getElementById('input-new-filter').value = '';
        loadSettingsUI();
    } catch (e) {
        alert("유효하지 않은 정규식입니다.");
    }
}

async function resetFilters() {
    if (confirm("필터를 초기화하시겠습니까?")) {
        await Settings.resetFilters();
        loadSettingsUI();
    }
}

// --- Explorer Logic ---
async function loadExplorerData() {
    const container = document.getElementById('explorer-results');
    if (!selectedTargetId) {
        container.innerHTML = '<p>대상을 선택해주세요.</p>';
        return;
    }

    const scans = await db.getScansByTarget(selectedTargetId);
    const query = document.getElementById('explorer-search').value.toLowerCase();

    const filteredScans = scans.filter(s => {
        if (!query) return true;
        return s.url.toLowerCase().includes(query) || JSON.stringify(s.data).toLowerCase().includes(query);
    });

    if (filteredScans.length === 0) {
        container.innerHTML = '<p>저장된 데이터가 없습니다.</p>';
        return;
    }

    let html = '<table border="1"><tr><th><input type="checkbox" id="select-all-scans"></th><th>ID</th><th>URL</th><th>시간</th><th>요약</th><th>작업</th></tr>';
    filteredScans.forEach(s => {
        const summary = `Links: ${s.data.links.length}, Forms: ${s.data.forms.length}, Comments: ${s.data.comments.length}`;
        html += `<tr>
            <td><input type="checkbox" class="scan-checkbox" value="${s.id}"></td>
            <td>${s.id}</td>
            <td style="word-break: break-all;">${s.url}</td>
            <td>${new Date(s.timestamp).toLocaleString()}</td>
            <td>${summary}</td>
            <td><button class="btn-view-scan" data-id="${s.id}">보기</button></td>
        </tr>`;
    });
    html += '</table>';
    html += '<div id="explorer-detail-view" style="margin-top: 20px; border-top: 2px solid #ccc; padding-top: 10px;"></div>';

    container.innerHTML = html;

    // Event Listeners for dynamic elements
    document.getElementById('select-all-scans').addEventListener('change', (e) => {
        document.querySelectorAll('.scan-checkbox').forEach(cb => cb.checked = e.target.checked);
    });

    document.querySelectorAll('.btn-view-scan').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
            const scan = scans.find(s => s.id === id);
            if (scan) {
                document.getElementById('explorer-detail-view').innerHTML = '<h4>상세 보기</h4><div id="detail-content"></div>';
                renderScanResult(scan.data, 'detail-content');
            }
        });
    });
}

async function deleteSelectedScans() {
    const checkboxes = document.querySelectorAll('.scan-checkbox:checked');
    if (checkboxes.length === 0) return alert("삭제할 항목을 선택하세요.");

    if (confirm(`${checkboxes.length}개 항목을 삭제하시겠습니까?`)) {
        const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
        await db.deleteScans(ids);
        loadExplorerData();
    }
}

function showModal(id) {
    document.getElementById(id).style.display = 'block';
}

// --- Network & Security Logic (Restored) ---
chrome.devtools.network.onRequestFinished.addListener(request => {
    chrome.devtools.inspectedWindow.eval('window.location.hostname', (hostname, isException) => {
        if (isException || !hostname) return;

        const requestUrl = new URL(request.request.url);
        // Filter: Same domain only (or subdomain)
        if (!requestUrl.hostname.endsWith(hostname) && requestUrl.hostname !== hostname) return;

        const networkLog = document.getElementById('network-log');
        const div = document.createElement('div');
        div.style.borderBottom = "1px solid #eee";
        div.style.padding = "8px";
        div.style.wordBreak = "break-all";

        // Method & URL
        let content = `<div><strong>${request.request.method}</strong> ${requestUrl.pathname}${requestUrl.search} (${request.response.status})</div>`;

        // Request Headers (Important ones)
        const importantReqHeaders = ['Cookie', 'Authorization', 'User-Agent', 'Referer', 'Content-Type'];
        let reqHeaders = request.request.headers.filter(h => importantReqHeaders.includes(h.name)).map(h => `${h.name}: ${h.value}`).join('<br>');
        if (reqHeaders) content += `<div style="font-size:0.9em; color:#666; margin-top:4px;"><strong>Req Headers:</strong><br>${reqHeaders}</div>`;

        // Post Data
        if (request.request.postData && request.request.postData.text) {
            content += `<div style="font-size:0.9em; color:#d35400; margin-top:4px;"><strong>Payload:</strong><br>${escapeHtml(request.request.postData.text)}</div>`;
        }

        // Response Headers (Security)
        const secHeaders = ['Server', 'X-Powered-By', 'Set-Cookie'];
        let resHeaders = request.response.headers.filter(h => secHeaders.includes(h.name)).map(h => `${h.name}: ${h.value}`).join('<br>');
        if (resHeaders) content += `<div style="font-size:0.9em; color:#27ae60; margin-top:4px;"><strong>Res Headers:</strong><br>${resHeaders}</div>`;

        div.innerHTML = content;
        networkLog.appendChild(div);

        if (request._resourceType === 'document' || request._resourceType === 'main_frame') {
            analyzeHeaders(request);
            analyzeCookies();
        }
    });
});

function analyzeHeaders(request) {
    const headers = request.response.headers;
    const securityHeaders = {
        'strict-transport-security': { name: 'Strict-Transport-Security', value: '미설정', severity: 'high' },
        'content-security-policy': { name: 'Content-Security-Policy', value: '미설정', severity: 'high' },
        'x-frame-options': { name: 'X-Frame-Options', value: '미설정', severity: 'medium' },
        'x-content-type-options': { name: 'X-Content-Type-Options', value: '미설정', severity: 'medium' },
        'referrer-policy': { name: 'Referrer-Policy', value: '미설정', severity: 'low' },
        'permissions-policy': { name: 'Permissions-Policy', value: '미설정', severity: 'low' },
        'server': { name: 'Server', value: '미설정', severity: 'info' },
        'x-powered-by': { name: 'X-Powered-By', value: '미설정', severity: 'info' }
    };

    headers.forEach(h => {
        const lowerName = h.name.toLowerCase();
        if (securityHeaders.hasOwnProperty(lowerName)) {
            securityHeaders[lowerName].value = h.value;
        }
    });

    const container = document.getElementById('security-headers');
    let html = '<h4>주요 보안 헤더 분석</h4>';
    html += '<table border="1" style="width:100%; border-collapse: collapse;">';
    html += '<tr style="background:#f2f2f2; text-align:left;"><th>헤더</th><th>값</th><th>상태</th></tr>';

    for (const key in securityHeaders) {
        const item = securityHeaders[key];
        let status = '';
        let rowStyle = '';

        if (item.value === '미설정') {
            if (item.severity === 'high' || item.severity === 'medium') {
                status = '<span style="color:red">❌ 미설정</span>';
                rowStyle = 'background-color: #fff0f0;';
            } else {
                status = '<span style="color:orange">⚠️ 미설정</span>';
            }
        } else {
            status = '<span style="color:green">✅ 설정됨</span>';
        }

        html += `<tr style="${rowStyle}"><td style="padding:4px;"><b>${item.name}</b></td><td style="padding:4px; word-break:break-all;">${item.value}</td><td style="padding:4px; white-space:nowrap;">${status}</td></tr>`;
    }
    html += '</table>';
    container.innerHTML = html;
}

function analyzeCookies() {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    if (!tabId) return;

    chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) return;

        try {
            const url = new URL(tab.url);
            chrome.cookies.getAll({ domain: url.hostname }, (cookies) => {
                const container = document.getElementById('security-headers');
                let html = '<h4>쿠키</h4><table border="1"><tr><th>이름</th><th>Secure</th><th>HttpOnly</th><th>SameSite</th></tr>';

                if (cookies && cookies.length > 0) {
                    cookies.forEach(c => {
                        const secure = c.secure ? '<span style="color:green">예</span>' : '<span style="color:red">아니오</span>';
                        const httpOnly = c.httpOnly ? '<span style="color:green">예</span>' : '<span style="color:red">아니오</span>';
                        html += `<tr><td>${c.name}</td><td>${secure}</td><td>${httpOnly}</td><td>${c.sameSite}</td></tr>`;
                    });
                } else {
                    html += '<tr><td colspan="4">쿠키 없음</td></tr>';
                }
                html += '</table>';

                if (container.innerHTML.includes('<table')) {
                    if (!container.innerHTML.includes('<h4>쿠키</h4>')) {
                        container.innerHTML += html;
                    }
                } else {
                    container.innerHTML = html;
                }
            });
        } catch (e) {
            console.error("Cookie analysis failed:", e);
        }
    });
}

// --- Inspector Logic (Restored) ---
document.getElementById('btn-start-inspect').addEventListener('click', () => {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    chrome.runtime.sendMessage({
        action: "inject_inspector",
        tabId: tabId
    });
    document.getElementById('inspector-details').innerText = "검사기 활성화됨. 페이지의 요소를 클릭하세요.";
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "element_selected") {
        const details = request.details;
        let html = '<h4>선택된 요소 분석</h4>';
        html += `<div style="margin-bottom:10px;"><b>태그:</b> <span style="color:#2980b9">${details.tagName}</span></div>`;
        html += `<pre style="white-space: pre-wrap; word-break: break-all;">${escapeHtml(details.outerHTML)}</pre>`;
        document.getElementById('inspector-details').innerHTML = html;
    }
});
