### 特有问题
1. Chrome 等现代浏览器在开启 Content Security Policy (CSP) 并启用了 require-trusted-types-for 'script' 时，会要求页面中涉及 innerHTML / document.write / dangerouslySetInnerHTML 等操作的内容，必须是 TrustedHTML 对象，不能直接传普通字符串
2. 