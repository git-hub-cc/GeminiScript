javascript:(function main() {
    const panelId = 'gemini-mvp-helper';
    const styleId = 'gemini-mvp-helper-styles';
    const existingPanel = document.getElementById(panelId);

    if (existingPanel) {
        const existingStyle = document.getElementById(styleId);
        existingPanel.remove();
        if (existingStyle) {
            existingStyle.remove();
        }
        return;
    }

    const AI_PLATFORMS = [
        { name: 'AIstudio', hostname: 'aistudio.google.com', selector: 'ms-autosize-textarea textarea' },
        { name: 'Gemini', hostname: 'gemini.google.com', selector: 'rich-textarea .ql-editor[contenteditable="true"]' },
        { name: 'ChatGPT', hostname: 'chatgpt.com', selector: '#prompt-textarea' },
        { name: 'DeepSeek', hostname: 'chat.deepseek.com', selector: 'textarea#chat-input' },
    ];

    let activePlatform = null;
    let activeTextarea = null;
    const currentHostname = window.location.hostname + window.location.pathname;

    for (const platform of AI_PLATFORMS) {
        if (currentHostname.includes(platform.hostname)) {
            const element = document.querySelector(platform.selector);
            if (element) {
                activePlatform = platform;
                activeTextarea = element;
                break;
            }
        }
    }

    /* --- 数据结构升级：将扁平的 prompts 数组升级为带分组的 promptGroups --- */
    let promptGroups = [
        {
            name: "方案",
            prompts: [
                "根据项目内容，接下来应该开发什么功能，往商业化。",
                "给出建议，本次不输出代码。",
                "从aa,bb的角度进行入手，还可以从什么维度进行入手，要求更多的维度",
                "当前哪些功能未完成，列出来。",
                "当前存在哪些问题，列出来。",
                "实现原理参考下面内容",
                "检查代码，是否存在未完成的代码，比如部分因为ai输出token限制，输出省略",
                "当前哪些功能未完成，比如说AI省略的地方，AI说后续完成的地方。",
            ]
        },
        {
            name: "文件",
            prompts: [
                "对上述功能进行修改，列出需要修改的文件，同一个文件仅列出一次",
                "对上述问题进行修改，列出需要修改的文件，同一个文件仅列出一次",
                "将上述功能分为两个阶段，第一个阶段时后端修改，第二个阶段时前端修改，本次输出需要修改哪些文件，本次不输出具体代码。",
            ]
        },
        {
            name: "代码",
            prompts: [
                "因为内容过多，分多次输出，每次1000行内容，同一个文件放在同一次回复，首次说明分几次",
                "给出第一阶段最终代码，对于没有变化的文件不需要输出。",
                "给出最终代码，样式与主题相匹配，对于没有变化的文件不需要输出。",
                "使用中文回复，注释也使用中文",
                "注释全部使用使用 /* --- xxx--- */",
            ]
        },
        {
            name: "美化",
            prompts: [
                "重写了配色方案",
            ]
        }
    ];

    let activeGroupIndex = 0;
    let originalContent = '';
    let isUpdatingByScript = false;

    /* ---------- Trusted Types 适配：尽量获取/创建可用策略，失败则进入 DOM-only 模式 ---------- */
    let policy = null;
    try {
        if (window.trustedTypes) {
            if (typeof window.trustedTypes.getPolicyNames === 'function' && typeof window.trustedTypes.getPolicy === 'function') {
                const names = window.trustedTypes.getPolicyNames();
                for (const n of names) {
                    const p = window.trustedTypes.getPolicy(n);
                    if (p && typeof p.createHTML === 'function') {
                        policy = p;
                        break;
                    }
                }
            }
            if (!policy && typeof window.trustedTypes.createPolicy === 'function') {
                const candidates = ['ai-prompt-helper-policy-v17', 'gph-policy', 'bookmarklet-policy', 'default'];
                for (const name of candidates) {
                    try {
                        policy = window.trustedTypes.createPolicy(name, { createHTML: (s) => s });
                        break;
                    } catch (e) { /* 忽略，尝试下一个候选名 */ }
                }
            }
        }
    } catch (e) {
        policy = null;
    }

    const setSafeHTML = (element, html) => {
        while (element.firstChild) element.removeChild(element.firstChild);

        if (!html) return;
        if (policy && typeof policy.createHTML === 'function') {
            element.innerHTML = policy.createHTML(html);
            return;
        }

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString('<div id="__gph_wrap__">' + html + '</div>', 'text/html');
            const wrap = doc.getElementById('__gph_wrap__');
            if (wrap) {
                const frag = document.createDocumentFragment();
                Array.from(wrap.childNodes).forEach(node => frag.appendChild(node));
                element.appendChild(frag);
            }
        } catch (e) {
            element.textContent = html;
        }
    };

    const escapeHTML = (str) => {
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    };

    const truncateAndEscapeText = (text, maxLines = 5) => {
        if (text.trim() === '') return '...';
        const lines = text.split('\n');
        const truncatedText = lines.length > maxLines ? lines.slice(0, maxLines).join('\n') + '\n...' : text;
        return escapeHTML(truncatedText);
    };

    const showModal = ({ title, message, type = 'info', onConfirm, onCancel }) => {
        const existingModal = document.getElementById('gph-modal-overlay');
        if (existingModal) existingModal.remove();

        const isConfirm = type === 'confirm';
        const modalId = 'gph-modal-overlay';

        const modalHTML = `
            <div id="gph-modal-container" role="dialog" aria-modal="true" aria-labelledby="gph-modal-title">
                <div id="gph-modal-header" class="${type}">
                    <h4 id="gph-modal-title">${title}</h4>
                    <button id="gph-modal-close" aria-label="关闭">&times;</button>
                </div>
                <div id="gph-modal-body"><p>${message}</p></div>
                <div id="gph-modal-footer">
                    ${isConfirm ? `<button id="gph-modal-cancel" class="gph-action-btn gph-secondary-btn">取消</button>` : ''}
                    <button id="gph-modal-ok" class="gph-action-btn">${isConfirm ? '确认' : '好的'}</button>
                </div>
            </div>`;

        const overlay = document.createElement('div');
        overlay.id = modalId;
        overlay.className = 'gph-modal-overlay';
        setSafeHTML(overlay, modalHTML);
        document.body.appendChild(overlay);

        const closeModal = () => {
            overlay.classList.add('fade-out');
            overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
            document.removeEventListener('keydown', keydownHandler);
        };

        const keydownHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                if (onCancel) onCancel();
            }
        };

        overlay.addEventListener('click', (e) => {
            if (e.target.id === modalId) {
                closeModal();
                if (onCancel) onCancel();
            }
        });

        const okBtn = overlay.querySelector('#gph-modal-ok');
        const closeBtn = overlay.querySelector('#gph-modal-close');

        okBtn && okBtn.addEventListener('click', () => {
            closeModal();
            if (onConfirm) onConfirm();
        });

        closeBtn && closeBtn.addEventListener('click', () => {
            closeModal();
            if (onCancel) onCancel();
        });

        if (isConfirm) {
            const cancelBtn = overlay.querySelector('#gph-modal-cancel');
            cancelBtn && cancelBtn.addEventListener('click', () => {
                closeModal();
                if (onCancel) onCancel();
            });
        }

        document.addEventListener('keydown', keydownHandler);
        setTimeout(() => okBtn && okBtn.focus(), 50);
    };

    if (!activeTextarea) {
        const tempStyleSheet = document.createElement("style");
        tempStyleSheet.innerText = `
            .gph-modal-overlay { --bg-primary: #2B2B2B; --bg-secondary: #3C3F41; --text-primary: #fcfcfc; --text-button: #DFDFDF; --text-handle: #6E6E6E; --border-primary: #4E5052; --accent-primary: #3675B4; --accent-secondary: #555555; --accent-delete: #C75450; --accent-success: #6A8759; --shadow-color: rgba(0,0,0,0.7); --overlay-bg: rgba(0,0,0,0.6); }
            @media (prefers-color-scheme: light) { .gph-modal-overlay { --bg-primary: #FFFFFF; --bg-secondary: #F2F2F2; --text-primary: #000000; --text-button: #FFFFFF; --text-handle: #AAAAAA; --border-primary: #DCDCDC; --accent-primary: #3966B2; --accent-secondary: #8C8C8C; --accent-delete: #DB5860; --accent-success: #34802E; --shadow-color: rgba(0,0,0,0.2); --overlay-bg: rgba(32,33,36,0.5); } }
            @keyframes gph-fade-in { from { opacity: 0; } to { opacity: 1; } } @keyframes gph-slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            .gph-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--overlay-bg); z-index: 10000; display: flex; align-items: center; justify-content: center; animation: gph-fade-in 0.2s ease-out; font-family: sans-serif; }
            #gph-modal-container { background: var(--bg-primary); color: var(--text-primary); border-radius: 8px; box-shadow: 0 5px 20px var(--shadow-color); width: 90%; max-width: 400px; animation: gph-slide-up 0.3s ease-out; border-top: 4px solid var(--accent-delete); }
            #gph-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-primary); } #gph-modal-title { margin: 0; font-size: 16px; font-weight: bold; color: var(--accent-delete); }
            #gph-modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-handle); } #gph-modal-body { padding: 16px; line-height: 1.6; } #gph-modal-body p { margin: 0; }
            #gph-modal-footer { padding: 12px 16px; background: var(--bg-secondary); display: flex; justify-content: flex-end; gap: 10px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; }
            .gph-action-btn { background: var(--accent-primary); color: var(--text-button); border: 1px solid var(--accent-primary); border-radius: 4px; padding: 8px 20px; cursor: pointer; font-size: 13px; }`;
        document.head.appendChild(tempStyleSheet);
        showModal({
            title: '加载失败',
            message: '在当前页面未找到支持的AI输入框。脚本无法运行。<br>支持平台: Gemini, ChatGPT, DeepSeek等。',
            type: 'error'
        });
        return;
    }

    /* --- CSS 样式：模仿IDEA配色，增加最小侵入性功能 --- */
    const styles = `
    /* IDEA Darcula-inspired Dark Theme */
    #gemini-mvp-helper, .gph-modal-overlay { --bg-primary: #2B2B2B; --bg-secondary: #3C3F41; --bg-header: #313335; --bg-input: #2B2B2B; --bg-dragging: #4E5052; --text-primary: #fcfcfc; --text-title: #fcfcfc; --text-button: #DFDFDF; --text-handle: #6E6E6E; --border-primary: #4E5052; --border-input: #555555; --accent-primary: #3675B4; --accent-secondary: #555555; --accent-delete: #C75450; --accent-delete-hover: #D76460; --accent-success: #6A8759; --shadow-color: rgba(0,0,0,0.7); --original-content-bg: rgba(43, 43, 43, 0.7); --original-content-border: #6E6E6E; --overlay-bg: rgba(0,0,0,0.6); }
    /* IDEA Light Theme */
    @media (prefers-color-scheme: light) { #gemini-mvp-helper, .gph-modal-overlay { --bg-primary: #FFFFFF; --bg-secondary: #F2F2F2; --bg-header: #EAEAEA; --bg-input: #FFFFFF; --bg-dragging: #D3E5FF; --text-primary: #000000; --text-title: #000000; --text-button: #FFFFFF; --text-handle: #AAAAAA; --border-primary: #DCDCDC; --border-input: #C9C9C9; --accent-primary: #3966B2; --accent-secondary: #8C8C8C; --accent-delete: #DB5860; --accent-delete-hover: #E86971; --accent-success: #34802E; --shadow-color: rgba(0,0,0,0.2); --original-content-bg: #E8F2FE; --original-content-border: #C9C9C9; --overlay-bg: rgba(32,33,36,0.5); } }
    
    /* Main Panel - Minimal Intrusion */
    #gemini-mvp-helper { position: fixed; bottom: 20px; right: 20px; width: 500px; background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: 8px; box-shadow: 0 4px 15px var(--shadow-color); z-index: 9999; color: var(--text-primary); font-family: sans-serif; display: flex; flex-direction: column; max-height: 80vh; resize: both; overflow: auto; min-width: 320px; min-height: 150px; opacity: 0.95; transition: opacity 0.2s ease-in-out; }
    #gemini-mvp-helper:hover, #gemini-mvp-helper.dragging-panel { opacity: 1; }
    
    /* Collapsed State */
    #gemini-mvp-helper.collapsed { height: auto; max-height: 45px; resize: none; overflow: hidden; }
    #gemini-mvp-helper.collapsed > *:not(#gph-mvp-header) { display: none; }
    #gemini-mvp-helper.collapsed #gph-mvp-toggle-collapse:before { content: '▲'; font-size: 10px; line-height: 14px; }
    
    /* Header with Controls */
    #gph-mvp-header { padding: 10px 15px; background: var(--bg-header); cursor: move; user-select: none; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; }
    #gph-mvp-title { margin: 0; font-size: 14px; font-weight: normal; color: var(--text-title); }
    #gph-header-controls { display: flex; align-items: center; }
    #gph-mvp-toggle-collapse { background: var(--bg-secondary); border: 1px solid var(--border-primary); color: var(--text-handle); cursor: pointer; width: 20px; height: 20px; border-radius: 4px; font-size: 16px; line-height: 16px; padding: 0; display: flex; align-items: center; justify-content: center; }
    #gph-mvp-toggle-collapse:hover { background: var(--border-primary); }
    #gph-mvp-toggle-collapse:before { content: '▼'; font-size: 10px; line-height: 14px; }
    
    #gph-mvp-tabs { display: flex; background: var(--bg-secondary); padding: 5px 15px 0; border-bottom: 1px solid var(--border-primary); flex-shrink: 0; }
    .gph-mvp-tab { list-style: none; padding: 8px 12px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; font-size: 13px; }
    .gph-mvp-tab.active { border-bottom-color: var(--accent-primary); color: var(--text-primary); font-weight: bold; }
    #gph-mvp-body { padding: 15px; overflow-y: auto; }
    #gph-mvp-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .gph-mvp-item, .gph-original-content-item { display: flex; align-items: flex-start; background: var(--bg-secondary); padding: 8px; border-radius: 4px; border: 1px solid var(--border-primary); }
    .gph-mvp-item.dragging { opacity: 0.7; background: var(--bg-dragging); }
    .gph-original-content-item { background-color: var(--original-content-bg); border: 1px dashed var(--original-content-border); flex-direction: column; }
    #gph-original-content-text { font-style: italic; word-wrap: break-word; margin-top: 5px; width: 100%; white-space: pre-wrap; font-size: 12px; }
    .gph-drag-handle { cursor: grab; margin-right: 10px; color: var(--text-handle); user-select: none; padding-top: 2px; }
    .gph-mvp-item input[type="checkbox"] { margin-right: 10px; margin-top: 4px; flex-shrink: 0; }
    .gph-mvp-item-text { flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-top: 2px; font-size: 13px; }
    .gph-delete-btn { background: none; border: none; color: var(--accent-delete); cursor: pointer; font-size: 18px; padding: 0 5px; flex-shrink: 0; }
    .gph-delete-btn:hover { color: var(--accent-delete-hover); }
    #gph-mvp-add-area { padding: 15px; border-top: 1px solid var(--border-primary); background: var(--bg-secondary); display: flex; gap: 10px; flex-shrink: 0; }
    #gph-new-prompt-input { flex-grow: 1; background: var(--bg-input); border: 1px solid var(--border-input); color: var(--text-primary); border-radius: 4px; padding: 8px; font-size: 13px; }
    #gph-mvp-actions { padding: 15px; border-top: 1px solid var(--border-primary); display: flex; justify-content: space-between; gap: 10px; flex-shrink: 0; }
    .gph-action-btn { background: var(--accent-primary); color: var(--text-button); border: 1px solid var(--accent-primary); border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 13px; flex-grow: 1; }
    .gph-action-btn:hover { filter: brightness(1.1); }
    .gph-secondary-btn { background: var(--accent-secondary); border-color: var(--accent-secondary); }
    
    @keyframes gph-fade-in { from { opacity: 0; } to { opacity: 1; } } @keyframes gph-fade-out { from { opacity: 1; } to { opacity: 0; } } @keyframes gph-slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .gph-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--overlay-bg); z-index: 10000; display: flex; align-items: center; justify-content: center; animation: gph-fade-in 0.2s ease-out; }
    .gph-modal-overlay.fade-out { animation: gph-fade-out 0.2s ease-in forwards; }
    #gph-modal-container { background: var(--bg-primary); color: var(--text-primary); border-radius: 8px; box-shadow: 0 5px 20px var(--shadow-color); width: 90%; max-width: 400px; animation: gph-slide-up 0.3s ease-out; border-top: 4px solid var(--accent-primary); }
    #gph-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-primary); }
    #gph-modal-header.success { border-top-color: var(--accent-success); } #gph-modal-header.error { border-top-color: var(--accent-delete); } #gph-modal-header.confirm { border-top-color: var(--accent-secondary); }
    #gph-modal-title { margin: 0; font-size: 16px; font-weight: bold; color: var(--text-primary); }
    #gph-modal-header.success #gph-modal-title { color: var(--accent-success); } #gph-modal-header.error #gph-modal-title { color: var(--accent-delete); }
    #gph-modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-handle); line-height: 1; padding: 0 4px; } #gph-modal-close:hover { color: var(--text-primary); }
    #gph-modal-body { padding: 16px; line-height: 1.6; } #gph-modal-body p { margin: 0; }
    #gph-modal-footer { padding: 12px 16px; background: var(--bg-secondary); display: flex; justify-content: flex-end; gap: 10px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; }
    #gph-modal-footer .gph-action-btn { flex-grow: 0; padding: 8px 20px; }`;

    /* --- HTML 结构：增加折叠按钮 --- */
    const panelHTML = `
        <div id="gph-mvp-header">
            <h3 id="gph-mvp-title">快捷提示词</h3>
            <div id="gph-header-controls">
                <button id="gph-mvp-toggle-collapse" title="折叠/展开"></button>
            </div>
        </div>
        <ul id="gph-mvp-tabs"></ul>
        <div id="gph-mvp-body"><ul id="gph-mvp-list"></ul></div>
        <div id="gph-mvp-add-area">
            <input type="text" id="gph-new-prompt-input" placeholder="在此添加新提示词...">
            <button id="gph-add-prompt-btn" class="gph-action-btn">+</button>
        </div>
        <div id="gph-mvp-actions">
             <button id="gph-select-all-btn" class="gph-action-btn gph-secondary-btn">全选/反选</button>
             <button id="gph-copy-btn" class="gph-action-btn">复制代码</button>
        </div>`;

    const styleSheet = document.createElement("style");
    styleSheet.id = styleId;
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const panel = document.createElement('div');
    panel.id = panelId;
    setSafeHTML(panel, panelHTML);
    document.body.appendChild(panel);

    const tabContainer = document.getElementById('gph-mvp-tabs');
    const promptList = document.getElementById('gph-mvp-list');
    const newPromptInput = document.getElementById('gph-new-prompt-input');
    const titleEl = document.getElementById('gph-mvp-title');
    const collapseBtn = document.getElementById('gph-mvp-toggle-collapse');

    if (titleEl) titleEl.textContent = `快捷提示词 (${activePlatform.name})`;
    if (collapseBtn) collapseBtn.addEventListener('click', () => panel.classList.toggle('collapsed'));

    const getInputValue = (element) => {
        if (!element) return '';
        if (element.isContentEditable) {
            return Array.from(element.querySelectorAll('p')).map(p => p.textContent).join('\n');
        }
        return element.value || element.textContent;
    };

    const setInputValue = (element, value) => {
        if (!element) return;
        if (element.isContentEditable) {
            const htmlValue = value.split('\n').map(line => `<p>${escapeHTML(line) || '<br>'}</p>`).join('');
            setSafeHTML(element, htmlValue);
        } else {
            element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    };

    /* --- 核心函数适配：使其操作当前激活的标签页数据 --- */
    const updateActiveTextarea = () => {
        if (!activeTextarea) return;

        const activeGroup = promptGroups[activeGroupIndex];
        const itemOrder = activeGroup.itemOrder;
        const prompts = activeGroup.prompts;

        isUpdatingByScript = true;
        const checkedIds = new Set(
            Array.from(promptList.querySelectorAll('input:checked')).map(cb => cb.closest('li').dataset.id)
        );
        const mainContentIndex = itemOrder.indexOf('main_content');
        const promptsBefore = [];
        const promptsAfter = [];

        itemOrder.forEach((id, index) => {
            if (id.startsWith('prompt_') && checkedIds.has(id)) {
                const promptIndex = parseInt(id.split('_')[1], 10);
                const targetArray = index < mainContentIndex ? promptsBefore : promptsAfter;
                targetArray.push(prompts[promptIndex]);
            }
        });

        const parts = [];
        if (promptsBefore.length > 0) parts.push(promptsBefore.join('\n\n'));
        if (originalContent.trim() !== '') parts.push(originalContent);
        if (promptsAfter.length > 0) parts.push(promptsAfter.join('\n\n'));
        setInputValue(activeTextarea, parts.join('\n\n'));
        requestAnimationFrame(() => { isUpdatingByScript = false; });
    };

    /* --- UI渲染：拆分为渲染整个UI（标签+列表）和仅渲染列表 --- */
    const renderPromptsForActiveGroup = (preserveChecks = false) => {
        const checkedIds = preserveChecks ? new Set(
            Array.from(promptList.querySelectorAll('input:checked')).map(cb => cb.closest('li').dataset.id)
        ) : new Set();

        const activeGroup = promptGroups[activeGroupIndex];
        const itemOrder = activeGroup.itemOrder;
        const prompts = activeGroup.prompts;

        setSafeHTML(promptList, '');

        itemOrder.forEach(id => {
            const li = document.createElement('li');
            li.dataset.id = id;
            if (id === 'main_content') {
                li.className = 'gph-original-content-item';
                setSafeHTML(li, `<strong>当前主要内容 (在输入框中编辑)</strong><div id="gph-original-content-text">${truncateAndEscapeText(originalContent, 5)}</div>`);
            } else {
                const index = parseInt(id.split('_')[1], 10);
                const promptText = prompts[index];
                li.className = 'gph-mvp-item';
                li.setAttribute('draggable', 'true');
                setSafeHTML(li, `<span class="gph-drag-handle">::</span><input type="checkbox" ${checkedIds.has(id) ? 'checked' : ''}><span class="gph-mvp-item-text" title="${escapeHTML(promptText)}">${escapeHTML(promptText)}</span><button class="gph-delete-btn">&times;</button>`);
            }
            promptList.appendChild(li);
        });
    };

    const renderUI = (preserveChecks = false) => {
        setSafeHTML(tabContainer, '');
        promptGroups.forEach((group, index) => {
            const tab = document.createElement('li');
            tab.className = 'gph-mvp-tab';
            if (index === activeGroupIndex) {
                tab.classList.add('active');
            }
            tab.textContent = group.name;
            tab.dataset.index = index;
            tabContainer.appendChild(tab);
        });

        /* --- 渲染当前激活页的提示词列表 --- */
        renderPromptsForActiveGroup(preserveChecks);
    };

    const addNewPrompt = () => {
        const text = newPromptInput.value.trim();
        if (text) {
            const activeGroup = promptGroups[activeGroupIndex];
            const newIndex = activeGroup.prompts.push(text) - 1;
            activeGroup.itemOrder.push(`prompt_${newIndex}`);
            newPromptInput.value = '';
            renderPromptsForActiveGroup(true);
            updateActiveTextarea();
        }
    };

    const deletePrompt = (idToDelete) => {
        const activeGroup = promptGroups[activeGroupIndex];

        activeGroup.itemOrder = activeGroup.itemOrder.filter(id => id !== idToDelete);

        const newPrompts = [];
        const newOrder = [];
        const oldToNewIndexMap = {};

        activeGroup.itemOrder.forEach(id => {
            if (id === 'main_content') {
                newOrder.push(id);
            } else {
                const oldIndex = parseInt(id.split('_')[1], 10);
                if (oldToNewIndexMap[oldIndex] === undefined) {
                    oldToNewIndexMap[oldIndex] = newPrompts.push(activeGroup.prompts[oldIndex]) - 1;
                }
                newOrder.push(`prompt_${oldToNewIndexMap[oldIndex]}`);
            }
        });

        activeGroup.prompts = newPrompts;
        activeGroup.itemOrder = newOrder;

        renderPromptsForActiveGroup(true);
        updateActiveTextarea();
    };

    const toggleSelectAll = () => {
        const checkboxes = promptList.querySelectorAll('input[type="checkbox"]');
        if (checkboxes.length === 0) return;
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        updateActiveTextarea();
    };

    /* --- 适配函数：复制书签代码时序列化整个 promptGroups --- */
    const copyBookmarkletCode = () => {
        const updatedSource = main.toString().replace(
            /let promptGroups = \[[\s\S]*?\];/,
            `let promptGroups = ${JSON.stringify(promptGroups, null, 4)};`
        );
        navigator.clipboard.writeText(`javascript:(${updatedSource})()`).then(() => {
            showModal({ title: '操作成功', message: '新版书签代码已复制到剪贴板！', type: 'success' });
        }).catch(() => {
            showModal({ title: '操作失败', message: '无法复制到剪贴板。', type: 'error' });
        });
    };

    const header = document.getElementById('gph-mvp-header');
    let isDraggingPanel = false, offsetX, offsetY;
    header.addEventListener('mousedown', (e) => {
        isDraggingPanel = true;
        panel.classList.add('dragging-panel');
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
        document.body.style.cursor = 'move';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDraggingPanel) return;
        panel.style.left = `${e.clientX - offsetX}px`;
        panel.style.top = `${e.clientY - offsetY}px`;
    });
    document.addEventListener('mouseup', () => {
        isDraggingPanel = false;
        panel.classList.remove('dragging-panel');
        document.body.style.cursor = 'default';
    });

    let draggedItem = null;
    promptList.addEventListener('dragstart', (e) => {
        const item = e.target.closest('li[draggable="true"]');
        if (item) {
            draggedItem = item;
            setTimeout(() => item.classList.add('dragging'), 0);
        }
    });
    promptList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const targetItem = e.target.closest('li');
        if (targetItem && targetItem !== draggedItem) {
            const rect = targetItem.getBoundingClientRect();
            promptList.insertBefore(draggedItem, e.clientY > rect.top + rect.height / 2 ? targetItem.nextSibling : targetItem);
        }
    });
    promptList.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
            const activeGroup = promptGroups[activeGroupIndex];
            activeGroup.itemOrder = Array.from(promptList.querySelectorAll('li')).map(li => li.dataset.id);
            renderPromptsForActiveGroup(true);
            updateActiveTextarea();
        }
    });

    panel.addEventListener('click', (e) => {
        const target = e.target;
        if (target.id === 'gph-add-prompt-btn') addNewPrompt();
        else if (target.classList.contains('gph-delete-btn')) {
            showModal({
                title: '请确认', message: '您确定要永久删除这条提示词吗？', type: 'confirm',
                onConfirm: () => deletePrompt(target.closest('li').dataset.id)
            });
        }
        else if (target.id === 'gph-select-all-btn') toggleSelectAll();
        else if (target.id === 'gph-copy-btn') copyBookmarkletCode();
    });

    /* --- 事件监听：增加标签页点击事件 --- */
    tabContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.gph-mvp-tab');
        if (tab && !tab.classList.contains('active')) {
            const newIndex = parseInt(tab.dataset.index, 10);
            activeGroupIndex = newIndex;
            renderUI();
        }
    });

    promptList.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') updateActiveTextarea();
    });

    newPromptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addNewPrompt();
        }
    });

    /* --- 这部分逻辑与UI分组无关，保持不变 --- */
    const syncInputToState = () => {
        if (isUpdatingByScript || !activeTextarea) return;
        const currentValue = getInputValue(activeTextarea);

        if ( originalContent.trim() !== '') {
            promptList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
        }

        const allKnownPrompts = new Set();
        promptGroups.forEach(group => group.prompts.forEach(p => allKnownPrompts.add(p)));

        const userContentBlocks = currentValue.split('\n\n').filter(block => !allKnownPrompts.has(block.trim()));
        const newOriginalContent = userContentBlocks.join('\n\n');

        if (newOriginalContent !== originalContent) {
            originalContent = newOriginalContent;
            const contentDiv = document.getElementById('gph-original-content-text');
            if (contentDiv) setSafeHTML(contentDiv, truncateAndEscapeText(originalContent, 5));
        }
    };

    const ensureTextareaBinding = () => {
        if (activeTextarea && document.body.contains(activeTextarea)) {
            return;
        }

        const newTextarea = document.querySelector(activePlatform.selector);

        if (newTextarea !== activeTextarea) {
            if (activeTextarea) {
                activeTextarea.removeEventListener('input', syncInputToState);
                activeTextarea.removeEventListener('blur', syncInputToState);
            }
            activeTextarea = newTextarea;
            if (activeTextarea) {
                activeTextarea.addEventListener('input', syncInputToState);
                activeTextarea.addEventListener('blur', syncInputToState);
                syncInputToState();
            }
        } else if (!newTextarea) {
            activeTextarea = null;
        }
    };

    /* --- 初始化：为每个分组生成 itemOrder --- */
    promptGroups.forEach(group => {
        group.itemOrder = [];
        group.itemOrder.push('main_content');
        group.prompts.forEach((_, index) => group.itemOrder.push(`prompt_${index}`));
    });

    activeTextarea.addEventListener('input', syncInputToState);
    activeTextarea.addEventListener('blur', syncInputToState);

    setInterval(ensureTextareaBinding, 1000);

    syncInputToState();
    renderUI(); /* --- 初始渲染调用 renderUI --- */
})()