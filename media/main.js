// @ts-check

(function () {
    const vscode = acquireVsCodeApi();

    // DOM 元素
    const messagesEl = document.getElementById('messages');
    const welcomeEl = document.getElementById('welcome');
    const thinkingEl = document.getElementById('thinking');
    const inputEl = document.getElementById('userInput');
    const sendBtnEl = document.getElementById('sendBtn');
    const clearBtnEl = document.getElementById('clearBtn');

    // 聚焦输入框
    function focusInput() {
        if (inputEl) {
            inputEl.focus();
        }
    }

    // 发送消息
    function doSend() {
        const text = inputEl.value.trim();
        if (!text) return;

        welcomeEl.style.display = 'none';
        appendMessage(text, 'user');
        vscode.postMessage({ command: 'sendMessage', text: text });
        inputEl.value = '';
        inputEl.style.height = 'auto';
        focusInput();
    }

    // 清空对话
    function doClear() {
        messagesEl.innerHTML = '';
        messagesEl.appendChild(welcomeEl);
        welcomeEl.style.display = '';
        vscode.postMessage({ command: 'clearChat' });
    }

    // 添加消息
    function appendMessage(text, role) {
        const div = document.createElement('div');
        div.className = 'msg ' + role;

        const names = { user: '你', bot: 'AI', error: '错误', system: '系统' };
        const icons = { user: '👤', bot: '🤖', error: '❌', system: 'ℹ️' };

        const header = document.createElement('div');
        header.className = 'msg-header';

        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.textContent = icons[role] || '💬';

        const name = document.createElement('span');
        name.className = 'msg-name';
        name.textContent = names[role] || role;

        header.appendChild(avatar);
        header.appendChild(name);

        const body = document.createElement('div');
        body.className = 'msg-body';
        body.innerHTML = renderMarkdown(text);

        div.appendChild(header);
        div.appendChild(body);
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        // 给代码块添加复制按钮
        div.querySelectorAll('pre').forEach(function(pre) {
            const code = pre.querySelector('code');
            if (!code) return;

            const langMatch = code.className.match(/language-(\w+)/);
            const lang = langMatch ? langMatch[1] : 'code';

            const bar = document.createElement('div');
            bar.className = 'code-bar';

            const langSpan = document.createElement('span');
            langSpan.className = 'code-lang';
            langSpan.textContent = lang;

            const copyBtn = document.createElement('button');
            copyBtn.className = 'code-copy';
            copyBtn.textContent = '复制';
            copyBtn.addEventListener('click', function() {
                vscode.postMessage({ command: 'copyCode', code: code.textContent });
                copyBtn.textContent = '已复制!';
                setTimeout(function() { copyBtn.textContent = '复制'; }, 2000);
            });

            bar.appendChild(langSpan);
            bar.appendChild(copyBtn);
            pre.insertBefore(bar, pre.firstChild);
        });
    }

    // 渲染 Markdown
    function renderMarkdown(text) {
        let html = text;

        // 代码块
        html = html.replace(/\`\`\`(\w*)\n([\s\S]*?)\`\`\`/g, function(match, lang, code) {
            return '<pre><code class="language-' + (lang || 'text') + '">' + escapeHtml(code.trim()) + '</code></pre>';
        });

        // 行内代码
        html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

        // 标题
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // 粗体斜体
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // 链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

        // 列表
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');

        // 引用
        html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

        // 分割线
        html = html.replace(/^---$/gm, '<hr>');

        // 换行
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');

        return '<p>' + html + '</p>';
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // 事件绑定
    sendBtnEl.addEventListener('click', function(e) {
        e.preventDefault();
        doSend();
    });

    inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            doSend();
        }
    });

    inputEl.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    clearBtnEl.addEventListener('click', function(e) {
        e.preventDefault();
        doClear();
    });

    document.querySelectorAll('.quick-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const prompt = this.getAttribute('data-prompt');
            if (prompt) {
                inputEl.value = prompt;
                focusInput();
            }
        });
    });

    messagesEl.addEventListener('click', function(e) {
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
            focusInput();
        }
    });

    // 监听扩展消息
    window.addEventListener('message', function(event) {
        const msg = event.data;
        switch (msg.command) {
            case 'receiveMessage':
                appendMessage(msg.text, msg.role);
                break;
            case 'startThinking':
                thinkingEl.classList.add('show');
                sendBtnEl.disabled = true;
                break;
            case 'stopThinking':
                thinkingEl.classList.remove('show');
                sendBtnEl.disabled = false;
                focusInput();
                break;
            case 'clearChat':
                messagesEl.innerHTML = '';
                messagesEl.appendChild(welcomeEl);
                welcomeEl.style.display = '';
                break;
            case 'focusInput':
                focusInput();
                break;
        }
    });

    // 初始聚焦
    focusInput();
})();
