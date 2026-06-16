// @ts-check
(function () {
    const vscode = acquireVsCodeApi();

    // DOM
    const messagesEl = document.getElementById('messages');
    const welcomeEl = document.getElementById('welcome');
    const thinkingEl = document.getElementById('thinking');
    const inputEl = document.getElementById('userInput');
    const sendBtnEl = document.getElementById('sendBtn');
    const clearBtnEl = document.getElementById('clearBtn');
    const settingsBtnEl = document.getElementById('settingsBtn');

    let currentMode = 'ask';

    // ═══════════════════════════════════════
    // Mode Switcher
    // ═══════════════════════════════════════

    document.querySelectorAll('.mode-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var mode = this.getAttribute('data-mode');
            if (mode && mode !== currentMode) {
                currentMode = mode;
                document.querySelectorAll('.mode-btn').forEach(function(b) {
                    b.classList.remove('active');
                });
                this.classList.add('active');
                vscode.postMessage({ command: 'setMode', mode: mode });

                // 更新 placeholder
                var placeholders = {
                    ask: 'Ask anything...',
                    plan: 'Describe your task...',
                    agent: 'Tell me what to build...'
                };
                inputEl.placeholder = placeholders[mode] || 'Ask anything...';
                focusInput();
            }
        });
    });

    // ═══════════════════════════════════════
    // Send
    // ═══════════════════════════════════════

    function doSend() {
        var text = inputEl.value.trim();
        if (!text) return;

        welcomeEl.style.display = 'none';
        appendMessage(text, 'user');
        vscode.postMessage({ command: 'sendMessage', text: text });

        requestAnimationFrame(function() {
            inputEl.value = '';
            inputEl.style.height = 'auto';
            focusInput();
        });
    }

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

    // ═══════════════════════════════════════
    // Clear & Settings
    // ═══════════════════════════════════════

    clearBtnEl.addEventListener('click', function(e) {
        e.preventDefault();
        messagesEl.innerHTML = '';
        messagesEl.appendChild(welcomeEl);
        welcomeEl.style.display = '';
        vscode.postMessage({ command: 'clearChat' });
        focusInput();
    });

    settingsBtnEl.addEventListener('click', function(e) {
        e.preventDefault();
        vscode.postMessage({ command: 'openSettings' });
    });

    // ═══════════════════════════════════════
    // Quick Actions
    // ═══════════════════════════════════════

    document.querySelectorAll('.quick-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var prompt = this.getAttribute('data-prompt');
            if (prompt) {
                inputEl.value = prompt;
                focusInput();
            }
        });
    });

    // ═══════════════════════════════════════
    // Message Rendering
    // ═══════════════════════════════════════

    function appendMessage(text, role) {
        var div = document.createElement('div');
        div.className = 'msg ' + role;

        var header = document.createElement('div');
        header.className = 'msg-header';

        var roleLabel = document.createElement('span');
        roleLabel.className = 'msg-role';
        var roleNames = { user: 'You', assistant: 'AI', error: 'Error', system: 'System', tool: 'Tool' };
        roleLabel.textContent = roleNames[role] || role;

        header.appendChild(roleLabel);

        var body = document.createElement('div');
        body.className = 'msg-body';
        body.innerHTML = renderMarkdown(text);

        div.appendChild(header);
        div.appendChild(body);
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        // 给代码块添加操作栏
        addCodeActions(div);
    }

    function addCodeActions(container) {
        container.querySelectorAll('pre').forEach(function(pre) {
            var code = pre.querySelector('code');
            if (!code) return;

            var langMatch = code.className.match(/language-(\w+)/);
            var lang = langMatch ? langMatch[1] : 'code';

            var bar = document.createElement('div');
            bar.className = 'code-bar';

            var langSpan = document.createElement('span');
            langSpan.className = 'code-lang';
            langSpan.textContent = lang;

            var actions = document.createElement('div');
            actions.className = 'code-actions';

            var copyBtn = document.createElement('button');
            copyBtn.className = 'code-action-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.addEventListener('click', function() {
                vscode.postMessage({ command: 'copyCode', code: code.textContent });
                copyBtn.textContent = 'Copied';
                setTimeout(function() { copyBtn.textContent = 'Copy'; }, 1500);
            });

            var insertBtn = document.createElement('button');
            insertBtn.className = 'code-action-btn';
            insertBtn.textContent = 'Insert';
            insertBtn.addEventListener('click', function() {
                vscode.postMessage({ command: 'insertCode', code: code.textContent });
                insertBtn.textContent = 'Done';
                setTimeout(function() { insertBtn.textContent = 'Insert'; }, 1500);
            });

            actions.appendChild(copyBtn);
            actions.appendChild(insertBtn);

            bar.appendChild(langSpan);
            bar.appendChild(actions);
            pre.insertBefore(bar, pre.firstChild);
        });
    }

    // ═══════════════════════════════════════
    // Diff Display
    // ═══════════════════════════════════════

    function showDiff(filePath, html, additions, deletions) {
        welcomeEl.style.display = 'none';

        var container = document.createElement('div');
        container.className = 'msg assistant';

        var header = document.createElement('div');
        header.className = 'msg-header';
        var roleLabel = document.createElement('span');
        roleLabel.className = 'msg-role';
        roleLabel.textContent = 'AI';
        header.appendChild(roleLabel);

        var body = document.createElement('div');
        body.className = 'msg-body';

        var desc = document.createElement('div');
        desc.style.cssText = 'margin-bottom:8px;font-size:12px;color:var(--text-secondary);';
        desc.textContent = 'Proposed changes to ' + filePath;

        var diffContainer = document.createElement('div');
        diffContainer.className = 'diff-container';
        diffContainer.innerHTML = html;

        // 操作按钮
        var actions = document.createElement('div');
        actions.className = 'diff-actions';

        var acceptBtn = document.createElement('button');
        acceptBtn.className = 'diff-btn accept';
        acceptBtn.textContent = 'Apply';
        acceptBtn.addEventListener('click', function() {
            vscode.postMessage({ command: 'applyDiff', filePath: filePath });
        });

        var rejectBtn = document.createElement('button');
        rejectBtn.className = 'diff-btn reject';
        rejectBtn.textContent = 'Reject';
        rejectBtn.addEventListener('click', function() {
            vscode.postMessage({ command: 'rejectDiff', filePath: filePath });
            container.remove();
        });

        var acceptAllBtn = document.createElement('button');
        acceptAllBtn.className = 'diff-btn accept-all';
        acceptAllBtn.textContent = 'Apply All';
        acceptAllBtn.addEventListener('click', function() {
            vscode.postMessage({ command: 'applyAllDiffs' });
        });

        actions.appendChild(acceptBtn);
        actions.appendChild(rejectBtn);
        actions.appendChild(acceptAllBtn);

        diffContainer.appendChild(actions);
        body.appendChild(desc);
        body.appendChild(diffContainer);
        container.appendChild(header);
        container.appendChild(body);
        messagesEl.appendChild(container);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // ═══════════════════════════════════════
    // Tool Result Display
    // ═══════════════════════════════════════

    function showToolResult(type, data) {
        var div = document.createElement('div');
        div.className = 'tool-result';

        var header = document.createElement('div');
        header.className = 'tool-result-header';
        header.textContent = type === 'read_file' ? 'File Read' : type;

        var body = document.createElement('div');
        body.className = 'tool-result-body';
        body.textContent = data;

        div.appendChild(header);
        div.appendChild(body);
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // ═══════════════════════════════════════
    // Markdown Renderer
    // ═══════════════════════════════════════

    function renderMarkdown(text) {
        var html = text;

        // 代码块
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
            return '<pre><code class="language-' + (lang || 'text') + '">' + escapeHtml(code.trim()) + '</code></pre>';
        });

        // 行内代码
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

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

    // ═══════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════

    function focusInput() {
        if (inputEl) inputEl.focus();
    }

    messagesEl.addEventListener('click', function(e) {
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
            focusInput();
        }
    });

    // ═══════════════════════════════════════
    // Message Handler
    // ═══════════════════════════════════════

    window.addEventListener('message', function(event) {
        var msg = event.data;
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
            case 'modeChanged':
                currentMode = msg.mode;
                document.querySelectorAll('.mode-btn').forEach(function(b) {
                    b.classList.toggle('active', b.getAttribute('data-mode') === msg.mode);
                });
                break;
            case 'showDiff':
                showDiff(msg.filePath, msg.html, msg.additions, msg.deletions);
                break;
            case 'diffApplied':
                // 标记已应用
                var applied = document.createElement('div');
                applied.className = 'tool-result';
                applied.innerHTML = '<div class="tool-result-header" style="color:var(--success)">Applied</div><div class="tool-result-body">' + msg.filePath + ' saved.</div>';
                messagesEl.appendChild(applied);
                messagesEl.scrollTop = messagesEl.scrollHeight;
                break;
            case 'diffRejected':
                break;
            case 'toolResult':
                showToolResult(msg.type, msg.data);
                break;
            case 'fillInput':
                inputEl.value = msg.text;
                focusInput();
                break;
            case 'info':
                // 简单提示
                break;
            case 'focusInput':
                focusInput();
                break;
        }
    });

    focusInput();
})();
