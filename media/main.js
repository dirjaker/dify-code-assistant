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
    const contextArea = document.getElementById('inputContext');

    let currentMode = 'ask';
    let currentContext = []; // {type, label, icon}

    // ═══════════════════════════════════════
    // Mode Switcher — Ctrl+. 循环切换
    // ═══════════════════════════════════════

    const modes = ['ask', 'plan', 'agent'];

    function setMode(mode) {
        currentMode = mode;
        document.querySelectorAll('.mode-btn').forEach(function(b) {
            b.classList.toggle('active', b.getAttribute('data-mode') === mode);
        });
        vscode.postMessage({ command: 'setMode', mode: mode });

        var placeholders = { ask: 'Ask anything...', plan: 'Describe your task...', agent: 'Tell me what to build...' };
        inputEl.placeholder = placeholders[mode] || 'Ask anything...';

        // 更新 meta 信息
        var metaEl = document.querySelector('.input-meta');
        if (metaEl) {
            var modeLabels = { ask: 'Ask mode', plan: 'Plan mode', agent: 'Agent mode' };
            metaEl.textContent = modeLabels[mode] || '';
        }
    }

    document.querySelectorAll('.mode-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var mode = this.getAttribute('data-mode');
            if (mode && mode !== currentMode) { setMode(mode); focusInput(); }
        });
    });

    // Ctrl+. 循环模式
    document.addEventListener('keydown', function(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === '.') {
            e.preventDefault();
            var idx = modes.indexOf(currentMode);
            var next = modes[(idx + 1) % modes.length];
            setMode(next);
            focusInput();
        }
    });

    // ═══════════════════════════════════════
    // Context Management
    // ═══════════════════════════════════════

    function updateContextPills(contexts) {
        currentContext = contexts || [];
        contextArea.innerHTML = '';
        if (currentContext.length === 0) return;

        currentContext.forEach(function(ctx) {
            var tag = document.createElement('span');
            tag.className = 'context-tag';

            var icon = document.createElement('span');
            icon.className = 'tag-icon';
            icon.innerHTML = ctx.icon || '';

            var label = document.createElement('span');
            label.textContent = ctx.label;

            tag.appendChild(icon);
            tag.appendChild(label);
            contextArea.appendChild(tag);
        });
    }

    // ═══════════════════════════════════════
    // Send
    // ═══════════════════════════════════════

    function doSend() {
        var text = inputEl.value.trim();
        if (!text) return;

        welcomeEl.style.display = 'none';
        appendStep(text, 'user');
        vscode.postMessage({ command: 'sendMessage', text: text });

        requestAnimationFrame(function() {
            inputEl.value = '';
            inputEl.style.height = 'auto';
            focusInput();
        });
    }

    sendBtnEl.addEventListener('click', function(e) { e.preventDefault(); doSend(); });

    inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
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
            if (prompt) { inputEl.value = prompt; focusInput(); }
        });
    });

    // ═══════════════════════════════════════
    // Step Container — Continue 风格
    // ═══════════════════════════════════════

    function appendStep(text, role) {
        var step = document.createElement('div');
        step.className = 'step ' + role;

        // Header
        var header = document.createElement('div');
        header.className = 'step-header';

        var roleLabel = document.createElement('span');
        roleLabel.className = 'step-role';
        var roleNames = { user: 'You', assistant: 'AI', error: 'Error', system: 'System', tool: 'Tool' };
        roleLabel.textContent = roleNames[role] || role;

        var actions = document.createElement('div');
        actions.className = 'step-actions';

        if (role === 'assistant') {
            var copyBtn = document.createElement('button');
            copyBtn.className = 'step-action-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.addEventListener('click', function() {
                vscode.postMessage({ command: 'copyCode', code: text });
                copyBtn.textContent = 'Copied';
                setTimeout(function() { copyBtn.textContent = 'Copy'; }, 1500);
            });
            actions.appendChild(copyBtn);
        }

        header.appendChild(roleLabel);
        header.appendChild(actions);

        // Body
        var body = document.createElement('div');
        body.className = 'step-body';
        body.innerHTML = renderMarkdown(text);

        step.appendChild(header);
        step.appendChild(body);
        messagesEl.appendChild(step);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        // 代码块操作栏
        addCodeActions(step);
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
    // Diff Display — Continue 风格内联 diff
    // ═══════════════════════════════════════

    function showDiff(filePath, html) {
        welcomeEl.style.display = 'none';

        var step = document.createElement('div');
        step.className = 'step assistant';

        var header = document.createElement('div');
        header.className = 'step-header';
        var roleLabel = document.createElement('span');
        roleLabel.className = 'step-role';
        roleLabel.textContent = 'AI';
        header.appendChild(roleLabel);

        var body = document.createElement('div');
        body.className = 'step-body';

        var desc = document.createElement('div');
        desc.style.cssText = 'margin-bottom:8px;font-size:12px;color:var(--text-secondary);';
        desc.textContent = 'Proposed changes to ' + filePath;

        var diffContainer = document.createElement('div');
        diffContainer.className = 'diff-container';
        diffContainer.innerHTML = html;

        // Accept/Reject 按钮 — Continue 风格
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
            step.remove();
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
        step.appendChild(header);
        step.appendChild(body);
        messagesEl.appendChild(step);
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

        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
            return '<pre><code class="language-' + (lang || 'text') + '">' + escapeHtml(code.trim()) + '</code></pre>';
        });

        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
        html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
        html = html.replace(/^---$/gm, '<hr>');
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');

        return '<p>' + html + '</p>';
    }

    function escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // ═══════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════

    function focusInput() { if (inputEl) inputEl.focus(); }

    messagesEl.addEventListener('click', function(e) {
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) { focusInput(); }
    });

    // ═══════════════════════════════════════
    // Message Handler
    // ═══════════════════════════════════════

    window.addEventListener('message', function(event) {
        var msg = event.data;
        switch (msg.command) {
            case 'receiveMessage':
                appendStep(msg.text, msg.role);
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
                setMode(msg.mode);
                break;
            case 'showDiff':
                showDiff(msg.filePath, msg.html);
                break;
            case 'diffApplied':
                var applied = document.createElement('div');
                applied.className = 'tool-result';
                applied.innerHTML = '<div class="tool-result-header" style="color:var(--success)">Applied</div><div class="tool-result-body">' + msg.filePath + ' saved. Changes highlighted in editor.</div>';
                messagesEl.appendChild(applied);
                messagesEl.scrollTop = messagesEl.scrollHeight;
                break;
            case 'diffRejected':
                break;
            case 'toolResult':
                showToolResult(msg.type, msg.data);
                break;
            case 'updateContext':
                updateContextPills(msg.contexts || []);
                break;
            case 'fillInput':
                inputEl.value = msg.text;
                focusInput();
                break;
            case 'info':
                break;
            case 'focusInput':
                focusInput();
                break;
        }
    });

    focusInput();
})();
