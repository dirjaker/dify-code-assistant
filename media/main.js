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
    const tabListEl = document.getElementById('tabList');
    const tabNewBtn = document.getElementById('tabNewBtn');
    const modeDropdownEl = document.getElementById('modeDropdown');
    const modeTriggerEl = document.getElementById('modeTrigger');
    const currentModeTextEl = document.getElementById('currentModeText');
    const modeMenuEl = document.getElementById('modeMenu');

    var currentMode = 'agent';
    const modes = ['ask', 'plan', 'agent'];
    const modeInfo = {
        ask: { icon: '💬', title: 'Ask', desc: 'Ask questions about your code' },
        plan: { icon: '📋', title: 'Plan', desc: 'Plan and architect solutions' },
        agent: { icon: '🤖', title: 'Agent', desc: 'Autonomous coding with tools' }
    };

    // ═══════════════════════════════════════
    // Tab Management
    // ═══════════════════════════════════════
    var tabs = []; // { id, title, active }
    var activeTabId = null;

    function renderTabs() {
        if (!tabListEl) return;
        tabListEl.innerHTML = '';
        tabs.forEach(function(tab) {
            var el = document.createElement('div');
            el.className = 'tab-item' + (tab.id === activeTabId ? ' active' : '');
            el.setAttribute('data-tab-id', tab.id);

            var title = document.createElement('span');
            title.className = 'tab-title';
            title.textContent = tab.title || 'New Chat';
            title.title = tab.title || 'New Chat';

            var close = document.createElement('button');
            close.className = 'tab-close';
            close.innerHTML = '&#10005;';
            close.title = 'Close';
            close.addEventListener('click', function(e) {
                e.stopPropagation();
                vscode.postMessage({ command: 'closeTab', tabId: tab.id });
            });

            el.appendChild(title);
            el.appendChild(close);

            el.addEventListener('click', function() {
                if (tab.id !== activeTabId) {
                    vscode.postMessage({ command: 'switchTab', tabId: tab.id });
                }
            });

            tabListEl.appendChild(el);
        });
    }

    if (tabNewBtn) {
        tabNewBtn.addEventListener('click', function() {
            vscode.postMessage({ command: 'newTab' });
        });
    }

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
            { pattern: /(<!--[\s\S]*?-->)/g, cls: 'syn-comment' },
            { pattern: /("[^"]*"|'[^']*')/g, cls: 'syn-string' },
            { pattern: /(<\/?)([\w-]+)/g, repl: '$1<span class="syn-tag">$2</span>' },
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
    // Mode Dropdown — Premium Design
    // ═══════════════════════════════════════

    function initModeDropdown() {
        if (!modeDropdownEl || !modeMenuEl) return;

        // Render mode options
        renderModeMenu();

        // Toggle dropdown
        if (modeTriggerEl) {
            modeTriggerEl.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleModeDropdown();
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!modeDropdownEl.contains(e.target)) {
                closeModeDropdown();
            }
        });

        // Keyboard shortcut Ctrl+. to cycle modes
        document.addEventListener('keydown', function(e) {
            if ((e.metaKey || e.ctrlKey) && e.key === '.') {
                e.preventDefault();
                var idx = modes.indexOf(currentMode);
                setMode(modes[(idx + 1) % modes.length]);
                focusInput();
            }
        });
    }

    function renderModeMenu() {
        if (!modeMenuEl) return;
        modeMenuEl.innerHTML = '';

        // Header
        var header = document.createElement('div');
        header.className = 'mode-menu-header';
        header.textContent = 'Mode';
        modeMenuEl.appendChild(header);

        // Options
        modes.forEach(function(mode) {
            var info = modeInfo[mode];
            var option = document.createElement('div');
            option.className = 'mode-option' + (mode === currentMode ? ' active' : '');
            option.setAttribute('data-mode', mode);

            var icon = document.createElement('div');
            icon.className = 'mode-option-icon';
            icon.textContent = info.icon;

            var content = document.createElement('div');
            content.className = 'mode-option-content';

            var title = document.createElement('div');
            title.className = 'mode-option-title';
            title.textContent = info.title;

            var desc = document.createElement('div');
            desc.className = 'mode-option-desc';
            desc.textContent = info.desc;

            content.appendChild(title);
            content.appendChild(desc);

            var check = document.createElement('div');
            check.className = 'mode-option-check';
            check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';

            option.appendChild(icon);
            option.appendChild(content);
            option.appendChild(check);

            option.addEventListener('click', function() {
                setMode(mode);
                closeModeDropdown();
                focusInput();
            });

            modeMenuEl.appendChild(option);
        });
    }

    function toggleModeDropdown() {
        if (!modeDropdownEl) return;
        var isOpen = modeDropdownEl.classList.contains('open');
        if (isOpen) {
            closeModeDropdown();
        } else {
            openModeDropdown();
        }
    }

    function openModeDropdown() {
        if (!modeDropdownEl) return;
        modeDropdownEl.classList.add('open');
    }

    function closeModeDropdown() {
        if (!modeDropdownEl) return;
        modeDropdownEl.classList.remove('open');
    }

    function setMode(mode) {
        if (mode === currentMode) return;
        currentMode = mode;

        // Update trigger text
        if (currentModeTextEl) {
            var info = modeInfo[mode];
            currentModeTextEl.textContent = info.title;
        }

        // Update active state in menu
        if (modeMenuEl) {
            modeMenuEl.querySelectorAll('.mode-option').forEach(function(opt) {
                var optMode = opt.getAttribute('data-mode');
                opt.classList.toggle('active', optMode === mode);
            });
        }

        // Update placeholder
        var placeholders = {
            ask: 'Ask anything... (type @ for files, / for commands)',
            plan: 'Describe your task... (type @ for files, / for commands)',
            agent: 'Tell me what to build... (type @ for files, / for commands)'
        };
        if (inputEl) {
            inputEl.placeholder = placeholders[mode] || placeholders.ask;
        }

        // Update mode label
        if (modeLabelEl) {
            modeLabelEl.textContent = modeInfo[mode].title + ' mode';
        }

        // Notify extension
        vscode.postMessage({ command: 'setMode', mode: mode });
    }

    // Initialize mode dropdown
    initModeDropdown();

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
            item.innerHTML = '<span class="file-dropdown-icon">' + escapeHtml(r.icon) + '</span>' +
                '<span class="file-dropdown-path">' + escapeHtml(r.path) + '</span>' +
                '<span class="file-dropdown-size">' + sizeStr + '</span>';
            item.addEventListener('click', function() { selectFile(i); });
            item.addEventListener('mouseenter', function() { highlightFileItem(i); });
            fileDropdown.appendChild(item);
        });
        fileDropdown.style.display = 'block';
        fileDropdown.classList.add('visible');
        isFileDropdownOpen = true;
    }

    function closeFileDropdown() {
        if (fileDropdown) {
            fileDropdown.style.display = 'none';
            fileDropdown.classList.remove('visible');
        }
        isFileDropdownOpen = false;
        fileDropdownIndex = -1;
    }

    function highlightFileItem(idx) {
        fileDropdownIndex = idx;
        if (fileDropdown) {
            fileDropdown.querySelectorAll('.file-dropdown-item').forEach(function(el, i) {
                el.classList.toggle('selected', i === idx);
            });
        }
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
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
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
            item.innerHTML = '<span class="slash-dropdown-name">/' + escapeHtml(cmd.name) + '</span>' +
                '<span class="slash-dropdown-desc">' + escapeHtml(cmd.description) + '</span>';
            item.addEventListener('click', function() { selectSlashCommand(i, cmd); });
            item.addEventListener('mouseenter', function() { highlightSlashItem(i); });
            slashDropdown.appendChild(item);
        });
        slashDropdown.style.display = 'block';
        slashDropdown.classList.add('visible');
        isSlashDropdownOpen = true;
    }

    function closeSlashDropdown() {
        if (slashDropdown) {
            slashDropdown.style.display = 'none';
            slashDropdown.classList.remove('visible');
        }
        isSlashDropdownOpen = false;
        slashDropdownIndex = -1;
    }

    function highlightSlashItem(idx) {
        slashDropdownIndex = idx;
        if (slashDropdown) {
            slashDropdown.querySelectorAll('.slash-dropdown-item').forEach(function(el, i) {
                el.classList.toggle('selected', i === idx);
            });
        }
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

        var result = escapeHtml(code);
        rules.forEach(function(rule) {
            if (rule.repl) {
                result = result.replace(rule.pattern, rule.repl);
            } else {
                result = result.replace(rule.pattern, '<span class="' + rule.cls + '">$1</span>');
            }
        });
        return result;
    }

    // ═══════════════════════════════════════
    // Message Rendering
    // ═══════════════════════════════════════

    var streamingStep = null;
    var streamingContent = null;
    var userScrolledUp = false;
    var lastTerminalCmd = '';
    var streamingBuffer = '';
    var streamRafPending = false;

    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatMarkdown(text) {
        // Simple markdown rendering
        var html = escapeHtml(text);

        // Code blocks
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
            var highlighted = highlightSyntax(code.trim(), lang || 'text');
            return '<pre><div class="code-bar"><span class="code-lang">' + (lang || 'code') + '</span>' +
                '<div class="code-actions"><button class="code-action-btn copy-btn" title="Copy">Copy</button>' +
                '<button class="code-action-btn run-btn run" title="Run">Run</button></div></div>' +
                '<code>' + highlighted + '</code></pre>';
        });

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Italic — skip content already wrapped in <strong>
        html = html.replace(/\*([^*]+)\*/g, function(match, content) {
            if (match.indexOf('<strong>') !== -1) return match;
            return '<em>' + content + '</em>';
        });

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

        // Headers
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Lists
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        // Paragraphs
        html = html.replace(/\n\n/g, '</p><p>');
        html = '<p>' + html + '</p>';

        return html;
    }

    function appendStep(text, role) {
        if (welcomeEl) welcomeEl.style.display = 'none';
        if (thinkingEl) thinkingEl.style.display = '';

        var step = document.createElement('div');
        step.className = 'step ' + role;

        // Label
        var label = document.createElement('div');
        label.className = 'step-label';
        label.textContent = role === 'user' ? 'You' : 'Dify Assistant';
        step.appendChild(label);

        // Content
        var content = document.createElement('div');
        content.className = 'step-content';
        content.innerHTML = formatMarkdown(text);
        step.appendChild(content);

        // Actions
        var actions = document.createElement('div');
        actions.className = 'response-actions';
        if (role === 'assistant') {
            var copyBtn = document.createElement('button');
            copyBtn.className = 'response-action-btn';
            copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
            copyBtn.addEventListener('click', function() {
                vscode.postMessage({ command: 'copyCode', code: text });
            });
            actions.appendChild(copyBtn);
        }
        step.appendChild(actions);

        stepsArea.insertBefore(step, thinkingEl);
        scrollToBottom();
    }

    function startStream() {
        if (welcomeEl) welcomeEl.style.display = 'none';
        if (thinkingEl) thinkingEl.style.display = '';

        streamingStep = document.createElement('div');
        streamingStep.className = 'step assistant';

        var label = document.createElement('div');
        label.className = 'step-label';
        label.textContent = 'Dify Assistant';
        streamingStep.appendChild(label);

        streamingContent = document.createElement('div');
        streamingContent.className = 'step-content';
        streamingStep.appendChild(streamingContent);

        var actions = document.createElement('div');
        actions.className = 'response-actions';
        streamingStep.appendChild(actions);

        stepsArea.insertBefore(streamingStep, thinkingEl);
    }

    function appendStreamChunk(chunk) {
        if (!streamingContent) return;
        streamingBuffer += escapeHtml(chunk);
        if (!streamRafPending) {
            streamRafPending = true;
            requestAnimationFrame(function() {
                if (streamingContent) {
                    streamingContent.innerHTML = streamingBuffer;
                }
                streamRafPending = false;
                if (!userScrolledUp) scrollToBottom();
            });
        }
    }

    function endStream() {
        if (streamingContent) {
            var text = streamingContent.textContent;
            streamingContent.innerHTML = formatMarkdown(text);

            // Add action buttons
            var actions = streamingStep.querySelector('.response-actions');
            if (actions) {
                var copyBtn = document.createElement('button');
                copyBtn.className = 'response-action-btn';
                copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
                copyBtn.addEventListener('click', function() {
                    vscode.postMessage({ command: 'copyCode', code: text });
                });
                actions.appendChild(copyBtn);
            }
        }
        streamingStep = null;
        streamingContent = null;
        userScrolledUp = false;
        streamingBuffer = '';
        streamRafPending = false;
    }

    function showToolResult(type, data) {
        if (welcomeEl) welcomeEl.style.display = 'none';

        var step = document.createElement('div');
        step.className = 'step assistant';

        var label = document.createElement('div');
        label.className = 'step-label';
        label.textContent = 'Tool Result';
        step.appendChild(label);

        var content = document.createElement('div');
        content.className = 'step-content';
        content.innerHTML = '<div class="tool-result"><div class="tool-result-header"><span class="tool-result-icon">✓</span><span class="tool-result-name">' + escapeHtml(type) + '</span></div><div class="tool-result-body">' + escapeHtml(data) + '</div></div>';
        step.appendChild(content);

        stepsArea.insertBefore(step, thinkingEl);
        scrollToBottom();
    }

    function showDiff(filePath, html) {
        if (welcomeEl) welcomeEl.style.display = 'none';

        var step = document.createElement('div');
        step.className = 'step assistant';

        var label = document.createElement('div');
        label.className = 'step-label';
        label.textContent = 'Diff Preview';
        step.appendChild(label);

        var content = document.createElement('div');
        content.className = 'step-content';
        content.innerHTML = html;
        step.appendChild(content);

        stepsArea.insertBefore(step, thinkingEl);
        scrollToBottom();
    }

    // ═══════════════════════════════════════
    // Tool Execution / Agent Thought Handlers
    // ═══════════════════════════════════════

    function showToolStart(toolName) {
        if (welcomeEl) welcomeEl.style.display = 'none';

        var step = document.createElement('div');
        step.className = 'step tool-exec';
        step.setAttribute('data-tool', toolName);

        var header = document.createElement('div');
        header.className = 'tool-exec-header';
        header.innerHTML = '<span class="tool-exec-icon">🔧</span>' +
            '<span class="tool-exec-name">' + escapeHtml(toolName) + '</span>' +
            '<span class="tool-exec-status loading"><span class="tool-spinner"></span></span>';
        step.appendChild(header);

        stepsArea.insertBefore(step, thinkingEl);
        scrollToBottom();
    }

    function showToolEnd(toolName, result) {
        var step = stepsArea.querySelector('.step.tool-exec[data-tool="' + toolName + '"]');
        if (!step) return;

        var statusEl = step.querySelector('.tool-exec-status');
        if (statusEl) {
            statusEl.className = 'tool-exec-status success';
            statusEl.innerHTML = '✓ Done';
        }

        if (result) {
            var resultDiv = document.createElement('div');
            resultDiv.className = 'tool-exec-result';
            resultDiv.textContent = result.length > 500 ? result.substring(0, 500) + '...' : result;
            step.appendChild(resultDiv);
        }
        scrollToBottom();
    }

    function showAgentThought(thought) {
        if (welcomeEl) welcomeEl.style.display = 'none';

        var step = document.createElement('div');
        step.className = 'step thought-step';

        var content = document.createElement('div');
        content.className = 'thought-content';
        content.textContent = thought;
        step.appendChild(content);

        stepsArea.insertBefore(step, thinkingEl);
        scrollToBottom();
    }

    function showToolError(type, error) {
        if (welcomeEl) welcomeEl.style.display = 'none';

        var step = document.createElement('div');
        step.className = 'step tool-exec';

        var header = document.createElement('div');
        header.className = 'tool-exec-header';
        header.innerHTML = '<span class="tool-exec-icon">⚠️</span>' +
            '<span class="tool-exec-name">' + escapeHtml(type || 'Error') + '</span>' +
            '<span class="tool-exec-status error">✗ Error</span>';
        step.appendChild(header);

        var resultDiv = document.createElement('div');
        resultDiv.className = 'tool-exec-result';
        resultDiv.style.color = 'var(--error)';
        resultDiv.textContent = error || 'Unknown error';
        step.appendChild(resultDiv);

        stepsArea.insertBefore(step, thinkingEl);
        scrollToBottom();
    }

    function showTerminalResult(stdout, stderr, code) {
        if (welcomeEl) welcomeEl.style.display = 'none';

        var step = document.createElement('div');
        step.className = 'step assistant';

        var label = document.createElement('div');
        label.className = 'step-label';
        label.textContent = 'Terminal';
        step.appendChild(label);

        var content = document.createElement('div');
        content.className = 'step-content';

        var exitClass = code === 0 ? 'success' : 'error';
        var exitText = code === 0 ? '✓ Exit code: 0' : '✗ Exit code: ' + code;

        var html = '<div class="terminal-result">';
        html += '<div class="terminal-header">';
        html += '<span class="terminal-label">Terminal</span>';
        html += '<span class="terminal-cmd">' + escapeHtml(lastTerminalCmd) + '</span>';
        html += '<span class="terminal-exit ' + exitClass + '">' + exitText + '</span>';
        html += '</div>';
        html += '<div class="terminal-body">';
        if (stdout) html += '<div class="terminal-stdout">' + escapeHtml(stdout) + '</div>';
        if (stderr) html += '<div class="terminal-stderr">' + escapeHtml(stderr) + '</div>';
        html += '</div>';
        html += '</div>';

        content.innerHTML = html;
        step.appendChild(content);

        stepsArea.insertBefore(step, thinkingEl);
        scrollToBottom();
    }

    function updateContextPills(contexts) {
        if (!contextArea) return;
        contextArea.innerHTML = '';
        contexts.forEach(function(ctx) {
            var tag = document.createElement('div');
            tag.className = 'context-tag';
            tag.innerHTML = '<span class="context-tag-icon">' + (ctx.icon || '📄') + '</span>' +
                '<span>' + escapeHtml(ctx.label) + '</span>';
            contextArea.appendChild(tag);
        });
    }

    function restoreHistory(messages) {
        // Clear existing steps first to prevent duplicates
        var existingSteps = stepsArea.querySelectorAll('.step');
        existingSteps.forEach(function(s) { s.remove(); });

        if (!messages || messages.length === 0) {
            if (welcomeEl) welcomeEl.style.display = '';
            return;
        }

        if (welcomeEl) welcomeEl.style.display = 'none';
        messages.forEach(function(msg) {
            appendStep(msg.text, msg.role);
        });
    }

    function scrollToBottom() {
        if (stepsArea) {
            stepsArea.scrollTop = stepsArea.scrollHeight;
        }
    }

    function focusInput() {
        if (inputEl) inputEl.focus();
    }

    // ═══════════════════════════════════════
    // Event Listeners
    // ═══════════════════════════════════════

    // Send message
    function sendMessage() {
        var text = inputEl.value.trim();
        if (!text) return;

        vscode.postMessage({ command: 'sendMessage', text: text });
        inputEl.value = '';
        inputEl.style.height = 'auto';
        focusInput();
    }

    if (sendBtnEl) {
        sendBtnEl.addEventListener('click', sendMessage);
    }

    if (inputEl) {
        inputEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                if (!isFileDropdownOpen && !isSlashDropdownOpen) {
                    e.preventDefault();
                    sendMessage();
                }
            }
        });
    }

    // Clear chat
    if (clearBtnEl) {
        clearBtnEl.addEventListener('click', function() {
            vscode.postMessage({ command: 'clearChat' });
        });
    }

    // Settings
    if (settingsBtnEl) {
        settingsBtnEl.addEventListener('click', function() {
            vscode.postMessage({ command: 'openSettings' });
        });
    }

    // History
    var historyBtn = document.getElementById('historyBtn');
    if (historyBtn) {
        historyBtn.addEventListener('click', function() {
            toggleSessionList();
        });
    }

    // Copy code buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('copy-btn')) {
            var codeBlock = e.target.closest('pre').querySelector('code');
            if (codeBlock) {
                vscode.postMessage({ command: 'copyCode', code: codeBlock.textContent });
            }
        }
        if (e.target.classList.contains('run-btn')) {
            var codeBlock = e.target.closest('pre').querySelector('code');
            if (codeBlock) {
                lastTerminalCmd = codeBlock.textContent;
                vscode.postMessage({ command: 'executeTerminal', command_text: codeBlock.textContent });
            }
        }
    });

    // Starter buttons
    document.querySelectorAll('.starter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var prompt = btn.getAttribute('data-prompt');
            if (prompt) {
                vscode.postMessage({ command: 'insertPrompt', text: prompt });
            }
        });
    });

    // Listen for scroll
    stepsArea.addEventListener('scroll', function() {
        var isAtBottom = stepsArea.scrollHeight - stepsArea.scrollTop - stepsArea.clientHeight < 50;
        userScrolledUp = !isAtBottom && streamingStep !== null;
    });

    // ═══════════════════════════════════════
    // Message Handler
    // ═══════════════════════════════════════

    window.addEventListener('message', function(event) {
        var msg = event.data;
        switch (msg.command) {
            case 'receiveMessage':
                if (msg.role === 'error') {
                    var errorText = msg.text || '';
                    if (errorText.indexOf('ECONNREFUSED') !== -1 || errorText.indexOf('fetch failed') !== -1) {
                        errorText += '\n\n连接失败，请检查：\n1. dify.apiUrl 是否正确（不要加 /v1）\n2. Dify 服务是否运行中\n3. 网络是否可达';
                    } else if (errorText.indexOf('401') !== -1 || errorText.indexOf('Unauthorized') !== -1) {
                        errorText += '\n\n认证失败，请检查 dify.apiKey 是否正确（格式：app-xxx）';
                    }
                    appendStep(errorText, 'error');
                } else {
                    appendStep(msg.text, msg.role);
                }
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
                if (thinkingEl) {
                    thinkingEl.style.display = 'flex';
                }
                if (sendBtnEl) sendBtnEl.disabled = true;
                break;
            case 'stopThinking':
                if (thinkingEl) {
                    thinkingEl.style.display = 'none';
                }
                if (sendBtnEl) sendBtnEl.disabled = false;
                focusInput();
                break;
            case 'clearChat':
                var steps = stepsArea.querySelectorAll('.step');
                steps.forEach(function(s) { s.remove(); });
                if (welcomeEl) welcomeEl.style.display = '';
                if (thinkingEl) thinkingEl.style.display = 'none';
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
                var appliedLabel = document.createElement('div');
                appliedLabel.className = 'step-label';
                appliedLabel.textContent = 'Applied';
                appliedStep.appendChild(appliedLabel);
                var appliedContent = document.createElement('div');
                appliedContent.className = 'step-content';
                appliedContent.innerHTML = '<div class="tool-result"><div class="tool-result-header" style="color:var(--success)">Applied</div><div class="tool-result-body">' + msg.filePath + ' saved. Changes highlighted in editor.</div></div>';
                appliedStep.appendChild(appliedContent);
                stepsArea.insertBefore(appliedStep, thinkingEl);
                scrollToBottom();
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
            case 'toolStart':
                showToolStart(msg.toolName);
                break;
            case 'toolEnd':
                showToolEnd(msg.toolName, msg.result);
                break;
            case 'agentThought':
                showAgentThought(msg.thought);
                break;
            case 'toolError':
                showToolError(msg.type, msg.error);
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
                var appliedLabel2 = document.createElement('div');
                appliedLabel2.className = 'step-label';
                appliedLabel2.textContent = 'Edit Applied';
                appliedStep2.appendChild(appliedLabel2);
                var appliedContent2 = document.createElement('div');
                appliedContent2.className = 'step-content';
                appliedContent2.innerHTML = '<div class="tool-result"><div class="tool-result-header" style="color:var(--success)">Inline Edit Applied</div><div class="tool-result-body">' + escapeHtml(msg.filePath) + ' has been updated.</div></div>';
                appliedStep2.appendChild(appliedContent2);
                stepsArea.insertBefore(appliedStep2, thinkingEl);
                scrollToBottom();
                break;
            case 'restoreHistory':
                restoreHistory(msg.messages);
                break;
            case 'sessionList':
                updateSessionList(msg.sessions || []);
                break;
            case 'tabUpdate':
                tabs = msg.tabs || [];
                activeTabId = msg.activeTabId || null;
                renderTabs();
                break;
        }
    });

    // ═══════════════════════════════════════
    // Session Management UI
    // ═══════════════════════════════════════

    var sessionListEl = null;

    function updateSessionList(sessions) {
        // Create session list container on first call
        if (!sessionListEl) {
            sessionListEl = document.createElement('div');
            sessionListEl.className = 'session-list';
            var inputArea = document.querySelector('.input-area');
            if (inputArea) {
                inputArea.insertBefore(sessionListEl, inputArea.firstChild);
            }
        }

        // Preserve current visibility state (don't hide if user just opened it)
        var wasVisible = sessionListEl.style.display !== 'none';
        sessionListEl.innerHTML = '';

        // Hide if fewer than 2 sessions (nothing to switch between)
        if (!sessions || sessions.length <= 1) {
            sessionListEl.style.display = 'none';
            return;
        }

        sessions.forEach(function(s) {
            var item = document.createElement('div');
            item.className = 'session-item';
            var date = new Date(s.createdAt);
            var timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

            var info = document.createElement('div');
            info.className = 'session-info';
            info.innerHTML = '<span class="session-preview">' + escapeHtml(s.preview) + '</span>' +
                '<span class="session-meta">' + s.messageCount + ' msgs · ' + timeStr + '</span>';
            info.addEventListener('click', function() {
                vscode.postMessage({ command: 'loadSession', sessionId: s.id });
                sessionListEl.style.display = 'none';
            });

            var delBtn = document.createElement('button');
            delBtn.className = 'session-delete';
            delBtn.title = 'Delete';
            delBtn.innerHTML = '&#10005;';
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                vscode.postMessage({ command: 'deleteSession', sessionId: s.id });
            });

            item.appendChild(info);
            item.appendChild(delBtn);
            sessionListEl.appendChild(item);
        });

        // Restore visibility state
        sessionListEl.style.display = wasVisible ? 'block' : 'none';
    }

    function toggleSessionList() {
        if (!sessionListEl) return;
        var isHidden = sessionListEl.style.display === 'none';
        sessionListEl.style.display = isHidden ? 'block' : 'none';
    }

    focusInput();
})();
