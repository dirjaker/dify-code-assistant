# Dify 平台配置指南

本目录包含配合 `dify-code-assistant` v2.1 插件使用的所有 Dify 配置文件。

## 文件说明

| 文件 | 类型 | 说明 |
|------|------|------|
| `vscode-code-assistant.yml` | Chat 应用 | **主应用**，提供 AI 对话、Agent 工具调用能力 |
| `workflows/code-completion.yml` | Workflow 应用 | 代码补全工作流 |
| `workflows/code-review.yml` | Workflow 应用 | 代码审查工作流（Bug/安全/性能分类审查） |
| `workflows/knowledge-retrieval.yml` | Workflow 应用 | 知识库检索工作流 |
| `workflows/spec-generator.yml` | Workflow 应用 | 需求规格文档生成工作流 |

## 完整配置流程

### 1. 部署 Dify

```bash
# Docker Compose 部署
git clone https://github.com/langgenius/dify.git
cd dify/docker
cp .env.example .env
docker compose up -d

# 访问 http://localhost/install 完成初始化
```

### 2. 配置模型供应商

1. 进入 Dify 控制台 → **设置** → **模型供应商**
2. 安装 DeepSeek 插件 → 填入 API Key → 保存
3. 推荐模型：`deepseek-v4-pro`（效果最好）

### 3. 导入主应用

1. 控制台首页 → 点击右上角 **"+"**
2. 选择 **"导入 DSL 文件"**
3. 上传 `vscode-code-assistant.yml`
4. 确认导入

导入后进入应用，需要调整：

#### 3.1 模型配置

- 点击右上角 **"模型"** 区域
- 选择 `deepseek-v4-pro`
- Temperature: `0.3`，Max Tokens: `8192`

#### 3.2 System Prompt

DSL 中已预配置（`pre_prompt` 字段），包含：
- 12 种工具的调用格式说明
- 回答规范

**重要**：不要删除工具调用协议部分，否则 Agent 工具循环无法工作。

#### 3.3 获取 API Key

1. 进入应用 → 左侧 **"访问 API"**
2. **"创建新的 API Key"**
3. 复制 Key（格式 `app-xxxxxxxx`）

### 4. 配置 VS Code 插件

在 VS Code 设置中：

```json
{
  "dify.apiUrl": "http://your-dify-server:port",
  "dify.apiKey": "app-xxxxxxxx"
}
```

### 5.（可选）导入 Workflow 应用

每个 Workflow 应用需要单独导入和获取 API Key：

1. 同样方式导入 `workflows/` 下的 yml 文件
2. 每个 Workflow 应用有独立的 API Key
3. 在 Workflow 的开始节点中配置模型

## 主应用节点说明

主应用是 **Chat 类型**，不使用 Workflow 节点图，直接通过 Chat API 对话。

### System Prompt 中的工具协议

System Prompt 定义了 12 种工具的调用格式。AI 在回答中使用 ` ```tool ` 代码块调用工具：

````
```tool
tool_name: read_file
path: src/main.ts
start_line: 1
end_line: 50
```
````

插件解析执行后，结果以 `[Tool Result]` 格式发回。

### 模型参数建议

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| Temperature | 0.1-0.3 | 代码任务需要确定性 |
| Max Tokens | 4096-8192 | 足够长的代码输出 |
| Top P | 1.0 | 默认即可 |
| Frequency Penalty | 0 | 代码任务不需要 |
| Presence Penalty | 0 | 代码任务不需要 |

## Workflow 应用节点说明

### 代码补全（code-completion.yml）

```
开始 → LLM → 结束

开始节点变量：
  - code_context (paragraph) — 代码上下文
  - language (select) — 语言类型
  - completion_type (select) — 补全类型

LLM 节点：
  - 模型: deepseek-chat
  - Temperature: 0.3
  - Max Tokens: 2000

结束节点输出：
  - completion_result ← llm-node.text
```

### 代码审查（code-review.yml）

```
开始 → 分类器 → [Bug LLM / 安全 LLM / 性能 LLM] → 结束

开始节点变量：
  - code_content (paragraph) — 代码内容
  - language (select) — 语言类型
  - review_type (select) — 审查类型

分类器节点：
  - 根据 review_type 分类到不同的 LLM 节点

结束节点输出：
  - review_result ← 对应 LLM 的输出
```

### 知识检索（knowledge-retrieval.yml）

```
开始 → 知识检索 → LLM 总结 → 结束

开始节点变量：
  - query (paragraph) — 查询内容
  - language (select) — 语言类型
  - query_type (select) — 查询类型
  - project_context (paragraph) — 项目上下文

知识检索节点：
  - 关联已创建的知识库
  - 检索模式: 单路/多路召回

LLM 节点：
  - 根据检索结果生成回答

结束节点输出：
  - answer ← llm-node.text
```

## 工具系统说明（v2.1.0）

v2.1.0 统一了工具执行架构：

- **所有 12 个工具** 统一通过 `toolServer.ts`（本地 HTTP 工具服务器）执行
- 旧的 5 工具实现（toolExecutor）已删除，只保留 diff 确认流程
- 工具服务器支持 Bearer Token 认证和 CORS 限制

### 工具调用协议

AI 在回答中使用 ` ```tool ` 代码块调用工具：

````markdown
```tool
tool_name: read_file
path: src/main.ts
start_line: 1
end_line: 50
```
````

插件解析执行后，结果以 `[Tool Result]` 格式发回。

### 12 种工具

| 工具 | 功能 |
|------|------|
| `read_file` | 读取文件内容（带行号） |
| `write_file` | 创建或覆写文件 |
| `edit_file` | 精确替换文件中的文本 |
| `search_files` | 正则搜索代码 |
| `list_files` | 列出目录结构 |
| `execute_command` | 执行 Shell 命令 |
| `create_directory` | 创建目录 |
| `delete_file` | 删除文件/目录 |
| `move_file` | 移动/重命名 |
| `get_diagnostics` | 获取诊断信息 |
| `insert_code` | 在指定行插入代码 |
| `get_symbols` | 提取文件中的符号 |

## 自定义修改

你可以修改 DSL 文件中的：

| 修改内容 | 对应字段 | 说明 |
|----------|----------|------|
| System Prompt | `pre_prompt` | AI 行为和回答风格 |
| 模型参数 | `completion_params` | temperature、max_tokens |
| 开场白 | `opening_statement` | 用户打开插件时的欢迎信息 |
| 建议问题 | `suggested_questions` | 面板上显示的快捷提问 |
| 工具列表 | System Prompt 中的工具说明 | 添加/删除/修改工具 |

修改后需要重新导入 DSL（删除旧应用 → 重新导入），或在 Dify 控制台中直接编辑。

## 推荐模型

| 模型 | 特点 | 推荐场景 |
|------|------|----------|
| DeepSeek V4 Pro | 效果最好 | 复杂代码任务 |
| DeepSeek V4 Flash | 速度快 | 简单问答、补全 |
| DeepSeek Coder | 代码专用 | 纯代码生成 |
| GPT-4o | 多模态 | 需要图片理解时 |
| Claude 3.5 Sonnet | 长上下文 | 大文件分析 |
