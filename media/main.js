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

    var currentMode = 'ask';
    const modes = ['ask', 'plan', 'agent'];

    // ═══════════════════════════════════════
    // @File Autocomplete State
    // ═══════════════════════════════════════
    var fileDropdown = document.getElementById('fileDropdown');
    var slashDropdown = document.getElementById('slashDropdown');
    var fileSearchResults = [];
    var fileDropdownIndex = -1;
    var slashCommandsList = [];
    var slashDropdownIndex = -1;
    var isFileDropdownOpen = false;
    var isSlashDropdownOpen = false;
    var mentionedFiles = []; // @引用的文件列表
    var commandHistory = [];
    var commandHistoryIndex = -1;

    // ═══════════════════════════════════════
    // Syntax Highlighting — 轻量级 token 着色
    // ═══════════════════════════════════════
    var syntaxRules = {
        javascript: [
            { pattern: /(\/\/.*$)/gm, cls: 'syn-comment' },
            { pattern: /(\/\*[\s\S]*?\*\/)/g, cls: 'syn-comment' },
            { pattern: /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g, cls: 'syn-string' },
            { pattern: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|try|catch|finally|throw|async|await|yield|typeof|instanceof|void|delete|in|of|super|static|get|set)\b/g, cls: 'syn-keyword' },
            { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, cls: 'syn-literal' },
            { pattern: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi, cls: 'syn-number' },
            { pattern: /\b([A-Z][a-zA-Z0-9]*)\b/g, cls: 'syn-type' },
            { pattern: /(\w+)(?=\s*\()/g, cls: 'syn-func' }
        ],
        typescript: [
            { pattern: /(\/\/.*$)/gm, cls: 'syn-comment' },
            { pattern: /(\/\*[\s\S]*?\*\/)/g, cls: 'syn-comment' },
            { pattern: /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g, cls: 'syn-string' },
            { pattern: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|try|catch|finally|throw|async|await|yield|typeof|instanceof|void|delete|in|of|super|static|get|set|interface|type|enum|namespace|declare|abstract|implements|readonly|private|protected|public|as|is|keyof|infer|never|unknown|any|string|number|boolean|bigint|symbol|object|undefined|null|void|never)\b/g, cls: 'syn-keyword' },
            { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, cls: 'syn-literal' },
            { pattern: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi, cls: 'syn-number' },
            { pattern: /\b([A-Z][a-zA-Z0-9]*)\b/g, cls: 'syn-type' },
            { pattern: /(\w+)(?=\s*\()/g, cls: 'syn-func' }
        ],
        python: [
            { pattern: /(#.*$)/gm, cls: 'syn-comment' },
            { pattern: /('''[\s\S]*?'''|"""[\s\S]*?""")/g, cls: 'syn-string' },
            { pattern: /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, cls: 'syn-string' },
            { pattern: /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|and|or|not|is|in|True|False|None|global|nonlocal|assert|del|async|await)\b/g, cls: 'syn-keyword' },
            { pattern: /\b(True|False|None)\b/g, cls: 'syn-literal' },
            { pattern: /\b(\d+\.?\d*(?:e[+-]?\d+)?j?)\b/gi, cls: 'syn-number' },
            { pattern: /\b([A-Z][a-zA-Z0-9]*)\b/g, cls: 'syn-type' },
            { pattern: /(\w+)(?=\s*\()/g, cls: 'syn-func' }
        ],
        rust: [
            { pattern: /(\/\/.*$)/gm, cls: 'syn-comment' },
            { pattern: /(\/\*[\s\S]*?\*\/)/g, cls: 'syn-comment' },
            { pattern: /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, cls: 'syn-string' },
            { pattern: /\b(fn|let|mut|const|if|else|for|while|loop|match|return|use|mod|pub|struct|enum|impl|trait|type|where|self|super|crate|async|await|move|ref|unsafe|extern|static|as|in|break|continue|true|false)\b/g, cls: 'syn-keyword' },
            { pattern: /\b(true|false)\b/g, cls: 'syn-literal' },
            { pattern: /\b(\d+\.?\d*(?:e[+-]?\d+)?(?:u8|u16|u32|u64|u128|usize|i8|i16|i32|i64|i128|isize|f32|f64)?)\b/gi, cls: 'syn-number' },
            { pattern: /\b([A-Z][a-zA-Z0-9]*)\b/g, cls: 'syn-type' },
            { pattern: /(\w+)(?=\s*\()/g, cls: 'syn-func' }
        ],
        go: [
            { pattern: /(\/\/.*$)/gm, cls: 'syn-comment' },
            { pattern: /(\/\*[\s\S]*?\*\/)/g, cls: 'syn-comment' },
            { pattern: /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, cls: 'syn-string' },
            { pattern: /\b(func|return|if|else|for|range|switch|case|default|break|continue|go|defer|select|chan|map|struct|interface|type|const|var|package|import|fallthrough|goto)\b/g, cls: 'syn-keyword' },
            { pattern: /\b(true|false|nil|iota)\b/g, cls: 'syn-literal' },
            { pattern: /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi, cls: 'syn-number' },
            { pattern: /\b([A-Z][a-zA-Z0-9]*)\b/g, cls: 'syn-type' },
            { pattern: /(\w+)(?=\s*\()/g, cls: 'syn-func' }
        ],
        html: [
            { pattern: /(&lt;!--[\s\S]*?--&gt;)/g, cls: 'syn-comment' },
            { pattern: /("[^"]*"|'[^']*')/g, cls: 'syn-string' },
            { pattern: /(&lt;\/?)([\w-]+)/g, repl: '$1<span class="syn-tag">$2</span>' },
            { pattern: /(\b\w+)(?==)/g, cls: 'syn-attr' }
        ],
        css: [
            { pattern: /(\/\*[\s\S]*?\*\/)/g, cls: 'syn-comment' },
            { pattern: /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, cls: 'syn-string' },
            { pattern: /(#[0-9a-fA-F]{3,8})\b/g, cls: 'syn-number' },
            { pattern: /\b(\d+\.?\d+(?:px|em|rem|%|vh|vw|deg|s|ms)?)\b/g, cls: 'syn-number' },
            { pattern: /(@\w+)/g, cls: 'syn-keyword' },
            { pattern: /(\.?[a-zA-Z][\w-]*)(?=\s*\{)/g, cls: 'syn-type' }
        ]
    };
    // Alias common languages
    syntaxRules.jsx = syntaxRules.javascript;
    syntaxRules.tsx = syntaxRules.typescript;
    syntaxRules.json = syntaxRules.javascript;
    syntaxRules.yaml = syntaxRules.python;
    syntaxRules.sh = syntaxRules.python;
    syntaxRules.bash = syntaxRules.python;
    syntaxRules.sql = syntaxRules.python;

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

    // Ctrl+@ 触发文件搜索
    document.addEventListener('keydown', function(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === '@') {
            e.preventDefault();
            var cursorPos = inputEl.selectionStart;
            var val = inputEl.value;
            inputEl.value = val.substring(0, cursorPos) + '@' + val.substring(cursorPos);
            inputEl.setSelectionRange(cursorPos + 1, cursorPos + 1);
            focusInput();
            detectAtMention();
        }
    });

    // ═══════════════════════════════════════
    // @File Autocomplete
    // ═══════════════════════════════════════

    function detectAtMention() {
        var val = inputEl.value;
        var cursorPos = inputEl.selectionStart;
        var textBefore = val.substring(0, cursorPos);
        var atMatch = textBefore.match(/@(\S*)$/);
        if (atMatch) {
            var query = atMatch[1];
            vscode.postMessage({ command: 'searchFiles', query: query });
            return true;
        }
        closeFileDropdown();
        return false;
    }

    function showFileDropdown(results) {
        if (!results || results.length === 0) { closeFileDropdown(); return; }
        fileSearchResults = results;
        fileDropdownIndex = -1;
        fileDropdown.innerHTML = '';
        results.forEach(function(r, i) {
            var item = document.createElement('div');
            item.className = 'file-dropdown-item';
            var sizeStr = r.size > 1024 ? Math.round(r.size / 1024) + 'KB' : r.size + 'B';
            item.innerHTML = '<span class="file-icon">' + escapeHtml(r.icon) + '</span>' +
                '<span class="file-path">' + escapeHtml(r.path) + '</span>' +
                '<span class="file-size">' + sizeStr + '</span>';
            item.addEventListener('click', function() { selectFile(i); });
            item.addEventListener('mouseenter', function() { highlightFileItem(i); });
            fileDropdown.appendChild(item);
        });
        fileDropdown.style.display = 'block';
        isFileDropdownOpen = true;
    }

    function closeFileDropdown() {
        fileDropdown.style.display = 'none';
        isFileDropdownOpen = false;
        fileDropdownIndex = -1;
    }

    function highlightFileItem(idx) {
        fileDropdownIndex = idx;
        fileDropdown.querySelectorAll('.file-dropdown-item').forEach(function(el, i) {
            el.classList.toggle('active', i === idx);
        });
    }

    function selectFile(idx) {
        var file = fileSearchResults[idx];
        if (!file) return;
        var val = inputEl.value;
        var cursorPos = inputEl.selectionStart;
        var textBefore = val.substring(0, cursorPos);
        var textAfter = val.substring(cursorPos);
        var atStart = textBefore.lastIndexOf('@');
        var newText = textBefore.substring(0, atStart) + '@' + file.path + ' ' + textAfter;
        inputEl.value = newText;
        var newPos = atStart + file.path.length + 2;
        inputEl.setSelectionRange(newPos, newPos);
        closeFileDropdown();
        mentionedFiles.push(file.path);
        focusInput();
    }

    inputEl.addEventListener('input', function() {
        if (!detectAtMention()) {
            detectSlashCommand();
        }
    });

    inputEl.addEventListener('keydown', function(e) {
        if (isFileDropdownOpen) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightFileItem(Math.min(fileDropdownIndex + 1, fileSearchResults.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightFileItem(Math.max(fileDropdownIndex - 1, 0));
            } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                if (fileDropdownIndex >= 0) {
                    e.preventDefault();
                    selectFile(fileDropdownIndex);
                    return;
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeFileDropdown();
                return;
            }
        }
        if (isSlashDropdownOpen) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightSlashItem(Math.min(slashDropdownIndex + 1, slashCommandsList.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightSlashItem(Math.max(slashDropdownIndex - 1, 0));
            } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                if (slashDropdownIndex >= 0) {
                    e.preventDefault();
                    selectSlashCommand(slashDropdownIndex);
                    return;
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeSlashDropdown();
                return;
            }
        }
    });

    // ═══════════════════════════════════════
    // Slash Command Autocomplete
    // ═══════════════════════════════════════

    function detectSlashCommand() {
        var val = inputEl.value;
        if (val.match(/^\/\w*$/)) {
            var query = val.substring(1).toLowerCase();
            var filtered = slashCommandsList.filter(function(c) {
                return c.name.toLowerCase().startsWith(query);
            });
            showSlashDropdown(filtered);
            return true;
        }
        closeSlashDropdown();
        return false;
    }

    function showSlashDropdown(cmds) {
        if (!cmds || cmds.length === 0) { closeSlashDropdown(); return; }
        slashDropdownIndex = -1;
        slashDropdown.innerHTML = '';
        cmds.forEach(function(cmd, i) {
            var item = document.createElement('div');
            item.className = 'slash-dropdown-item';
            item.innerHTML = '<span class="slash-cmd">/' + escapeHtml(cmd.name) + '</span>' +
                '<span class="slash-desc">' + escapeHtml(cmd.description) + '</span>';
            item.addEventListener('click', function() { selectSlashCommand(i, cmd); });
            item.addEventListener('mouseenter', function() { highlightSlashItem(i); });
            slashDropdown.appendChild(item);
        });
        slashDropdown.style.display = 'block';
        isSlashDropdownOpen = true;
    }

    function closeSlashDropdown() {
        slashDropdown.style.display = 'none';
        isSlashDropdownOpen = false;
        slashDropdownIndex = -1;
    }

    function highlightSlashItem(idx) {
        slashDropdownIndex = idx;
        slashDropdown.querySelectorAll('.slash-dropdown-item').forEach(function(el, i) {
            el.classList.toggle('active', i === idx);
        });
    }

    function selectSlashCommand(idx, cmd) {
        if (!cmd) {
            var filtered = slashCommandsList.filter(function(c) {
                return c.name.toLowerCase().startsWith(inputEl.value.substring(1).toLowerCase());
            });
            cmd = filtered[idx];
        }
        if (!cmd) return;
        closeSlashDropdown();
        vscode.postMessage({ command: 'slashCommand', text: '/' + cmd.name + ' ' });
        inputEl.value = '';
        focusInput();
    }

    // ═══════════════════════════════════════
    // Syntax Highlighting
    // ═══════════════════════════════════════

    function highlightSyntax(code, lang) {
        var rules = syntaxRules[lang] || syntaxRules[lang.split('-')[0]];
        if (!rules) return code;

        var result = code;
        // Track positions to avoid nested replacements
        var tokens = [];
        var tempResult = result;

        rules.forEach(function(rule) {
            if (rule.repl) {
                tempResult = tempResult.replace(rule.pattern, rule.repl);
            } else {
                tempResult = tempResult.replace(rule.pattern, function(match) {
                    if (match.startsWith('<span')) return match; // already wrapped
                    return '<span class="' + rule.cls + '">' + match + '</span>';
                });
            }
        });

        return tempResult;
    }

    // ═══════════════════════════════════════
    // Inline Edit
    // ═══════════════════════════════════════

    function createInlineEditor(code, lang, filePath) {
        var wrapper = document.createElement('div');
        wrapper.className = 'inline-editor';

        var header = document.createElement('div');
        header.className = 'inline-editor-header';
        header.innerHTML = '<span class="code-lang">' + escapeHtml(lang) + '</span>' +
            (filePath ? '<span class="inline-file-path">' + escapeHtml(filePath) + '</span>' : '');

        var textarea = document.createElement('textarea');
        textarea.className = 'inline-editor-textarea';
        textarea.value = code;
        textarea.rows = Math.min(code.split('\n').length + 2, 20);

        var actions = document.createElement('div');
        actions.className = 'inline-editor-actions';

        // Auto-resize textarea
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 400) + 'px';
        });

        // Diff preview indicator
        var diffBadge = document.createElement('span');
        diffBadge.className = 'inline-diff-badge';
        diffBadge.textContent = '';
        header.appendChild(diffBadge);

        textarea.addEventListener('input', function() {
            var originalLines = code.split('\n').length;
            var newLines = textarea.value.split('\n').length;
            var diff = newLines - originalLines;
            if (diff > 0) {
                diffBadge.textContent = '+' + diff + ' lines';
                diffBadge.className = 'inline-diff-badge add';
            } else if (diff < 0) {
                diffBadge.textContent = diff + ' lines';
                diffBadge.className = 'inline-diff-badge del';
            } else {
                diffBadge.textContent = 'modified';
                diffBadge.className = 'inline-diff-badge mod';
            }
        });

        var applyBtn = document.createElement('button');
        applyBtn.className = 'inline-btn apply';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', function() {
            if (filePath) {
                vscode.postMessage({ command: 'applyInlineEdit', filePath: filePath, newContent: textarea.value });
            }
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'inline-btn cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function() { wrapper.remove(); });

        var copyBtn = document.createElement('button');
        copyBtn.className = 'inline-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', function() {
            vscode.postMessage({ command: 'copyCode', code: textarea.value });
            copyBtn.textContent = 'Copied';
            setTimeout(function() { copyBtn.textContent = 'Copy'; }, 1500);
        });

        actions.appendChild(copyBtn);
        actions.appendChild(cancelBtn);
        actions.appendChild(applyBtn);

        wrapper.appendChild(header);
        wrapper.appendChild(textarea);
        wrapper.appendChild(actions);
        return wrapper;
    }

    // ═══════════════════════════════════════
    // Terminal Result Display
    // ═══════════════════════════════════════

    var lastTerminalCmd = '';

    function showTerminalResult(stdout, stderr, exitCode) {
        var step = document.createElement('div');
        step.className = 'step assistant';
        var content = document.createElement('div');
        content.className = 'step-content';
        var result = document.createElement('div');
        result.className = 'terminal-result';

        var header = document.createElement('div');
        header.className = 'terminal-header';
        var cmdDisplay = lastTerminalCmd ? ('$ ' + escapeHtml(lastTerminalCmd)) : 'Terminal';
        header.innerHTML = '<span class="terminal-cmd">' + cmdDisplay + '</span>' +
            '<span class="terminal-exit ' + (exitCode === 0 ? 'success' : 'error') + '">exit: ' + exitCode + '</span>';

        var body = document.createElement('div');
        body.className = 'terminal-body';
        if (stdout) {
            var stdoutEl = document.createElement('div');
            stdoutEl.className = 'terminal-stdout';
            stdoutEl.textContent = stdout;
            body.appendChild(stdoutEl);
        }
        if (stderr) {
            var stderrEl = document.createElement('div');
            stderrEl.className = 'terminal-stderr';
            stderrEl.textContent = stderr;
            body.appendChild(stderrEl);
        }
        if (!stdout && !stderr) {
            body.textContent = '(no output)';
        }

        result.appendChild(header);
        result.appendChild(body);
        content.appendChild(result);
        step.appendChild(content);

        var actions = document.createElement('div');
        actions.className = 'response-actions';
        step.appendChild(actions);

        stepsArea.insertBefore(step, thinkingEl);
        stepsArea.scrollTop = stepsArea.scrollHeight;
    }

    // ═══════════════════════════════════════
    // History Restore
    // ═══════════════════════════════════════

    function restoreHistory(messages) {
        if (!messages || messages.length === 0) return;
        welcomeEl.style.display = 'none';
        messages.forEach(function(msg) {
            appendStep(msg.text, msg.role);
        });
    }

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

        // Check for slash commands
        if (text.startsWith('/')) {
            var slashMatch = text.match(/^\/(\w+)\s*(.*)/);
            if (slashMatch) {
                var cmdName = slashMatch[1];
                var knownCmd = slashCommandsList.find(function(c) { return c.name === cmdName; });
                if (knownCmd) {
                    welcomeEl.style.display = 'none';
                    thinkingEl.style.display = 'none';
                    appendStep(text, 'user');
                    vscode.postMessage({ command: 'slashCommand', text: text });
                    requestAnimationFrame(function() {
                        inputEl.value = '';
                        inputEl.style.height = 'auto';
                        focusInput();
                    });
                    return;
                }
            }
        }

        welcomeEl.style.display = 'none';
        thinkingEl.style.display = 'none';
        appendStep(text, 'user');
        vscode.postMessage({ command: 'sendMessage', text: text });

        // Update context pills with mentioned files
        if (mentionedFiles.length > 0) {
            var pills = mentionedFiles.map(function(f) { return { type: 'file', label: f }; });
            updateContextPills(pills);
            mentionedFiles = [];
        }

        // Add to command history
        if (text && (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== text)) {
            commandHistory.push(text);
            if (commandHistory.length > 50) commandHistory.shift();
        }
        commandHistoryIndex = -1;

        requestAnimationFrame(function() {
            inputEl.value = '';
            inputEl.style.height = 'auto';
            focusInput();
        });
    }

    sendBtnEl.addEventListener('click', function(e) { e.preventDefault(); doSend(); });

    inputEl.addEventListener('keydown', function(e) {
        // Command history navigation
        if (e.key === 'ArrowUp' && inputEl.value === '' && commandHistory.length > 0) {
            e.preventDefault();
            if (commandHistoryIndex < commandHistory.length - 1) {
                commandHistoryIndex++;
            }
            inputEl.value = commandHistory[commandHistory.length - 1 - commandHistoryIndex];
            return;
        }
        if (e.key === 'ArrowDown' && commandHistoryIndex >= 0) {
            e.preventDefault();
            commandHistoryIndex--;
            if (commandHistoryIndex < 0) {
                inputEl.value = '';
            } else {
                inputEl.value = commandHistory[commandHistory.length - 1 - commandHistoryIndex];
            }
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); }
    });

    inputEl.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // ═══════════════════════════════════════
    // Clear & Settings
    // ═══════════════════════════════════════

    var historyBtnEl = document.getElementById('historyBtn');
    if (historyBtnEl) {
        historyBtnEl.addEventListener('click', function(e) {
            e.preventDefault();
            toggleSessionList();
        });
    }

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
        var rendered = renderMarkdown(text);
        // Highlight @mentions in user messages
        if (role === 'user') {
            rendered = rendered.replace(/@(\S+)/g, '<span class="at-mention">@$1</span>');
        }
        content.innerHTML = rendered;

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

            // Add line numbers as a side gutter (no layout shift)
            var lineCount = code.textContent.split('\n').length;
            if (lineCount > 2) {
                var gutter = document.createElement('div');
                gutter.className = 'line-gutter';
                var nums = [];
                for (var i = 1; i <= lineCount; i++) {
                    nums.push(i);
                }
                gutter.textContent = nums.join('\n');
                pre.insertBefore(gutter, pre.firstChild);
                pre.classList.add('has-gutter');
            }

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

            var editBtn = document.createElement('button');
            editBtn.className = 'code-action-btn';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', function() {
                // Replace the code block with an inline editor
                var existing = pre.parentNode.querySelector('.inline-editor');
                if (existing) { existing.remove(); return; }
                var editor = createInlineEditor(code.textContent, lang, null);
                pre.parentNode.insertBefore(editor, pre.nextSibling);
            });

            // Run button for shell/bash/python code blocks
            if (['shell', 'bash', 'sh', 'python', 'py'].includes(lang)) {
                var runBtn = document.createElement('button');
                runBtn.className = 'code-action-btn run';
                runBtn.textContent = 'Run';
                runBtn.addEventListener('click', function() {
                    var cmd = code.textContent;
                    if (['python', 'py'].includes(lang)) {
                        cmd = 'python3 -c ' + JSON.stringify(cmd);
                    }
                    lastTerminalCmd = cmd;
                    vscode.postMessage({ command: 'executeTerminal', command_text: cmd });
                    runBtn.textContent = 'Running...';
                    setTimeout(function() { runBtn.textContent = 'Run'; }, 3000);
                });
                actions.appendChild(runBtn);
            }

            actions.appendChild(copyBtn);
            actions.appendChild(insertBtn);
            actions.appendChild(editBtn);
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
            var langClass = lang || 'text';
            var highlighted = highlightSyntax(escapeHtml(code.trim()), lang);
            return '<pre><code class="language-' + langClass + '">' + highlighted + '</code></pre>';
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

    var streamRenderTimer = null;

    function appendStreamChunk(chunk) {
        if (!streamingContent) return;
        streamBuffer += chunk;

        // Debounce: 60fps max, batch chunks
        if (streamRenderTimer) return;
        streamRenderTimer = requestAnimationFrame(function() {
            streamRenderTimer = null;
            if (!streamingContent) return;

            // Use lighter rendering during streaming (no line numbers)
            var rendered = renderStreamingMarkdown(streamBuffer);
            streamingContent.innerHTML = rendered;

            if (!userScrolledUp) {
                stepsArea.scrollTop = stepsArea.scrollHeight;
            }
        });
    }

    function endStream() {
        // Flush any pending render
        if (streamRenderTimer) {
            clearTimeout(streamRenderTimer);
            streamRenderTimer = null;
        }

        if (streamingStep) {
            streamingContent.classList.remove('streaming');

            // Final render with syntax highlighting
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
        if (streamRenderTimer) {
            cancelAnimationFrame(streamRenderTimer);
            streamRenderTimer = null;
        }
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

        // Close unclosed code blocks
        var codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        var lastCodeBlockEnd = 0;
        var match;
        while ((match = codeBlockRegex.exec(html)) !== null) {
            lastCodeBlockEnd = match.index + match[0].length;
        }
        var parts = html.split('```');
        if (parts.length % 2 === 0) {
            html += '\n```';
        }

        // During streaming: plain rendering (no syntax highlighting, no line numbers)
        // This prevents flickering from re-tokenizing on every frame
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(m, lang, code) {
            return '<pre><code class="language-' + (lang || 'text') + '">' + escapeHtml(code.trim()) + '</code></pre>';
        });

        // Basic markdown (same as renderMarkdown but lighter)
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
        html = html.replace(/^---$/gm, '<hr>');
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');

        return '<p>' + html + '</p>';
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
            case 'fileSearchResults':
                showFileDropdown(msg.results || []);
                break;
            case 'slashCommandsList':
                slashCommandsList = msg.commands || [];
                break;
            case 'terminalResult':
                showTerminalResult(msg.stdout, msg.stderr, msg.code);
                break;
            case 'runTerminal':
                if (msg.commandText) {
                    lastTerminalCmd = msg.commandText;
                    vscode.postMessage({ command: 'executeTerminal', command_text: msg.commandText });
                }
                break;
            case 'inlineEditApplied':
                var appliedStep2 = document.createElement('div');
                appliedStep2.className = 'step assistant';
                var appliedContent2 = document.createElement('div');
                appliedContent2.className = 'step-content';
                appliedContent2.innerHTML = '<div class="tool-result"><div class="tool-result-header" style="color:var(--success)">Inline Edit Applied</div><div class="tool-result-body">' + escapeHtml(msg.filePath) + ' has been updated.</div></div>';
                appliedStep2.appendChild(appliedContent2);
                stepsArea.insertBefore(appliedStep2, thinkingEl);
                stepsArea.scrollTop = stepsArea.scrollHeight;
                break;
            case 'restoreHistory':
                restoreHistory(msg.messages);
                break;
            case 'sessionList':
                updateSessionList(msg.sessions || []);
                break;
        }
    });

    // ═══════════════════════════════════════
    // Session Management UI
    // ═══════════════════════════════════════

    var sessionListEl = null;

    function updateSessionList(sessions) {
        // Will be shown in a panel when user clicks history button
        if (!sessionListEl) {
            sessionListEl = document.createElement('div');
            sessionListEl.className = 'session-list';
            document.querySelector('.input-area').insertBefore(sessionListEl, document.querySelector('.input-toolbar'));
        }
        sessionListEl.innerHTML = '';
        sessionListEl.style.display = 'none';

        if (sessions.length <= 1) return;

        sessions.forEach(function(s) {
            var item = document.createElement('div');
            item.className = 'session-item';
            var date = new Date(s.createdAt);
            var timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
            item.innerHTML = '<span class="session-preview">' + escapeHtml(s.preview) + '</span>' +
                '<span class="session-meta">' + s.messageCount + ' msgs · ' + timeStr + '</span>';
            item.addEventListener('click', function() {
                vscode.postMessage({ command: 'loadSession', sessionId: s.id });
                sessionListEl.style.display = 'none';
            });
            sessionListEl.appendChild(item);
        });
    }

    function toggleSessionList() {
        if (!sessionListEl) return;
        sessionListEl.style.display = sessionListEl.style.display === 'none' ? 'block' : 'none';
    }

    focusInput();
})();
