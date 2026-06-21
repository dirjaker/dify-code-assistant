<div align="center">

<img src="assets/banner.png" width="100%" alt="Dify Code Assistant">

<br>

### 基于 Dify 的 VS Code AI 编程助手 · v2.1

[![Stars](https://img.shields.io/github/stars/dirjaker/dify-code-assistant?style=flat-square&label=Stars&color=FFD700)](https://github.com/dirjaker/dify-code-assistant/stargazers)
[![Forks](https://img.shields.io/github/forks/dirjaker/dify-code-assistant?style=flat-square&label=Forks&color=4A90D9)](https://github.com/dirjaker/dify-code-assistant/network/members)
[![License](https://img.shields.io/github/license/dirjaker/dify-code-assistant?style=flat-square&label=License&color=20B2AA)](https://github.com/dirjaker/dify-code-assistant/blob/dev/LICENSE)
[![VS Code](https://img.shields.io/badge/VS_Code-1.85+-007ACC?style=flat-square&logo=visual-studio-code)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [Dify 平台配置（详细）](#dify-平台配置详细)
- [VS Code 插件配置（详细）](#vs-code-插件配置详细)
- [插件参数与 Dify 节点映射](#插件参数与-dify-节点映射)
- [Agent 工具系统](#agent-工具系统)
- [知识库配置](#知识库配置)
- [项目结构](#项目结构)
- [全部配置项](#全部配置项)
- [常见问题](#常见问题)

---

## 功能特性

### 核心功能

| 功能 | 描述 |
|------|------|
| **AI 对话** | 侧边栏实时对话，流式输出，支持 Markdown 渲染和代码高亮 |
| **三种模式** | Ask（问答）、Plan（规划）、Agent（执行），Ctrl+. 快速切换 |
| **代码解释** | 选中代码，AI 逐行解析逻辑和关键变量 |
| **Bug 修复** | 分析代码问题，定位根因并提供修复方案 |
| **代码重构** | 优化代码结构，提取重复逻辑，提高可读性 |
| **代码生成** | 根据自然语言描述生成代码片段 |

### 高级功能

| 功能 | 描述 |
|------|------|
| **12 种工具** | read_file、write_file、edit_file、search_files、list_files、execute_command、create_directory、delete_file、move_file、get_diagnostics、insert_code、get_symbols |
| **Agent 工具循环** | AI 返回 tool block → 插件执行 → 结果发回 → AI 继续推理 |
| **Ghost Text** | Tab 接受内联补全建议，300ms 防抖，智能跳过字符串和注释 |
| **Inline Chat** | Ctrl+I 在编辑器内直接对话，Insert at Cursor 插入代码 |
| **@文件引用** | 输入 @ 触发文件搜索下拉，支持模糊匹配 |
| **斜杠命令** | /explain、/fix、/refactor、/test、/clear、/terminal、/knowledge 等 |
| **会话持久化** | 自动保存对话历史，支持多会话管理和多标签页 |
| **流式输出** | requestAnimationFrame 批量更新，用户上滚不强制拉回 |
| **工具执行可视化** | 工具调用过程实时显示 spinner、状态、结果折叠 |
| **Agent 推理展示** | 可查看 AI 的推理过程（thought） |

### 代码操作

| 操作 | 快捷键 |
|------|--------|
| 打开 AI 助手 | `Ctrl+Shift+D` / `Cmd+Shift+D` |
| 发送消息 | `Enter` |
| 换行 | `Shift+Enter` |
| 切换模式 | `Ctrl+.` |
| 内联对话 | `Ctrl+I` |
| 取消流式 | `Esc` |

---

## 快速开始

### 环境要求

- VS Code >= 1.85
- Node.js >= 16（从源码构建时需要）
- 已部署的 Dify 实例（本地或云端）

### 第一步：安装插件

**方式一：下载 VSIX 安装包（推荐）**

1. 从 [Releases](https://github.com/dirjaker/dify-code-assistant/releases) 下载最新 `dify-code-assistant-2.1.0.vsix`
2. VS Code 中按 `Ctrl+Shift+P`（Mac: `Cmd+Shift+P`）
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件

**方式二：从源码构建**

```bash
git clone https://github.com/dirjaker/dify-code-assistant.git
cd dify-code-assistant
npm install
npm run compile
npm run package
# 生成 dify-code-assistant-2.1.0.vsix
```

### 第二步：配置 Dify 平台

详见 [Dify 平台配置（详细）](#dify-平台配置详细)。

简要步骤：
1. 在 Dify 控制台导入 DSL 文件 `dify/vscode-code-assistant.yml`
2. 配置模型（推荐 DeepSeek V4 Pro）
3. 获取 API Key（`app-` 开头）

### 第三步：配置插件

在 VS Code 设置中填入 Dify 连接信息：

按 `Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`，添加：

```json
{
  "dify.apiUrl": "http://your-dify-server:port",
  "dify.apiKey": "app-your-api-key"
}
```

> **注意**：`dify.apiUrl` 填写基础地址即可，**不要** 加 `/v1` 后缀，插件会自动拼接。

### 第四步：开始使用

1. 点击左侧活动栏的 Dify AI 图标打开侧边栏
2. 在输入框中输入问题，按 Enter 发送
3. 使用 `@` 引用文件，`/` 使用斜杠命令

---

## Dify 平台配置（详细）

### 1. 部署 Dify 实例

如果你还没有 Dify 实例，参考 [Dify 官方文档](https://docs.dify.ai/getting-started/install-self-hosted) 部署：

```bash
# Docker Compose 部署（推荐）
git clone https://github.com/langgenius/dify.git
cd dify/docker
cp .env.example .env
docker compose up -d
```

部署完成后访问 `http://localhost/install` 完成初始化。

### 2. 配置模型供应商

在 Dify 控制台中配置 LLM 模型：

1. 进入 **设置** → **模型供应商**
2. 安装你需要的模型插件（推荐 DeepSeek）：
   - 点击 **DeepSeek** → **安装**
   - 填入 DeepSeek API Key
   - 保存

推荐模型：

| 模型 | 特点 | 适用场景 |
|------|------|----------|
| **deepseek-v4-pro** | 效果最好，推理能力强 | 复杂代码任务、架构设计 |
| **deepseek-v4-flash** | 速度快，成本低 | 简单问答、代码补全 |
| **deepseek-coder** | 代码专用 | 纯代码生成 |

### 3. 导入主应用 DSL

这是插件的核心 Dify 应用，提供 Chat 对话能力：

1. 在 Dify 控制台首页，点击右上角 **"+"** 按钮
2. 选择 **"导入 DSL 文件"**
3. 上传 `dify/vscode-code-assistant.yml`
4. 确认导入

导入后你会看到一个名为 **"VS Code Code Assistant"** 的 Chat 类型应用。

### 4. 修改主应用配置

进入应用后，需要调整以下配置：

#### 4.1 模型配置

1. 点击右上角 **"模型"** 区域
2. 选择你已配置的模型（如 `deepseek-v4-pro`）
3. 参数建议：
   - **Temperature**: `0.3`（代码任务需要确定性）
   - **Max Tokens**: `8192`（足够长的代码输出）
   - **Top P**: `1.0`

#### 4.2 System Prompt

DSL 中已预配置了 System Prompt（`pre_prompt` 字段），包含：
- 工具调用协议说明（` ```tool ` 格式）
- 12 种工具的使用方法和参数
- 回答规范（中文、Markdown、简洁专业）

你可以根据需要修改 System Prompt，但 **不要删除工具调用协议部分**，否则 Agent 工具循环将无法工作。

#### 4.3 开场白

已配置开场白（`opening_statement` 字段），用户打开插件时会看到欢迎信息。

#### 4.4 建议问题

已配置 4 个建议问题（`suggested_questions` 字段）：
- "Explain the project structure"
- "Find potential bugs in the current file"
- "Suggest improvements for this code"
- "Write tests for the selected function"

### 5. 获取 API Key

1. 进入应用 → 点击左侧 **"访问 API"**
2. 点击 **"创建新的 API Key"**
3. 复制 API Key（格式：`app-xxxxxxxx`）
4. 将此 Key 填入 VS Code 插件的 `dify.apiKey` 配置

### 6.（可选）导入 Workflow 应用

除了主 Chat 应用，还提供了 4 个 Workflow 应用，用于特定功能：

| Workflow | 文件 | 功能 | 插件调用方式 |
|----------|------|------|-------------|
| 代码补全 | `dify/workflows/code-completion.yml` | 根据上下文补全代码 | Ghost Text 自动触发 |
| 代码审查 | `dify/workflows/code-review.yml` | 分析代码质量、安全性、性能 | 右键菜单 → AI: Fix Code |
| 知识检索 | `dify/workflows/knowledge-retrieval.yml` | 查询项目知识库 | `/knowledge` 命令 |
| Spec 生成 | `dify/workflows/spec-generator.yml` | 生成需求规格文档 | `/spec` 命令 |

导入方式与主应用相同：**"+"** → **"导入 DSL 文件"** → 选择对应 yml 文件。

> **注意**：Workflow 应用需要单独获取 API Key，每个应用有独立的 Key。

---

## VS Code 插件配置（详细）

### 配置方式

有两种方式配置插件：

#### 方式一：Settings UI（推荐）

1. `Ctrl+Shift+P` → `Preferences: Open User Settings`
2. 搜索 `dify`
3. 在 UI 中填写各项配置

#### 方式二：settings.json

1. `Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`
2. 添加以下配置：

```json
{
  // ═══ 必填配置 ═══
  "dify.apiUrl": "http://your-dify-server:port",
  "dify.apiKey": "app-your-api-key",

  // ═══ 可选配置 ═══
  "dify.model": "deepseek-v4-pro",
  "dify.enableAutocomplete": true,
  "dify.enableRagCompletion": false,
  "dify.maxTokens": 8192
}
```

### 配置项详解

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dify.apiUrl` | string | `http://localhost:9000` | **必填**。Dify API 基础地址，不要加 `/v1` |
| `dify.apiKey` | string | — | **必填**。Dify 应用 API Key（`app-` 开头） |
| `dify.model` | string | `deepseek-coder` | 可选。模型名称，仅用于显示，实际由 Dify 侧决定 |
| `dify.enableAutocomplete` | boolean | `true` | 可选。是否启用 Ghost Text 内联补全 |
| `dify.enableRagCompletion` | boolean | `false` | 可选。是否使用 RAG 增强补全（需配置知识库） |
| `dify.maxTokens` | number | `2048` | 可选。最大响应 token 数 |

### 验证配置

配置完成后：

1. 打开侧边栏 Dify AI 面板
2. 发送一条测试消息，如 "你好"
3. 如果收到回复，说明配置正确
4. 如果报错，检查：
   - `dify.apiUrl` 是否可达（浏览器打开 `http://your-server/v1/parameters` 测试）
   - `dify.apiKey` 是否正确（`app-` 开头）
   - Dify 应用是否已发布（状态为"已发布"）

---

## 插件参数与 Dify 节点映射

### 主应用（vscode-code-assistant.yml）

这是一个 **Chat 类型** 应用，不使用 Workflow 节点，而是直接通过 Chat API 对话。

```
┌─────────────────────────────────────────────────────────────┐
│                    Dify Chat 应用                            │
│                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐ │
│  │  System Prompt│────→│   LLM 模型   │────→│   输出回答    │ │
│  │  (pre_prompt) │     │ (deepseek)   │     │              │ │
│  └──────────────┘     └──────┬───────┘     └──────────────┘ │
│                              │                               │
│                    ┌─────────▼─────────┐                    │
│                    │ 插件发送的消息      │                    │
│                    │ (query + context)  │                    │
│                    └───────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

**插件配置项与 Dify 的对应关系：**

| 插件配置 | 对应 Dify 位置 | 说明 |
|----------|---------------|------|
| `dify.apiUrl` | Dify 服务器地址 | 如 `http://localhost:80` 或 `https://your-dify.com` |
| `dify.apiKey` | 应用 → 访问 API → API Key | 格式 `app-xxxxxxxx` |
| `dify.model` | 应用 → 模型配置 → 模型名称 | 仅用于插件显示，实际模型由 Dify 侧决定 |
| `dify.maxTokens` | 应用 → 模型配置 → Max Tokens | 与 Dify 侧的 max_tokens 配置保持一致 |

### 插件发送给 Dify 的数据结构

当用户在插件中发送消息时，插件会构建如下请求：

```json
{
  "inputs": {
    "system_prompt": "你是一个专业的 AI 编程助手..."
  },
  "query": "用户消息 + 上下文信息",
  "response_mode": "streaming",
  "user": "vscode-user",
  "conversation_id": "已有的会话ID（续对话时）"
}
```

**其中：**

- `inputs.system_prompt` — 插件自动构建，包含工具调用协议、当前文件上下文、选中代码等
- `query` — 用户输入的消息，插件会自动附加：
  - 当前文件内容（前 50 行）
  - 选中的代码
  - 工作区文件列表
  - `@` 引用的文件内容

### Workflow 应用的参数映射

#### 代码补全（code-completion.yml）

```
开始节点变量：
┌────────────────┬──────────┬──────────────────────────────┐
│ 变量名          │ 类型      │ 插件如何填充                  │
├────────────────┼──────────┼──────────────────────────────┤
│ code_context   │ paragraph │ 光标前后的代码（前后各30行）    │
│ language       │ select    │ document.languageId           │
│ completion_type│ select    │ 自动检测（函数/类/代码块/行）   │
└────────────────┴──────────┴──────────────────────────────┘

LLM 节点：
┌────────────────┬──────────────────────────────────────────┐
│ 参数            │ 值                                        │
├────────────────┼──────────────────────────────────────────┤
│ 模型            │ deepseek-chat（需在 Dify 中配置）          │
│ Temperature    │ 0.3                                      │
│ Max Tokens     │ 2000                                     │
│ System Prompt  │ "你是一个专业的代码补全助手..."              │
└────────────────┴──────────────────────────────────────────┘

结束节点输出：
┌────────────────┬──────────────────────────────────────────┐
│ 输出变量        │ 来源                                      │
├────────────────┼──────────────────────────────────────────┤
│ completion_result │ llm-node.text（LLM 生成的补全代码）     │
└────────────────┴──────────────────────────────────────────┘
```

#### 代码审查（code-review.yml）

```
开始节点变量：
┌────────────────┬──────────┬──────────────────────────────┐
│ 变量名          │ 类型      │ 插件如何填充                  │
├────────────────┼──────────┼──────────────────────────────┤
│ code_content   │ paragraph │ 选中的代码或当前文件内容        │
│ language       │ select    │ document.languageId           │
│ review_type    │ select    │ "bug"/"security"/"performance"│
└────────────────┴──────────┴──────────────────────────────┘

流程：开始 → 分类器（判断审查类型） → 对应 LLM → 结束
```

#### 知识检索（knowledge-retrieval.yml）

```
开始节点变量：
┌────────────────┬──────────┬──────────────────────────────┐
│ 变量名          │ 类型      │ 插件如何填充                  │
├────────────────┼──────────┼──────────────────────────────┤
│ query          │ paragraph │ 用户查询内容                   │
│ language       │ select    │ 当前编辑器语言                 │
│ query_type     │ select    │ "问题解答"/"API查询"/"架构查询" │
│ project_context│ paragraph │ 当前文件上下文信息              │
└────────────────┴──────────┴──────────────────────────────┘

流程：开始 → 知识检索 → LLM 总结 → 结束
```

---

## Agent 工具系统

### 工作原理

插件实现了完整的 Agent 工具调用循环：

```
用户发消息
    │
    ▼
插件构建上下文 + System Prompt（含工具协议）
    │
    ▼
发送到 Dify Chat API（streaming）
    │
    ▼
Dify 返回回答
    │
    ├── 包含 ```tool 代码块？
    │       │
    │       ▼ 是
    │   解析 tool block → 提取工具名和参数
    │       │
    │       ▼
    │   调用本地工具服务器执行
    │       │
    │       ▼
    │   将结果格式化为 [Tool Result] 发回 Dify
    │       │
    │       └── 回到 "Dify 返回回答" ↑
    │
    └── 不包含 tool block？
            │
            ▼
        显示最终回答（完成）
```

### 12 种工具详解

| 工具 | 功能 | 参数 | 示例 |
|------|------|------|------|
| `read_file` | 读取文件内容（带行号） | `path`[必填], `start_line`, `end_line` | 读取 src/main.ts 第 1-50 行 |
| `write_file` | 创建或覆写文件 | `path`[必填], `content`[必填] | 创建新文件 |
| `edit_file` | **精确替换**文件中的文本 | `path`[必填], `old_text`[必填], `new_text`[必填] | 替换函数名 |
| `search_files` | 正则搜索代码 | `query`[必填], `include`, `exclude`, `max_results` | 搜索所有 .ts 中的 functionName |
| `list_files` | 列出目录结构 | `path`, `recursive`, `max_depth` | 列出 src/ 目录（2层深度） |
| `execute_command` | 执行 Shell 命令 | `command`[必填], `cwd`, `timeout` | 运行 npm test |
| `create_directory` | 创建目录 | `path`[必填] | 创建 src/utils/ |
| `delete_file` | 删除文件/目录 | `path`[必填], `recursive` | 删除旧文件 |
| `move_file` | 移动/重命名 | `source`[必填], `destination`[必填] | 重命名文件 |
| `get_diagnostics` | 获取诊断信息 | `path` | 获取当前文件的错误和警告 |
| `insert_code` | 在指定行插入代码 | `path`[必填], `line`[必填], `content`[必填], `position` | 在第 10 行后插入代码 |
| `get_symbols` | 提取文件中的符号 | `path`[必填] | 列出所有函数和类 |

### AI 如何调用工具

AI 在回答中使用 ` ```tool ` 代码块调用工具，格式如下：

````
```tool
tool_name: read_file
path: src/main.ts
start_line: 1
end_line: 50
```
````

插件解析后执行，结果以 `[Tool Result]` 格式发回 Dify，AI 继续推理。

支持多行值（如 `write_file` 的 `content`）：

````
```tool
tool_name: write_file
path: src/utils/helper.ts
content: export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
```
````

### 工具执行可视化

当 AI 调用工具时，插件会在聊天面板中显示：

- 🔧 **工具开始** — 显示工具名称和 loading spinner
- ✅ **工具成功** — 显示结果（截取前 500 字符）
- ❌ **工具失败** — 显示错误信息
- 💭 **Agent 推理** — 显示 AI 的思考过程（可折叠）

---

## 知识库配置

### 1. 建设知识库

使用脚本收集项目文档：

```bash
# 设置环境变量
export DIFY_API_KEY=app-xxxxxxxx

# 收集项目文档到 knowledge-base/ 目录
./scripts/build-knowledge-base.sh /path/to/your/project ./knowledge-base
```

脚本会自动收集：
- README.md、CHANGELOG.md 等文档
- package.json、requirements.txt 等依赖文件
- 目录结构
- 关键源代码文件

### 2. 上传到 Dify 知识库

```bash
# 上传到 Dify
./scripts/upload-to-dify.sh ./knowledge-base
```

### 3. 在 Dify 中关联知识库

1. 进入主应用设置
2. 点击 **"知识库"** 区域
3. 添加你刚上传的知识库
4. 设置检索模式：
   - **单路召回** — 适合小知识库
   - **多路召回** — 适合大知识库，精度更高

### 4. 在插件中使用

| 命令 | 功能 |
|------|------|
| `/knowledge <查询>` | 查询知识库 |
| `/api <API名称>` | 查询 API 文档 |
| `/arch` | 查询项目架构 |
| `/best <主题>` | 查询最佳实践 |

---

## 项目结构

```
dify-code-assistant/
├── src/                        # TypeScript 源代码
│   ├── extension.ts            # 插件入口，注册命令和视图
│   ├── chatPanel.ts            # 侧边栏 Webview 面板
│   ├── chatInlineProvider.ts   # Inline Chat provider（Ctrl+I）
│   ├── completionProvider.ts   # Ghost Text 补全提供者
│   ├── ragCompletionProvider.ts # RAG 增强补全提供者
│   ├── contextCollector.ts     # 上下文收集器
│   ├── workspaceIndexer.ts     # @workspace 全项目索引
│   ├── toolServer.ts           # 本地 HTTP 工具服务器（12工具）
│   ├── toolExecutor.ts         # 工具执行器（diff 确认流程）
│   ├── decorationManager.ts    # 编辑器装饰管理
│   ├── modeManager.ts          # 模式管理（ask/plan/agent）
│   ├── diffEngine.ts           # Diff 引擎
│   ├── fileSystem.ts           # 文件系统操作
│   ├── config.ts               # 配置管理
│   └── difyClient.ts           # Dify API 客户端
├── media/                      # Webview 前端资源
│   ├── main.js                 # 面板交互逻辑（1037 行）
│   └── main.css                # 面板样式（1691 行）
├── resources/                  # 插件图标
├── scripts/                    # 工具脚本
│   ├── build-knowledge-base.sh # 知识库建设脚本
│   └── upload-to-dify.sh       # 知识库上传脚本
├── dify/                       # Dify 平台配置
│   ├── vscode-code-assistant.yml # 主应用 DSL
│   └── workflows/              # Workflow 应用 DSL
│       ├── code-completion.yml
│       ├── code-review.yml
│       ├── knowledge-retrieval.yml
│       └── spec-generator.yml
├── docs/                       # 技术文档
├── package.json                # 项目配置和依赖
├── tsconfig.json               # TypeScript 编译配置
└── CHANGELOG.md                # 版本更新日志
```

---

## 全部配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dify.apiUrl` | string | `http://localhost:9000` | **必填**。Dify API 基础地址 |
| `dify.apiKey` | string | — | **必填**。Dify 应用 API Key（`app-` 开头） |
| `dify.model` | string | `deepseek-coder` | 模型名称（仅显示用） |
| `dify.enableAutocomplete` | boolean | `true` | 启用 Ghost Text 内联补全 |
| `dify.enableRagCompletion` | boolean | `false` | 启用 RAG 增强补全（需知识库） |
| `dify.maxTokens` | number | `2048` | 最大响应 token 数 |

---

## 常见问题

### Q: 插件报错 "Dify API URL is not configured"

A: 在 VS Code 设置中填入 `dify.apiUrl` 和 `dify.apiKey`。

### Q: 插件报错 "HTTP 401 Unauthorized"

A: `dify.apiKey` 不正确。确保格式为 `app-xxxxxxxx`，在 Dify 应用的 "访问 API" 页面获取。

### Q: 插件报错 "HTTP 404"

A: `dify.apiUrl` 地址不正确，或 Dify 应用未发布。检查：
1. URL 是否可达（浏览器打开测试）
2. Dify 应用状态是否为"已发布"
3. 不要加 `/v1` 后缀

### Q: AI 不调用工具

A: 确认以下几点：
1. 使用的是主应用 DSL（`vscode-code-assistant.yml`），不是 Workflow 应用
2. System Prompt 中包含工具调用协议（` ```tool ` 格式说明）
3. 使用 **Agent 模式**（Ctrl+. 切换）
4. 模型能力足够强（推荐 DeepSeek V4 Pro）

### Q: Ghost Text 补全不工作

A: 检查：
1. `dify.enableAutocomplete` 是否为 `true`
2. Dify 主应用是否正常工作（先测试对话功能）
3. 当前文件语言是否被支持

### Q: 流式输出卡顿

A: v2.0+ 已优化为 requestAnimationFrame 批量更新。如果仍然卡顿：
1. 检查网络延迟
2. 减小 `dify.maxTokens` 值
3. 使用更快的模型（如 deepseek-v4-flash）

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **插件框架** | VS Code Extension API |
| **UI 渲染** | Webview + 原生 HTML/CSS/JS |
| **通信协议** | Dify Chat API（blocking + streaming） |
| **工具调用** | 本地 HTTP 工具服务器 + tool block 解析 |
| **HTTP 客户端** | Node.js 原生 http/https 模块 |
| **开发语言** | TypeScript |
| **构建工具** | tsc + @vscode/vsce |

---

## 相关链接

- [Dify 官网](https://dify.ai)
- [Dify 文档](https://docs.dify.ai)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [GitHub Releases](https://github.com/dirjaker/dify-code-assistant/releases)

## 许可证

[MIT License](LICENSE)
