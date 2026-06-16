# Dify 配置指南

本指南帮助你配置 Dify 平台，使其与 `dify-code-assistant` 插件配合工作。

## 1. 创建 Dify 应用

### 方式 A：导入 DSL 文件（推荐）

1. 登录你的 Dify 控制台
2. 点击右上角 "+" 按钮
3. 选择"导入 DSL 文件"
4. 上传 `dify/vscode-code-assistant.yml`
5. 导入后进入应用设置，选择你已配置的模型

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

## 3. 配置输入变量

插件通过 API 发送 `inputs` 对象。保持默认的 `query` 输入即可，插件会自动处理上下文拼接。

无需手动添加复杂变量。

## 4. 获取 API 凭证

1. 在应用页面左侧菜单，点击 **"访问 API"**
2. 复制 **API Base URL**（例如 `http://your-server:9000`）
3. 创建并复制 **API Secret Key**（以 `app-` 开头）

## 5. 配置 VS Code 插件

在 VS Code 设置中（`Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`）：

```json
{
  "dify.apiUrl": "http://your-dify-server:port",
  "dify.apiKey": "app-your-api-key",
  "dify.model": "your-model-name"
}
```

> **注意**：`dify.apiUrl` 填写基础地址即可，**不要** 加 `/v1` 后缀，插件会自动拼接为 `/v1/chat-messages`。

## 6. 推荐模型

| 模型 | 特点 | 适用场景 |
|------|------|----------|
| DeepSeek V4 Pro | 效果最好，推理能力强 | 复杂代码分析、重构 |
| DeepSeek V4 Flash | 响应速度快 | 日常问答、简单补全 |
| DeepSeek Coder | 代码专用 | 代码补全、生成 |

### 温度参数建议

| 温度值 | 特点 | 适用场景 |
|--------|------|----------|
| 0.1 - 0.3 | 确定性高，输出稳定 | 代码补全、Bug 修复 |
| 0.4 - 0.7 | 平衡创造性和准确性 | 通用对话 |
| 0.8 - 1.0 | 创造性强 | 生成新代码、头脑风暴 |

## 7. 高级功能：工具集成

在 Dify Agent 模式下，可开启以下工具增强能力：

- **Web Search** — 联网搜索最新技术文档和 API 变更
- **Code Interpreter** — 运行 Python 代码验证算法逻辑

## 8. 常见问题

**Q: 返回 "Connection Refused"**
A: 检查 Dify Docker 服务是否正在运行，端口映射是否正确。

**Q: 返回 404**
A: 检查 `dify.apiUrl` 是否正确。不要包含 `/v1`，插件会自动拼接。

**Q: 如何让 AI 理解整个项目？**
A: 在 Dify 中创建 **知识库（Dataset）**，上传项目文档或代码索引，并在应用中关联该知识库。

**Q: 响应很慢**
A: 检查模型配置和服务器性能。可以切换到更快的模型（如 DeepSeek V4 Flash），或降低 `dify.maxTokens` 值。

## 9. 自定义修改

你可以根据需求修改 DSL 文件中的：

1. **System Prompt**（`pre_prompt` 字段）— 修改 AI 行为和回答风格
2. **模型参数**（`completion_params` 字段）— 调整 temperature、max_tokens
3. **开场白**（`opening_statement` 字段）— 修改 AI 自我介绍

修改后重新导入 DSL 即可生效。
