javascript:(function main() {
    const panelId = 'gemini-mvp-helper';
    const styleId = 'gemini-mvp-helper-styles';
    const existingPanel = document.getElementById(panelId);

    /* --- 优化：如果面板已存在，则关闭程序并退出 --- */
    if (existingPanel) {
        const existingStyle = document.getElementById(styleId);
        const intervalId = existingPanel.dataset.intervalId;

        if (intervalId) {
            clearInterval(parseInt(intervalId, 10));
        }
        existingPanel.remove();
        if (existingStyle) {
            existingStyle.remove();
        }
        console.log('✨ AI 快捷提示词助手已关闭。');
        return;
    }

    /* --- 平台配置中心 --- */
    const AI_PLATFORMS = [
        { name: 'AIstudio', hostname: 'aistudio.google.com', selector: 'ms-autosize-textarea textarea' },
        { name: 'Gemini', hostname: 'gemini.google.com', selector: 'rich-textarea .ql-editor[contenteditable="true"]' },
        { name: 'ChatGPT', hostname: 'chatgpt.com', selector: '#prompt-textarea' },
        { name: 'DeepSeek', hostname: 'chat.deepseek.com', selector: 'textarea#chat-input' },
        /* --- 其它未适配
        { name: 'Grok', hostname: 'grok.com', selector: 'textarea' },
        { name: 'Claude', hostname: 'claude.ai', selector: 'div[contenteditable="true"][aria-label*="Send a message"]' },
        { name: '通义千问', hostname: 'tongyi.aliyun.com', selector: 'textarea[placeholder*="通义千问"]' },
        { name: '文心一言', hostname: 'yiyan.baidu.com', selector: '.w-full.w-full textarea' },
        { name: '讯飞星火', hostname: 'xinghuo.xfyun.cn', selector: 'textarea[placeholder*="内容"]' },
        { name: '百川智能', hostname: 'baichuan-ai.com', selector: 'textarea[placeholder*="输入"]' },
        { name: 'ChatGLM', hostname: 'chatglm.cn', selector: '#chat-input' }
        --- */
    ];

    /* --- 平台检测与输入框获取 --- */
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

    /* --- 状态管理 (单一数据源) --- */
    let prompts = [
        "输出文档",
        "给出技术方案，本次不输出代码",
        "进行分类",
        "要求内容完整",
        "要求商业级别",
        "因为内容过多，分多次输出，每次1000行内容，同一个文件放在同一次回复，首次说明分几次",
        "从aa,bb的角度进行入手，还可以从什么维度进行入手，要求更多的维度",
        "注释全部使用使用 /* --- xxx--- */"
    ];
    let originalContent = '';
    let itemOrder = [];
    /* --- 新增状态标志，用于防止同步反馈循环 --- */
    let isUpdatingByScript = false;


    /* --- 安全地设置 HTML (Trusted Types) --- */
    let policy;
    try {
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
            policy = window.trustedTypes.createPolicy('ai-prompt-helper-policy-v17', { createHTML: (string) => string });
        }
    } catch (e) { console.error('TrustedTypes policy creation failed', e); }
    const setSafeHTML = (element, html) => {
        if (policy) {
            element.innerHTML = policy.createHTML(html);
        } else {
            element.innerHTML = html;
        }
    };

    /* --- 新增：安全转义 HTML 辅助函数 --- */
    const escapeHTML = (str) => {
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    };

    /* --- 新增：截断并转义文本的辅助函数 --- */
    const truncateAndEscapeText = (text, maxLines = 5) => {
        if (text.trim() === '') {
            return '...';
        }
        const lines = text.split('\n');
        let truncatedText;
        if (lines.length > maxLines) {
            truncatedText = lines.slice(0, maxLines).join('\n') + '\n...';
        } else {
            truncatedText = text;
        }
        return escapeHTML(truncatedText);
    };


    /* --- 新增：美观的模态框组件 --- */
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
                <div id="gph-modal-body">
                    <p>${message}</p>
                </div>
                <div id="gph-modal-footer">
                    ${isConfirm ? `<button id="gph-modal-cancel" class="gph-action-btn gph-secondary-btn">取消</button>` : ''}
                    <button id="gph-modal-ok" class="gph-action-btn">${isConfirm ? '确认' : '好的'}</button>
                </div>
            </div>
        `;

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

        document.getElementById('gph-modal-ok').addEventListener('click', () => {
            closeModal();
            if (onConfirm) onConfirm();
        });

        document.getElementById('gph-modal-close').addEventListener('click', () => {
            closeModal();
            if (onCancel) onCancel();
        });

        if (isConfirm) {
            document.getElementById('gph-modal-cancel').addEventListener('click', () => {
                closeModal();
                if (onCancel) onCancel();
            });
        }

        document.addEventListener('keydown', keydownHandler);
        setTimeout(() => document.getElementById('gph-modal-ok').focus(), 50);
    };

    /* --- 检查并注入 --- */
    if (!activeTextarea) {
        /* --- 创建样式表以显示模态框，因为此时主样式表可能还未注入 --- */
        const modalFallbackStyle = document.createElement('style');
        modalFallbackStyle.innerText = `
            .gph-modal-overlay { /* --- Fallback styles --- */ }
        `;
        document.head.appendChild(modalFallbackStyle);
        showModal({
            title: '加载失败',
            message: '在当前页面未找到支持的AI输入框。脚本无法运行。<br>支持平台: Gemini, ChatGPT, DeepSeek等。',
            type: 'error'
        });
        /* --- 确保模态框样式在显示后被注入 --- */
        const tempStyleSheet = document.createElement("style");
        tempStyleSheet.innerText = `
            .gph-modal-overlay {
                --bg-primary: #1e1e1e; --bg-secondary: #2a2a2a; --text-primary: #f0f0f0; --text-button: #121212;
                --text-handle: #888; --border-primary: #444; --accent-primary: #bb86fc;
                --accent-secondary: #03dac6; --accent-delete: #ff5555; --accent-success: #4caf50;
                --shadow-color: rgba(0,0,0,0.5); --overlay-bg: rgba(0,0,0,0.6);
            }
            @media (prefers-color-scheme: light) {
                .gph-modal-overlay {
                    --bg-primary: #ffffff; --bg-secondary: #f1f3f4; --text-primary: #202124; --text-button: #ffffff;
                    --text-handle: #5f6368; --border-primary: #dadce0; --accent-primary: #1a73e8;
                    --accent-secondary: #4285f4; --accent-delete: #d93025; --accent-success: #2e7d32;
                    --shadow-color: rgba(0,0,0,0.2); --overlay-bg: rgba(32,33,36,0.5);
                }
            }
            @keyframes gph-fade-in { from { opacity: 0; } to { opacity: 1; } }
            @keyframes gph-slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            .gph-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: var(--overlay-bg); z-index: 10000;
                display: flex; align-items: center; justify-content: center;
                animation: gph-fade-in 0.2s ease-out; font-family: sans-serif;
            }
            #gph-modal-container {
                background: var(--bg-primary); color: var(--text-primary);
                border-radius: 8px; box-shadow: 0 5px 20px var(--shadow-color);
                width: 90%; max-width: 400px; animation: gph-slide-up 0.3s ease-out;
                border-top: 4px solid var(--accent-delete);
            }
            #gph-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-primary); }
            #gph-modal-title { margin: 0; font-size: 16px; font-weight: bold; color: var(--accent-delete); }
            #gph-modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-handle); }
            #gph-modal-body { padding: 16px; line-height: 1.6; } #gph-modal-body p { margin: 0; }
            #gph-modal-footer { padding: 12px 16px; background: var(--bg-secondary); display: flex; justify-content: flex-end; gap: 10px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; }
            .gph-action-btn { background: var(--accent-primary); color: var(--text-button); border: none; border-radius: 4px; padding: 8px 20px; cursor: pointer; font-weight: bold; }
        `;
        document.head.appendChild(tempStyleSheet);
        return;
    }

    /* --- 样式定义 --- */
    const styles = `
    /* --- 变量定义 --- */
    #gemini-mvp-helper, .gph-modal-overlay {
        --bg-primary: #1e1e1e; --bg-secondary: #2a2a2a; --bg-header: #333; --bg-input: #333;
        --bg-dragging: #555; --text-primary: #f0f0f0; --text-title: #bb86fc; --text-button: #121212;
        --text-handle: #888; --border-primary: #444; --border-input: #555; --accent-primary: #bb86fc;
        --accent-secondary: #03dac6; --accent-delete: #ff5555; --accent-delete-hover: #ff8888;
        --accent-success: #4caf50; --shadow-color: rgba(0,0,0,0.5); --original-content-bg: #2c2c2c; --original-content-border: var(--accent-primary);
        --overlay-bg: rgba(0,0,0,0.6);
    }
    @media (prefers-color-scheme: light) {
        #gemini-mvp-helper, .gph-modal-overlay {
            --bg-primary: #ffffff; --bg-secondary: #f1f3f4; --bg-header: #e8eaed; --bg-input: #ffffff;
            --bg-dragging: #d0e3ff; --text-primary: #202124; --text-title: #1967d2; --text-button: #ffffff;
            --text-handle: #5f6368; --border-primary: #dadce0; --border-input: #a0a0a0; --accent-primary: #1a73e8;
            --accent-secondary: #4285f4; --accent-delete: #d93025; --accent-delete-hover: #e57373;
            --accent-success: #2e7d32; --shadow-color: rgba(0,0,0,0.2); --original-content-bg: #e8f0fe; --original-content-border: var(--accent-primary);
            --overlay-bg: rgba(32,33,36,0.5);
        }
    }
    /* --- 通用样式 --- */
    #gemini-mvp-helper {
        position: fixed; bottom: 20px; right: 20px; width: 350px; background: var(--bg-primary); border: 1px solid var(--border-primary);
        border-radius: 8px; box-shadow: 0 4px 15px var(--shadow-color); z-index: 9999; color: var(--text-primary);
        font-family: sans-serif; display: flex; flex-direction: column; overflow: hidden;
    }
    #gph-mvp-header { padding: 10px 15px; background: var(--bg-header); cursor: move; user-select: none; }
    #gph-mvp-title { margin: 0; font-size: 16px; color: var(--text-title); }
    #gph-mvp-body { padding: 15px; overflow-y: auto; }
    #gph-mvp-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .gph-mvp-item, .gph-original-content-item {
        display: flex; align-items: flex-start;
        background: var(--bg-secondary); padding: 8px; border-radius: 4px; border: 1px solid var(--border-primary);
    }
    .gph-mvp-item.dragging { opacity: 0.7; background: var(--bg-dragging); }
    .gph-original-content-item {
        background-color: var(--original-content-bg); border: 1px dashed var(--original-content-border);
        flex-direction: column;
    }
    .gph-original-content-item strong { font-style: normal; }
    #gph-original-content-text { font-style: italic; word-wrap: break-word; margin-top: 5px; width: 100%; white-space: pre-wrap; }
    .gph-drag-handle { cursor: grab; margin-right: 10px; color: var(--text-handle); user-select: none; padding-top: 2px; }
    .gph-mvp-item input[type="checkbox"] { margin-right: 10px; margin-top: 4px; flex-shrink: 0; }
    .gph-mvp-item-text { flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-top: 2px; }
    .gph-delete-btn { background: none; border: none; color: var(--accent-delete); cursor: pointer; font-size: 18px; padding: 0 5px; flex-shrink: 0; }
    .gph-delete-btn:hover { color: var(--accent-delete-hover); }
    #gph-mvp-add-area { padding: 15px; border-top: 1px solid var(--border-primary); background: var(--bg-secondary); display: flex; gap: 10px; }
    #gph-new-prompt-input { flex-grow: 1; background: var(--bg-input); border: 1px solid var(--border-input); color: var(--text-primary); border-radius: 4px; padding: 8px; }
    #gph-mvp-actions { padding: 15px; border-top: 1px solid var(--border-primary); display: flex; justify-content: space-between; gap: 10px; }
    .gph-action-btn { background: var(--accent-primary); color: var(--text-button); border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; font-weight: bold; flex-grow: 1; }
    .gph-action-btn:hover { opacity: 0.85; }
    .gph-secondary-btn { background: var(--accent-secondary); }

    /* --- 模态框样式 --- */
    @keyframes gph-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes gph-fade-out { from { opacity: 1; } to { opacity: 0; } }
    @keyframes gph-slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

    .gph-modal-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: var(--overlay-bg);
        z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        animation: gph-fade-in 0.2s ease-out;
    }
    .gph-modal-overlay.fade-out { animation: gph-fade-out 0.2s ease-in forwards; }
    
    #gph-modal-container {
        background: var(--bg-primary); color: var(--text-primary);
        border-radius: 8px; box-shadow: 0 5px 20px var(--shadow-color);
        width: 90%; max-width: 400px;
        animation: gph-slide-up 0.3s ease-out;
        border-top: 4px solid var(--accent-primary);
    }
    #gph-modal-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 16px; border-bottom: 1px solid var(--border-primary);
    }
    #gph-modal-header.success { border-top-color: var(--accent-success); }
    #gph-modal-header.error { border-top-color: var(--accent-delete); }
    #gph-modal-header.confirm { border-top-color: var(--accent-secondary); }
    
    #gph-modal-title { margin: 0; font-size: 16px; font-weight: bold; color: var(--text-primary); }
    #gph-modal-header.success #gph-modal-title { color: var(--accent-success); }
    #gph-modal-header.error #gph-modal-title { color: var(--accent-delete); }

    #gph-modal-close {
        background: none; border: none; font-size: 24px; cursor: pointer;
        color: var(--text-handle); line-height: 1; padding: 0 4px;
    }
    #gph-modal-close:hover { color: var(--text-primary); }

    #gph-modal-body { padding: 16px; line-height: 1.6; }
    #gph-modal-body p { margin: 0; }

    #gph-modal-footer {
        padding: 12px 16px; background: var(--bg-secondary);
        display: flex; justify-content: flex-end; gap: 10px;
        border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;
    }
    #gph-modal-footer .gph-action-btn { flex-grow: 0; padding: 8px 20px; }
    `;

    /* --- HTML 结构 --- */
    const panelHTML = `
        <div id="gph-mvp-header">
            <h3 id="gph-mvp-title">快捷提示词</h3>
        </div>
        <div id="gph-mvp-body">
            <ul id="gph-mvp-list"></ul>
        </div>
        <div id="gph-mvp-add-area">
            <input type="text" id="gph-new-prompt-input" placeholder="在此添加新提示词...">
            <button id="gph-add-prompt-btn" class="gph-action-btn">+</button>
        </div>
        <div id="gph-mvp-actions">
             <button id="gph-select-all-btn" class="gph-action-btn gph-secondary-btn">全选/反选</button>
             <button id="gph-copy-btn" class="gph-action-btn">复制代码</button>
        </div>
    `;

    const styleSheet = document.createElement("style");
    styleSheet.id = styleId;
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const panel = document.createElement('div');
    panel.id = panelId;
    setSafeHTML(panel, panelHTML);
    document.body.appendChild(panel);

    const promptList = document.getElementById('gph-mvp-list');
    const newPromptInput = document.getElementById('gph-new-prompt-input');
    const panelTitle = document.getElementById('gph-mvp-title');
    panelTitle.textContent = `快捷提示词 (${activePlatform.name})`;

    /* --- 辅助函数：根据元素类型设置/获取值 --- */
    const getInputValue = (element) => {
        /* --- 针对 ChatGPT/Gemini 的 contenteditable div 进行特殊处理 --- */
        if (activePlatform && (activePlatform.name === 'ChatGPT' || activePlatform.name === 'Gemini') && element.isContentEditable) {
            const paragraphs = Array.from(element.querySelectorAll('p'));
            return paragraphs.map(p => p.textContent).join('\n');
        }
        /* --- 对 textarea 和其他默认情况使用 .value 或 .textContent --- */
        return element.value || element.textContent;
    };

    const setInputValue = (element, value) => {
        /* --- 针对 ChatGPT/Gemini 的 contenteditable div 进行特殊处理 --- */
        if (activePlatform && (activePlatform.name === 'ChatGPT' || activePlatform.name === 'Gemini') && element.isContentEditable) {
            const htmlValue = value.split('\n').map(line => {
                if (line.trim() === '') return '<p><br></p>';
                return `<p>${escapeHTML(line)}</p>`;
            }).join('');
            setSafeHTML(element, htmlValue);
        } else {
            /* --- 标准 textarea 直接赋值 --- */
            element.value = value;
        }
        /* --- 触发 input 事件，让 AI 平台知道内容已更改 --- */
        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    };

    /* --- 核心功能: 更新 AI 输入框 --- */
    const updateActiveTextarea = () => {
        isUpdatingByScript = true;

        const checkedIds = new Set(
            Array.from(document.querySelectorAll('#gph-mvp-list input[type="checkbox"]:checked'))
                .map(cb => cb.closest('li').dataset.id)
        );
        const mainContentIndex = itemOrder.indexOf('main_content');
        const promptsBefore = [];
        const promptsAfter = [];

        itemOrder.forEach((id, index) => {
            if (id.startsWith('prompt_') && checkedIds.has(id)) {
                const promptIndex = parseInt(id.split('_')[1], 10);
                if (index < mainContentIndex) {
                    promptsBefore.push(prompts[promptIndex]);
                } else {
                    promptsAfter.push(prompts[promptIndex]);
                }
            }
        });

        const parts = [];
        if (promptsBefore.length > 0) parts.push(promptsBefore.join('\n\n'));
        if (originalContent.trim() !== '') parts.push(originalContent);
        if (promptsAfter.length > 0) parts.push(promptsAfter.join('\n\n'));

        setInputValue(activeTextarea, parts.join('\n\n'));

        requestAnimationFrame(() => {
            isUpdatingByScript = false;
        });
    };

    /* --- 核心功能: 渲染提示词列表 --- */
    const renderPrompts = (preserveChecks = false) => {
        let checkedIds = new Set();
        if (preserveChecks) {
            document.querySelectorAll('#gph-mvp-list input[type="checkbox"]:checked').forEach(cb => {
                checkedIds.add(cb.closest('li').dataset.id);
            });
        }
        while (promptList.firstChild) {
            promptList.removeChild(promptList.firstChild);
        }

        itemOrder.forEach(id => {
            const li = document.createElement('li');
            li.dataset.id = id;
            if (id === 'main_content') {
                li.className = 'gph-original-content-item';
                li.setAttribute('draggable', 'false');
                const contentHTML = `
                    <strong>当前主要内容 (在输入框中编辑)</strong>
                    <div id="gph-original-content-text">${truncateAndEscapeText(originalContent, 5)}</div>
                `;
                setSafeHTML(li, contentHTML);
            } else {
                const index = parseInt(id.split('_')[1], 10);
                const promptText = prompts[index];
                li.className = 'gph-mvp-item';
                li.setAttribute('draggable', 'true');
                const itemHTML = `
                    <span class="gph-drag-handle">::</span>
                    <input type="checkbox" ${checkedIds.has(id) ? 'checked' : ''}>
                    <span class="gph-mvp-item-text" title="${escapeHTML(promptText)}">${escapeHTML(promptText)}</span>
                    <button class="gph-delete-btn">&times;</button>
                `;
                setSafeHTML(li, itemHTML);
            }
            promptList.appendChild(li);
        });
    };

    /* --- 功能: 添加新提示词 --- */
    const addNewPrompt = () => {
        const text = newPromptInput.value.trim();
        if (text) {
            const newIndex = prompts.push(text) - 1;
            itemOrder.push(`prompt_${newIndex}`);
            newPromptInput.value = '';
            renderPrompts(true);
            updateActiveTextarea();
        }
    };

    /* --- 功能: 删除提示词 --- */
    const deletePrompt = (idToDelete) => {
        itemOrder = itemOrder.filter(id => id !== idToDelete);
        const newPrompts = [];
        const newOrder = [];
        const oldToNewIndexMap = {};

        itemOrder.forEach(id => {
            if (id === 'main_content') {
                newOrder.push(id);
            } else {
                const oldIndex = parseInt(id.split('_')[1], 10);
                if (oldToNewIndexMap[oldIndex] === undefined) {
                    oldToNewIndexMap[oldIndex] = newPrompts.push(prompts[oldIndex]) - 1;
                }
                newOrder.push(`prompt_${oldToNewIndexMap[oldIndex]}`);
            }
        });

        prompts = newPrompts;
        itemOrder = newOrder;

        renderPrompts(true);
        updateActiveTextarea();
    };

    /* --- 功能: 全选/反选 --- */
    const toggleSelectAll = () => {
        const checkboxes = document.querySelectorAll('#gph-mvp-list input[type="checkbox"]');
        if (checkboxes.length === 0) return;
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        updateActiveTextarea();
    };

    /* --- 功能: 复制代码到剪贴板 --- */
    const copyBookmarkletCode = () => {
        const promptsString = JSON.stringify(prompts, null, 4);
        const scriptSource = main.toString();
        const updatedSource = scriptSource.replace(
            /let prompts = \[[\s\S]*?\];/,
            `let prompts = ${promptsString};`
        );
        const bookmarkletCode = `javascript:(${updatedSource})()`;
        navigator.clipboard.writeText(bookmarkletCode).then(() => {
            showModal({
                title: '操作成功',
                message: '包含当前提示词列表的新版书签代码已复制到剪贴板！',
                type: 'success'
            });
        }).catch(err => {
            console.error('无法复制到剪贴板:', err);
            showModal({
                title: '操作失败',
                message: '无法复制到剪贴板。请检查浏览器设置或权限。',
                type: 'error'
            });
        });
    };

    /* --- 事件监听器: 面板拖动 --- */
    const header = document.getElementById('gph-mvp-header');
    let isDraggingPanel = false, offsetX, offsetY;
    header.addEventListener('mousedown', (e) => {
        isDraggingPanel = true;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
        panel.style.userSelect = 'none';
        document.body.style.cursor = 'move';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDraggingPanel) return;
        panel.style.left = `${e.clientX - offsetX}px`;
        panel.style.top = `${e.clientY - offsetY}px`;
    });
    document.addEventListener('mouseup', () => {
        isDraggingPanel = false;
        panel.style.userSelect = 'auto';
        document.body.style.cursor = 'default';
    });


    /* --- 事件监听器: 提示词拖拽排序 --- */
    let draggedItem = null;
    promptList.addEventListener('dragstart', (e) => {
        const item = e.target.closest('li[draggable="true"]');
        if (item) {
            draggedItem = item;
            setTimeout(() => item.classList.add('dragging'), 0);
        }
    });
    promptList.addEventListener('dragend', () => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
        }
    });
    promptList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const targetItem = e.target.closest('li');
        if (targetItem && targetItem !== draggedItem) {
            const rect = targetItem.getBoundingClientRect();
            const after = e.clientY > rect.top + rect.height / 2;
            promptList.insertBefore(draggedItem, after ? targetItem.nextSibling : targetItem);
        }
    });
    promptList.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedItem) {
            itemOrder = Array.from(promptList.querySelectorAll('li')).map(li => li.dataset.id);
            renderPrompts(true);
            updateActiveTextarea();
        }
    });

    /* --- 事件监听器: 面板内交互 --- */
    panel.addEventListener('click', (e) => {
        const target = e.target;
        if (target.id === 'gph-add-prompt-btn') {
            addNewPrompt();
        } else if (target.classList.contains('gph-delete-btn')) {
            showModal({
                title: '请确认',
                message: '您确定要永久删除这条提示词吗？此操作无法撤销。',
                type: 'confirm',
                onConfirm: () => {
                    deletePrompt(target.closest('li').dataset.id);
                }
            });
        } else if (target.id === 'gph-select-all-btn') {
            toggleSelectAll();
        } else if (target.id === 'gph-copy-btn') {
            copyBookmarkletCode();
        }
    });
    promptList.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            updateActiveTextarea();
        }
    });
    newPromptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addNewPrompt();
        }
    });

    /* --- 新增：核心同步函数，从输入框更新到状态 --- */
    const syncInputToState = () => {
        if (isUpdatingByScript) {
            return;
        }
        const currentValue = getInputValue(activeTextarea);
        const allKnownPrompts = new Set(prompts);
        const blocks = currentValue.split('\n\n');
        const userContentBlocks = blocks.filter(block => !allKnownPrompts.has(block.trim()));
        const newOriginalContent = userContentBlocks.join('\n\n');

        if (newOriginalContent !== originalContent) {
            originalContent = newOriginalContent;
            const originalContentTextDiv = document.getElementById('gph-original-content-text');
            if (originalContentTextDiv) {
                const displayHTML = truncateAndEscapeText(originalContent, 5);
                setSafeHTML(originalContentTextDiv, displayHTML);
            }
        }
    };

    /* --- 事件监听器: 同步AI输入框的用户手动修改 --- */
    activeTextarea.addEventListener('input', syncInputToState);
    activeTextarea.addEventListener('blur', syncInputToState); /* --- 新增: 失焦时强制同步 --- */


    /* --- 备用监听器(兜底)，用于监控外部清空操作 --- */
    const cleanupInterval = setInterval(() => {
        if (getInputValue(activeTextarea).trim() === '' && originalContent.trim() !== '') {
            console.log('AI Helper: 检测到外部清空操作，重置内容状态。');
            originalContent = '';
            const originalContentTextDiv = document.getElementById('gph-original-content-text');
            if (originalContentTextDiv) {
                originalContentTextDiv.textContent = '...';
            }
        }
    }, 1000);

    /* --- 将 interval ID 附加到面板上，以便将来清除 --- */
    panel.dataset.intervalId = cleanupInterval;

    /* --- 初始设置 --- */
    syncInputToState(); /* --- 优化: 直接调用同步函数进行初始化 --- */
    itemOrder.push('main_content');
    prompts.forEach((_, index) => itemOrder.push(`prompt_${index}`));
    renderPrompts();
    console.log(`✨ AI 快捷提示词助手 (v17-sync-fix) 在 ${activePlatform.name} 上加载成功！`);
})()