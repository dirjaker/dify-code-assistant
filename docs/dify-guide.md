# Dify 配置指南

本指南帮助你配置 Dify 平台，使其与 `dify-code-assistant` v2.1 插件配合工作。

## 目录

1. [创建 Dify 应用](#1-创建-dify-应用)
2. [配置提示词](#2-配置提示词prompt)
3. [配置输入变量](#3-配置输入变量)
4. [获取 API 凭证](#4-获取-api-凭证)
5. [配置 VS Code 插件](#5-配置-vs-code-插件)
6. [推荐模型](#6-推荐模型)
7. [高级功能：Workflow 应用](#7-高级功能workflow-应用)
8. [高级功能：知识库集成](#8-高级功能知识库集成)
9. [常见问题](#9-常见问题)
10. [自定义修改](#10-自定义修改)

---

## 1. 创建 Dify 应用

### 方式 A：导入 DSL 文件（推荐）

1. 登录你的 Dify 控制台
2. 点击右上角 "+" 按钮
3. 选择"导入 DSL 文件"
4. 上传 `dify/vscode-code-assistant.yml`
5. 导入后进入应用设置，选择你已配置的模型

导入后你会看到一个名为 **"VS Code Code Assistant"** 的 Chat 类型应用。

### 方式 B：手动创建

1. 登录 Dify 控制台
2. 点击"创建应用" → 选择 **聊天助手（Chat）** 或 **Agent**
3. 推荐使用 **Agent** 模式，支持自动调用工具（如代码解释器）

## 2. 配置提示词（Prompt）

在应用的"提示词"编辑区，建议使用以下 System Prompt：

```text
你是一个专业的 AI 编程助手。请根据用户提供的【代码上下文】和【问题】进行回答。

回答要求：
1. 如果用户询问代码解释，请使用中文逐行解释逻辑，标注关键变量和函数作用。
2. 如果用户要求修改代码，请直接输出完整的代码块（Markdown 格式），并标注语言类型。
3. 如果用户要求调试，请分析错误信息，定位根因，给出修复方案。
4. 如果用户要求重构，请优化代码结构，提取重复逻辑，说明改进点。
5. 保持回答简洁、专业，默认使用中文，代码注释也使用中文。
6. 涉及多个文件时，按文件名分组展示。
```

> **重要**：如果使用 DSL 文件导入，System Prompt 中已包含 12 种工具的调用协议（` ```tool ` 格式）。**不要删除工具调用协议部分**，否则 Agent 工具循环将无法工作。

## 3. 配置输入变量

插件通过 API 发送 `inputs` 对象。保持默认的 `query` 输入即可，插件会自动处理上下文拼接。

插件发送给 Dify 的数据结构：

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

其中 `query` 会自动附加当前文件内容（前 50 行）、选中代码、工作区文件列表和 `@` 引用的文件内容。

## 4. 获取 API 凭证

1. 在应用页面左侧菜单，点击 **"访问 API"**
2. 点击 **"创建新的 API Key"**
3. 复制 **API Secret Key**（以 `app-` 开头）
4. 将此 Key 填入 VS Code 插件的 `dify.apiKey` 配置

## 5. 配置 VS Code 插件

在 VS Code 设置中（`Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`）：

```json
{
  "dify.apiUrl": "http://your-dify-server:port",
  "dify.apiKey": "app-your-api-key",
  "dify.model": "deepseek-v4-pro"
}
```

> **注意**：`dify.apiUrl` 填写基础地址即可，**不要** 加 `/v1` 后缀，插件会自动拼接为 `/v1/chat-messages`。

### 全部配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dify.apiUrl` | string | `http://localhost:9000` | **必填**。Dify API 基础地址 |
| `dify.apiKey` | string | — | **必填**。Dify 应用 API Key（`app-` 开头） |
| `dify.model` | string | `deepseek-coder` | 模型名称（仅显示用，实际由 Dify 侧决定） |
| `dify.enableAutocomplete` | boolean | `true` | 启用 Ghost Text 内联补全 |
| `dify.enableRagCompletion` | boolean | `false` | 启用 RAG 增强补全（需知识库） |
| `dify.maxTokens` | number | `2048` | 最大响应 token 数 |

### 验证配置

配置完成后：
1. 打开侧边栏 Dify AI 面板
2. 发送一条测试消息，如 "你好"
3. 如果收到回复，说明配置正确

## 6. 推荐模型

| 模型 | 特点 | 适用场景 |
|------|------|----------|
| DeepSeek V4 Pro | 效果最好，推理能力强 | 复杂代码分析、架构设计、重构 |
| DeepSeek V4 Flash | 响应速度快，成本低 | 日常问答、简单补全 |
| DeepSeek Coder | 代码专用 | 纯代码生成 |

### 温度参数建议

| 温度值 | 特点 | 适用场景 |
|--------|------|----------|
| 0.1 - 0.3 | 确定性高，输出稳定 | 代码补全、Bug 修复 |
| 0.4 - 0.7 | 平衡创造性和准确性 | 通用对话 |
| 0.8 - 1.0 | 创造性强 | 生成新代码、头脑风暴 |

## 7. 高级功能：Workflow 应用

除了主 Chat 应用，还提供了 4 个 Workflow 应用，用于特定功能：

| Workflow | 文件 | 功能 | 插件调用方式 |
|----------|------|------|-------------|
| 代码补全 | `dify/workflows/code-completion.yml` | 根据上下文补全代码 | Ghost Text 自动触发 |
| 代码审查 | `dify/workflows/code-review.yml` | 分析代码质量、安全性、性能 | 右键菜单 → AI: Fix Code |
| 知识检索 | `dify/workflows/knowledge-retrieval.yml` | 查询项目知识库 | `/knowledge` 命令 |
| Spec 生成 | `dify/workflows/spec-generator.yml` | 生成需求规格文档 | `/spec` 命令 |

导入方式与主应用相同：**"+"** → **"导入 DSL 文件"** → 选择对应 yml 文件。

> **注意**：每个 Workflow 应用需要单独获取 API Key，每个应用有独立的 Key。

## 8. 高级功能：知识库集成

在 Dify 中创建 **知识库（Dataset）**，上传项目文档或代码索引，并在应用中关联该知识库。插件提供以下命令查询知识库：

| 命令 | 功能 |
|------|------|
| `/knowledge <查询>` | 查询知识库 |
| `/api <API名称>` | 查询 API 文档 |
| `/arch` | 查询项目架构 |
| `/best <主题>` | 查询最佳实践 |

知识库建设脚本：
```bash
# 收集项目文档
./scripts/build-knowledge-base.sh /path/to/your/project ./knowledge-base

# 上传到 Dify
./scripts/upload-to-dify.sh ./knowledge-base
```

## 9. 常见问题

**Q: 返回 "Connection Refused"**
A: 检查 Dify Docker 服务是否正在运行，端口映射是否正确。插件会在错误消息中给出具体排查步骤。

**Q: 返回 404**
A: 检查 `dify.apiUrl` 是否正确。不要包含 `/v1`，插件会自动拼接。同时确认 Dify 应用已发布。

**Q: 返回 401 Unauthorized**
A: `dify.apiKey` 不正确。确保格式为 `app-xxxxxxxx`，在 Dify 应用的 "访问 API" 页面获取。

**Q: 如何让 AI 理解整个项目？**
A: 在 Dify 中创建 **知识库（Dataset）**，上传项目文档或代码索引，并在应用中关联该知识库。

**Q: 响应很慢**
A: 检查模型配置和服务器性能。可以切换到更快的模型（如 DeepSeek V4 Flash），或降低 `dify.maxTokens` 值。

**Q: AI 不调用工具**
A: 确认使用的是主应用 DSL（`vscode-code-assistant.yml`），System Prompt 中包含工具调用协议，并使用 Agent 模式（`Ctrl+.` 切换）。

## 10. 自定义修改

你可以根据需求修改 DSL 文件中的：

1. **System Prompt**（`pre_prompt` 字段）— 修改 AI 行为和回答风格
2. **模型参数**（`completion_params` 字段）— 调整 temperature、max_tokens
3. **开场白**（`opening_statement` 字段）— 修改 AI 自我介绍
4. **建议问题**（`suggested_questions` 字段）— 面板上显示的快捷提问
5. **工具列表**（System Prompt 中的工具说明）— 添加/删除/修改工具

修改后重新导入 DSL（删除旧应用 → 重新导入），或在 Dify 控制台中直接编辑。
