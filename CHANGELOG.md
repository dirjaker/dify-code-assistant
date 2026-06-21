# Changelog

## [2.1.0] — 2026-06-22

### ⚙️ 工具系统统一
- 删除旧 5 工具实现（toolExecutor），只保留 diff 确认流程
- 所有 12 个工具统一走 `toolServer.ts`（HTTP 工具服务器）

### 🔒 SSE 流式解析加固
- 按 `\n\n` 分割完整事件块，不再按单个 `\n` 分割行
- 避免 chunk 边界丢失事件，提升流式输出稳定性

### 🛡️ 大文件保护
- `diffEngine` 对超过 5000 行的文件跳过 O(n²) LCS 算法
- 使用简单逐行 diff，避免大文件 OOM

### 📦 上下文缓存改进
- `contextCollector` 缓存带 5 分钟 TTL
- 监听 `onDidChangeTextDocument` 自动清除对应缓存

### 🎨 前端体验优化
- 引入 Google Fonts CDN 加载 Noto Sans SC（CJK 字体支持）
- textarea 自动高度：随内容扩展，最大 120px
- 错误消息优化：ECONNREFUSED / 401 给出具体排查步骤

## [2.0.0] — 2026-06-14

### 🔧 工具系统重构
- **12 个工具**完整实现：`read_file`, `write_file`, `edit_file`, `search_files`, `list_files`, `execute_command`, `create_directory`, `delete_file`, `move_file`, `get_diagnostics`, `insert_code`, `get_symbols`
- `edit_file` 从全量覆写改为**精确替换**（old_text 唯一匹配）
- 工具服务器加入 **Bearer Token 认证**，限制 CORS 来源
- 多语言符号提取：JS/TS/Python/Go/Rust/Java

### 🤖 Agent 工具循环
- 重写 `chatWithAgent`：AI 返回 ` ```tool ` 代码块 → 解析 → 执行 → 结果格式化发回
- 支持**多行值**（如 write_file 的 content 跨多行）
- Agent 循环用独立历史，不污染全局 `messageHistory`
- 支持 Dify 原生工具调用 + 自定义 tool block 两种模式

### 🎨 前端全面修复
- 补全 4 个缺失的消息处理器：`toolStart`, `toolEnd`, `agentThought`, `toolError`
- **流式性能优化**：`innerHTML +=` → `streamingBuffer` + `requestAnimationFrame` 批量更新
- `escapeHtml` 从 DOM 创建改为纯字符串替换
- Markdown 渲染修复：`**bold**` 不再被 `*italic*` 正则破坏
- 新增工具执行步骤 UI（spinner loading + 状态指示 + 结果折叠）
- 新增 Agent 推理展示（斜体灰色左边框）
- thinking indicator 默认隐藏，统一显隐逻辑

### 🛡️ 安全修复
- XSS 漏洞：`knowledgeResultHtml` 对 HTML 转义
- CORS `*` → 限制为 `vscode-webview://*` + Token 认证
- `request()` 检查 HTTP 状态码，4xx/5xx 正确 reject

### 🐛 Bug 修复
- `workspaceIndexer` 初始化顺序错误（使用前未创建）→ 提前初始化
- 双 `InlineCompletionItemProvider` 冲突 → 只注册一个，config 切换
- `extensionContext` 非空断言 → 改为必填参数
- `activeTextEditor!` 崩溃 → null 检查
- `chatInlineProvider` Panel 闭包捕获旧上下文 → 实例变量保存
- `DifyConfig` 接口重复定义 → 统一从 config.ts 导入
- `completionProvider.chat()` 污染全局历史 → 改用 `queryCodeCompletion`
- `workspaceIndexer.buildIndex` 竞态条件 → `indexingPromise` 模式
- `error.message` 可能 undefined → `instanceof Error` 判断

### ⚙️ 配置
- 新增 `dify.enableRagCompletion` 配置项，切换 RAG 增强补全
- 删除冗余的 `tools.ts` 文件

---

## [1.2.0] — 2026-06-13

### Added
- RAG 检索功能：知识库查询、架构查询、最佳实践查询
- 上下文收集器（ContextCollector）
- RAG 增强代码补全（RAGCompletionProvider）
- 知识库建设脚本（build-knowledge-base.sh）
- 知识库上传脚本（upload-to-dify.sh）
- Dify Workflow 配置（code-completion, code-review, spec-generator, knowledge-retrieval）

## [1.1.0] — 2026-06-12

### Added
- Agent 原生工具调用（Dify agent_thought 事件）
- 本地工具服务器（LocalToolServer）
- Premium UI 设计（深色主题、紫色渐变、毛玻璃）
- 多标签页支持
- @文件引用自动补全
- 斜杠命令系统
- 会话历史管理
- Inline Chat（Ctrl+I）
- 右键菜单：Explain / Fix / Refactor / Complete
