(function () {
    if (window.vulnInspectorActive) return;
    window.vulnInspectorActive = true;

    let overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.pointerEvents = 'none';
    overlay.style.background = 'rgba(70, 130, 180, 0.4)';
    overlay.style.border = '2px solid #4682b4';
    overlay.style.zIndex = '100000';
    document.body.appendChild(overlay);

    function moveOverlay(e) {
        const el = e.target;
        if (el === overlay) return;
        const rect = el.getBoundingClientRect();
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
    }

    function handleClick(e) {
        e.preventDefault();
        e.stopPropagation();

        const el = e.target;
        const details = {
            tagName: el.tagName,
            id: el.id,
            className: el.className,
            attributes: Array.from(el.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {}),
            innerHTML: el.innerHTML.substring(0, 200),
            outerHTML: el.outerHTML.substring(0, 200)
        };

        chrome.runtime.sendMessage({
            action: "element_selected",
            details: details
        });

        cleanup();
    }

    function cleanup() {
        document.removeEventListener('mousemove', moveOverlay);
        document.removeEventListener('click', handleClick, true);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        window.vulnInspectorActive = false;
    }

    document.addEventListener('mousemove', moveOverlay);
    document.addEventListener('click', handleClick, true);
})();
