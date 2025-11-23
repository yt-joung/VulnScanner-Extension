// Main World Hook Script
// 이 스크립트는 페이지의 메인 컨텍스트에서 실행되어 이벤트 리스너와 동적 스크립트 실행을 가로챕니다.

(function () {
    const hookedEvents = [];
    const dynamicScripts = [];
    const sinks = [];

    // Helper to send data to Content Script
    function notify(type, data) {
        window.postMessage(JSON.stringify({ type: "VULNSCANNER_HOOK", payload: { type, data } }), "*");
    }

    // 1. Event Listener Hooking
    const oldAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (type === 'click' || type === 'submit' || type === 'mouseover') {
            try {
                const elementInfo = this instanceof Element ? this.tagName.toLowerCase() + (this.id ? '#' + this.id : '') + (this.className ? '.' + this.className : '') : 'window/document';
                const listenerStr = listener.toString().substring(0, 100);

                notify('event_listener', {
                    eventType: type,
                    element: elementInfo,
                    listener: listenerStr
                });
            } catch (e) { }
        }
        return oldAddEventListener.call(this, type, listener, options);
    };

    // 2. Fetch Hooking
    const oldFetch = window.fetch;
    window.fetch = function (...args) {
        try {
            const url = args[0] instanceof Request ? args[0].url : args[0];
            notify('dynamic_request', { type: 'fetch', url: url });
        } catch (e) { }
        return oldFetch.apply(this, args);
    };

    // 3. XHR Hooking
    const oldXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...args) {
        try {
            notify('dynamic_request', { type: 'xhr', url: url });
        } catch (e) { }
        return oldXHROpen.call(this, method, url, ...args);
    };

    // 4. Eval / Function Hooking (Sinks)
    const oldEval = window.eval;
    window.eval = function (str) {
        notify('sink_usage', { type: 'eval', content: str.substring(0, 100) });
        return oldEval.call(this, str);
    };

    // document.write Hooking
    const oldWrite = document.write;
    document.write = function (...args) {
        notify('sink_usage', { type: 'document.write', content: args.join('').substring(0, 100) });
        return oldWrite.apply(this, args);
    };

    console.log("VulnScanner Hooks Installed (JSON Fix Applied)");
})();
