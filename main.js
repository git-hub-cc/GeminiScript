(function() {
    if (document.getElementById('gemini-mvp-helper')) return;

    // Trusted Types Policy - 保持不变，以备将来使用
    let policy;
    try {
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
            policy = window.trustedTypes.createPolicy('gemini-prompt-helper-policy-v2', {
                createHTML: (string) => string
            });
        }
    } catch (e) {
        console.warn('Trusted Types policy "gemini-prompt-helper-policy-v2" 可能已存在。');
    }
    const setSafeHTML = (element, html) => {
        if (policy) {
            element.innerHTML = policy.createHTML(html);
        } else {
            element.innerHTML = html;
        }
    };

    const styles = `
        #gemini-mvp-helper {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 300px;
            background: #1e1e1e;
            border: 1px solid #444;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 9999;
            color: #f0f0f0;
            font-family: sans-serif;
            padding: 15px;
        }
        #gph-mvp-title {
            margin: 0 0 10px 0;
            font-size: 16px;
            color: #bb86fc;
        }
        #gph-mvp-list {
            list-style: none;
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .gph-mvp-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #333;
            padding: 8px;
            border-radius: 4px;
        }
        .gph-mvp-item span {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex-grow: 1;
        }
        .gph-mvp-item button {
            background: #bb86fc;
            color: #121212;
            border: none;
            border-radius: 4px;
            padding: 4px 10px;
            cursor: pointer;
            margin-left: 10px;
            font-weight: bold;
        }
        .gph-mvp-item button:hover {
            opacity: 0.8;
        }
    `;

    const panelHTML = `
        <h3 id="gph-mvp-title">快捷提示词</h3>
        <ul id="gph-mvp-list"></ul>
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const panel = document.createElement('div');
    panel.id = 'gemini-mvp-helper';
    setSafeHTML(panel, panelHTML);
    document.body.appendChild(panel);

    const prompts = [
        "请帮我把以下内容翻译成英文：",
        "作为一名资深的产品经理，请评估这个想法：",
        "用通俗易懂的语言解释一下这个概念：",
        "为以下主题生成一个简短的社交媒体帖子：",
        "检查以下代码中的错误并提出修改建议：",
    ];

    const promptList = document.getElementById('gph-mvp-list');
    prompts.forEach(promptText => {
        const li = document.createElement('li');
        li.className = 'gph-mvp-item';
        const listItemHTML = `
            <span title="${promptText}">${promptText}</span>
            <button data-prompt="${promptText}">使用</button>
        `;
        setSafeHTML(li, listItemHTML);
        promptList.appendChild(li);
    });

    // --- 主要修改在这里 ---
    panel.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.prompt) {
            const textToUse = e.target.dataset.prompt;

            // 使用新的选择器找到 textarea
            const textarea = document.querySelector('ms-autosize-textarea textarea');

            if (textarea) {
                // 直接设置 .value 属性
                textarea.value = textToUse;
                // 触发 input 事件，让 Gemini 的前端框架感知到变化
                textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                // 聚焦到输入框
                textarea.focus();
            } else {
                // 更新后的错误提示
                alert('未找到 Gemini 输入框。请检查 Gemini 页面结构是否已更新。');
            }
        }
    });

    console.log('✨ Gemini 快捷提示词助手 (v2) 加载成功！');
})();