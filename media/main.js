// @ts-check
(function () {
    const vscode = acquireVsCodeApi();

    // DOM — 匹配新的 HTML 结构
    const stepsArea = document.getElementById('stepsArea');
    const welcomeEl = document.getElementById('welcome');
    const thinkingEl = document.getElementById('thinking');
    const inputEl = document.getElementById('userInput');
    const sendBtnEl = document.getElementById('sendBtn');
    const clearBtnEl = document.getElementById('clearBtn');
    const settingsBtnEl = document.getElementById('settingsBtn');
    const contextArea = document.getElementById('inputContext');
    const modeLabelEl = document.getElementById('modeLabel');

    let currentMode = 'ask';
    const modes = ['ask', 'plan', 'agent'];

    // ═══════════════════════════════════════
    // Mode Switcher — Continue 风格
    // ═══════════════════════════════════════

    function setMode(mode) {
        currentMode = mode;
        document.querySelectorAll('.mode-btn').forEach(function(b) {
            b.classList.toggle('active', b.getAttribute('data-mode') === mode);
        });
        vscode.postMessage({ command: 'setMode', mode: mode });

        var placeholders = { ask: 'Ask anything...', plan: 'Describe your task...', agent: 'Tell me what to build...' };
        inputEl.placeholder = placeholders[mode] || 'Ask anything...';

        if (modeLabelEl) {
            var labels = { ask: 'Ask mode', plan: 'Plan mode', agent: 'Agent mode' };
            modeLabelEl.textContent = labels[mode] || '';
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
            setMode(modes[(idx + 1) % modes.length]);
            focusInput();
        }
    });

    // ═══════════════════════════════════════
    // Context Tags
    // ═══════════════════════════════════════

    function updateContextPills(contexts) {
        if (!contextArea) return;
        contextArea.innerHTML = '';
        if (!contexts || contexts.length === 0) return;

        contexts.forEach(function(ctx) {
            var tag = document.createElement('span');
            tag.className = 'context-tag';
            tag.textContent = ctx.label;
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
        thinkingEl.style.display = 'none';
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
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); }
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
        // 清除所有 step，保留 welcome 和 thinking
        var steps = stepsArea.querySelectorAll('.step');
        steps.forEach(function(s) { s.remove(); });
        welcomeEl.style.display = '';
        thinkingEl.style.display = '';
        vscode.postMessage({ command: 'clearChat' });
        focusInput();
    });

    settingsBtnEl.addEventListener('click', function(e) {
        e.preventDefault();
        vscode.postMessage({ command: 'openSettings' });
    });

    // ═══════════════════════════════════════
    // Conversation Starters
    // ═══════════════════════════════════════

    document.querySelectorAll('.starter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var prompt = this.getAttribute('data-prompt');
            if (prompt) { inputEl.value = prompt; focusInput(); }
        });
    });

    // ═══════════════════════════════════════
    // Step Container — Continue 风格
    // 每个 step 独立，操作按钮在下方
    // ═══════════════════════════════════════

    function appendStep(text, role) {
        var step = document.createElement('div');
        step.className = 'step ' + role;

        // Step Content
        var content = document.createElement('div');
        content.className = 'step-content';
        content.innerHTML = renderMarkdown(text);

        step.appendChild(content);

        // Response Actions — Continue 风格，右对齐
        if (role === 'assistant') {
            var actions = document.createElement('div');
            actions.className = 'response-actions';

            var copyBtn = createActionButton('Copy', function() {
                vscode.postMessage({ command: 'copyCode', code: text });
            });
            actions.appendChild(copyBtn);

            step.appendChild(actions);
        }

        // User 消息也需要一个 actions 区域保持布局一致
        if (role === 'user') {
            var userActions = document.createElement('div');
            userActions.className = 'response-actions';
            step.appendChild(userActions);
        }

        // 插入到 thinking 之前
        stepsArea.insertBefore(step, thinkingEl);
        stepsArea.scrollTop = stepsArea.scrollHeight;

        // 代码块操作栏
        addCodeActions(step);
    }

    function createActionButton(label, onClick) {
        var btn = document.createElement('button');
        btn.className = 'response-action-btn';
        btn.textContent = label;
        btn.addEventListener('click', function() {
            onClick();
            btn.textContent = 'Done';
            setTimeout(function() { btn.textContent = label; }, 1500);
        });
        return btn;
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
    // Diff Display — Continue 风格
    // ═══════════════════════════════════════

    function showDiff(filePath, html) {
        welcomeEl.style.display = 'none';

        var step = document.createElement('div');
        step.className = 'step assistant';

        var content = document.createElement('div');
        content.className = 'step-content';

        var desc = document.createElement('div');
        desc.style.cssText = 'margin-bottom:8px;font-size:12px;color:var(--text-desc);';
        desc.textContent = 'Proposed changes to ' + filePath;

        var diffContainer = document.createElement('div');
        diffContainer.className = 'diff-container';
        diffContainer.innerHTML = html;

        // Diff Actions — Continue 风格
        var diffActions = document.createElement('div');
        diffActions.className = 'diff-actions';

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

        diffActions.appendChild(acceptBtn);
        diffActions.appendChild(rejectBtn);
        diffActions.appendChild(acceptAllBtn);

        diffContainer.appendChild(diffActions);
        content.appendChild(desc);
        content.appendChild(diffContainer);
        step.appendChild(content);

        // Response actions
        var actions = document.createElement('div');
        actions.className = 'response-actions';
        step.appendChild(actions);

        stepsArea.insertBefore(step, thinkingEl);
        stepsArea.scrollTop = stepsArea.scrollHeight;
    }

    // ═══════════════════════════════════════
    // Tool Result Display
    // ═══════════════════════════════════════

    function showToolResult(type, data) {
        var div = document.createElement('div');
        div.className = 'step assistant';

        var content = document.createElement('div');
        content.className = 'step-content';

        var result = document.createElement('div');
        result.className = 'tool-result';

        var header = document.createElement('div');
        header.className = 'tool-result-header';
        header.textContent = type === 'read_file' ? 'File Read' : type;

        var body = document.createElement('div');
        body.className = 'tool-result-body';
        body.textContent = data;

        result.appendChild(header);
        result.appendChild(body);
        content.appendChild(result);
        div.appendChild(content);

        // Response actions
        var actions = document.createElement('div');
        actions.className = 'response-actions';
        div.appendChild(actions);

        stepsArea.insertBefore(div, thinkingEl);
        stepsArea.scrollTop = stepsArea.scrollHeight;
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

    stepsArea.addEventListener('click', function(e) {
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) { focusInput(); }
    });

    // ═══════════════════════════════════════
    // Message Handler
    // ═══════════════════════════════════════
    // Streaming State
    // ═══════════════════════════════════════

    var streamingStep = null;
    var streamingContent = null;
    var streamBuffer = '';
    var userScrolledUp = false;

    function startStream() {
        welcomeEl.style.display = 'none';
        userScrolledUp = false;

        streamingStep = document.createElement('div');
        streamingStep.className = 'step assistant';

        streamingContent = document.createElement('div');
        streamingContent.className = 'step-content streaming';

        streamingStep.appendChild(streamingContent);
        stepsArea.insertBefore(streamingStep, thinkingEl);
        streamBuffer = '';

        // 隐藏 thinking，显示 cancel 按钮
        thinkingEl.classList.remove('show');
        thinkingEl.classList.add('streaming');
    }

    function appendStreamChunk(chunk) {
        if (!streamingContent) return;
        streamBuffer += chunk;

        var rendered = renderStreamingMarkdown(streamBuffer);
        streamingContent.innerHTML = rendered;

        // 只在用户没有手动滚动时自动滚到底部
        if (!userScrolledUp) {
            stepsArea.scrollTop = stepsArea.scrollHeight;
        }
    }

    function endStream() {
        if (streamingStep) {
            // 移除 streaming 光标
            streamingContent.classList.remove('streaming');

            // 最终渲染完整 markdown
            streamingContent.innerHTML = renderMarkdown(streamBuffer);
            addCodeActions(streamingContent);

            // 添加 response actions
            var actions = document.createElement('div');
            actions.className = 'response-actions';

            var copyBtn = createActionButton('Copy', function() {
                vscode.postMessage({ command: 'copyCode', code: streamBuffer });
            });
            actions.appendChild(copyBtn);

            streamingStep.appendChild(actions);
        }
        streamingStep = null;
        streamingContent = null;
        streamBuffer = '';
        userScrolledUp = false;
        thinkingEl.classList.remove('streaming');
    }

    function cancelStream() {
        if (streamingStep) {
            streamingContent.classList.remove('streaming');
            streamingContent.innerHTML = renderMarkdown(streamBuffer + '\n\n*[Cancelled]*');
        }
        streamingStep = null;
        streamingContent = null;
        streamBuffer = '';
        userScrolledUp = false;
        thinkingEl.classList.remove('streaming');
        sendBtnEl.disabled = false;
    }

    // Escape 取消流式
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && streamingStep) {
            cancelStream();
        }
    });

    /**
     * 流式 Markdown 渲染 — 处理未闭合的代码块
     */
    function renderStreamingMarkdown(text) {
        var html = text;

        // 处理未闭合的代码块（流式输出时常见）
        var codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        var lastCodeBlockEnd = 0;
        var match;

        while ((match = codeBlockRegex.exec(html)) !== null) {
            lastCodeBlockEnd = match.index + match[0].length;
        }

        // 如果有未闭合的代码块，手动闭合它
        var openBlockStart = html.lastIndexOf('```', lastCodeBlockEnd > 0 ? lastCodeBlockEnd : 0);
        if (openBlockStart > lastCodeBlockEnd - 10 || (lastCodeBlockEnd === 0 && html.includes('```'))) {
            // 检查是否有未闭合的代码块
            var afterLastClose = html.substring(lastCodeBlockEnd);
            if (afterLastClose.includes('```') || (lastCodeBlockEnd === 0 && html.indexOf('```') !== -1)) {
                // 有未闭合的代码块，手动闭合
                var parts = html.split('```');
                if (parts.length % 2 === 0) {
                    // 奇数个 ``` 表示有未闭合的代码块
                    html += '\n```';
                }
            }
        }

        return renderMarkdown(html);
    }

    // 监听用户滚动，判断是否手动滚动上去
    stepsArea.addEventListener('scroll', function() {
        var isAtBottom = stepsArea.scrollHeight - stepsArea.scrollTop - stepsArea.clientHeight < 50;
        userScrolledUp = !isAtBottom && streamingStep !== null;
    });

    // ═══════════════════════════════════════

    window.addEventListener('message', function(event) {
        var msg = event.data;
        switch (msg.command) {
            case 'receiveMessage':
                appendStep(msg.text, msg.role);
                break;
            case 'startStream':
                startStream();
                break;
            case 'streamChunk':
                appendStreamChunk(msg.chunk);
                break;
            case 'endStream':
                endStream();
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
                var steps = stepsArea.querySelectorAll('.step');
                steps.forEach(function(s) { s.remove(); });
                welcomeEl.style.display = '';
                thinkingEl.style.display = '';
                break;
            case 'modeChanged':
                setMode(msg.mode);
                break;
            case 'showDiff':
                showDiff(msg.filePath, msg.html);
                break;
            case 'diffApplied':
                var appliedStep = document.createElement('div');
                appliedStep.className = 'step assistant';
                var appliedContent = document.createElement('div');
                appliedContent.className = 'step-content';
                appliedContent.innerHTML = '<div class="tool-result"><div class="tool-result-header" style="color:var(--success)">Applied</div><div class="tool-result-body">' + msg.filePath + ' saved. Changes highlighted in editor.</div></div>';
                appliedStep.appendChild(appliedContent);
                var appliedActions = document.createElement('div');
                appliedActions.className = 'response-actions';
                appliedStep.appendChild(appliedActions);
                stepsArea.insertBefore(appliedStep, thinkingEl);
                stepsArea.scrollTop = stepsArea.scrollHeight;
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
