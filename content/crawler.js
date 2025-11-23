// Inject Hook Script
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content/hook.js');
script.onload = function () {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

// Store hooked data
let hookedData = {
    events: [],
    requests: [],
    sinks: []
};

// Listen for messages from Hook Script
// Listen for messages from Hook Script
window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;

    let data = event.data;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (e) {
            return; // Not our message or invalid JSON
        }
    }

    if (data.type !== "VULNSCANNER_HOOK") return;
    const payload = data.payload;

    if (payload.type === 'event_listener') {
        hookedData.events.push(payload.data);
    } else if (payload.type === 'dynamic_request') {
        hookedData.requests.push(payload.data);
    } else if (payload.type === 'sink_usage') {
        hookedData.sinks.push(payload.data);
    }
});

console.log("VulnScanner Content Script 로드됨");

// 1. Advanced Comment Extraction (Fetch + Regex)
async function getRawComments() {
    try {
        const raw = await fetch(window.location.href).then(r => r.text());
        const regex = /<!--[\s\S]*?-->/g;
        let match;
        const comments = [];
        while ((match = regex.exec(raw)) !== null) {
            const lineNumber = raw.substring(0, match.index).split('\n').length;
            comments.push({
                type: 'raw_html',
                content: match[0],
                lineNumber: lineNumber
            });
        }
        return comments;
    } catch (e) {
        console.error("Raw fetch failed:", e);
        return [];
    }
}

function getComments(node) {
    let comments = [];
    // DOM Comments (TreeWalker)
    const iterator = document.createNodeIterator(node, NodeFilter.SHOW_COMMENT, null, false);
    let currentNode;
    while (currentNode = iterator.nextNode()) {
        const text = currentNode.nodeValue.trim();
        if (text) comments.push({ type: 'dom', content: `<!-- ${text} -->` });
    }

    // JS Comments (Heuristic)
    document.querySelectorAll('script').forEach(script => {
        if (script.src) return;
        const content = script.innerHTML;
        const singleLine = content.match(/\/\/.*/g);
        if (singleLine) singleLine.forEach(c => comments.push({ type: 'js', content: c.trim() }));
        const multiLine = content.match(/\/\*[\s\S]*?\*\//g);
        if (multiLine) multiLine.forEach(c => comments.push({ type: 'js', content: c.trim() }));
    });

    return comments;
}

function getScripts() {
    let scripts = [];
    document.querySelectorAll('script').forEach(script => {
        if (script.src) {
            scripts.push({ type: 'external', src: script.src });
        } else {
            scripts.push({ type: 'inline', content: script.innerHTML.substring(0, 100) + '...' });
        }
    });
    return scripts;
}

function getLinks() {
    const currentHost = window.location.hostname;
    // Get base domain (e.g., daum.net from v.daum.net)
    const parts = currentHost.split('.');
    const baseDomain = parts.length > 2 ? parts.slice(parts.length - 2).join('.') : currentHost;

    let links = [];

    // 1. <a> tags
    document.querySelectorAll('a').forEach(a => {
        try {
            const url = new URL(a.getAttribute('href'), document.baseURI);
            url.hash = ''; // Remove fragment
            links.push(url.href);
        } catch (e) { }
    });

    // 2. Regex scan for URLs in Scripts and Text
    // Simple regex to find http/https URLs
    const urlRegex = /https?:\/\/[^ "'`\n<]+/g;
    const textContent = document.documentElement.innerHTML;
    const matches = textContent.match(urlRegex);
    if (matches) {
        matches.forEach(urlStr => {
            try {
                const url = new URL(urlStr);
                url.hash = '';
                links.push(url.href);
            } catch (e) { }
        });
    }

    // Filter and Deduplicate
    return [...new Set(links)].filter(l => {
        try {
            const url = new URL(l);
            // Allow subdomains: check if hostname ends with baseDomain
            return (url.protocol === 'http:' || url.protocol === 'https:') &&
                (url.hostname === currentHost || url.hostname.endsWith('.' + baseDomain) || url.hostname === baseDomain);
        } catch (e) {
            return false;
        }
    });
}

// 4. Advanced Form Analysis
function getForms() {
    return Array.from(document.querySelectorAll('form')).map(f => {
        let inputs = Array.from(f.querySelectorAll('input, textarea, select')).map(i => {
            return {
                name: i.name || i.id,
                type: i.type,
                value: i.value,
                autocomplete: i.getAttribute('autocomplete')
            };
        });

        // Security Checks
        let issues = [];
        if (f.method.toUpperCase() === 'GET') issues.push('GET method used (sensitive data exposure risk)');
        if (!f.querySelector('input[type="hidden"][name*="csrf"], input[type="hidden"][name*="token"]')) issues.push('No CSRF token found (heuristic)');
        if (f.querySelector('input[type="file"]')) issues.push('File upload present');

        return {
            action: f.action,
            method: f.method,
            inputs: inputs,
            issues: issues
        };
    });
}

function getDomXssCandidates() {
    const sinks = ['innerHTML', 'outerHTML', 'document.write', 'document.writeln'];
    let findings = [];

    // 스크립트 내 간단한 정규식 검색 (매우 기초적인 휴리스틱)
    document.querySelectorAll('script').forEach(script => {
        const content = script.innerHTML;
        if (!content) return;

        sinks.forEach(sink => {
            if (content.includes(sink)) {
                findings.push({ type: 'Static Analysis', value: sink, snippet: content.substring(0, 50) + '...' });
            }
        });
    });

    // Add hooked sinks
    hookedData.sinks.forEach(s => {
        findings.push({ type: 'Runtime Hook', value: s.type, snippet: s.content });
    });

    return findings;
}

function formToRaw(form) {
    let raw = `${form.method.toUpperCase()} ${form.action} HTTP/1.1\nHost: ${window.location.host}\n`;
    // 더미 헤더 추가
    raw += "User-Agent: VulnScanner/1.0\nContent-Type: application/x-www-form-urlencoded\n\n";

    let body = form.inputs.map(i => `${i.name}=${i.value || 'test'}`).join('&');
    raw += body;
    return raw;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "quick_scan") {
        // Async wrapper for getRawComments
        (async () => {
            const rawComments = await getRawComments();
            const domComments = getComments(document.documentElement);
            const allComments = [...rawComments, ...domComments];

            const forms = getForms();
            const rawForms = forms.map(f => formToRaw(f));

            const data = {
                links: getLinks(),
                forms: forms,
                rawForms: rawForms,
                comments: allComments, // Pass full objects (content, type, lineNumber)
                scripts: getScripts(),
                domXss: getDomXssCandidates(),
                hookedEvents: hookedData.events,
                hookedRequests: hookedData.requests
            };
            console.log("스캔 결과:", data);
            sendResponse({ status: "완료", data: data });
        })();
        return true; // Keep channel open for async response
    }
});
