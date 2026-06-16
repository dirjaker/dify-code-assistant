# Dify 应用配置

本目录包含配合 `dify-code-assistant` 插件使用的 Dify 应用配置文件。

## 文件说明

| 文件 | 说明 |
|------|------|
| `vscode-code-assistant.yml` | VS Code 代码助手应用的 DSL 配置文件 |

## 导入方法

### 1. 登录 Dify 控制台

打开你的 Dify 实例管理后台。

### 2. 导入应用

1. 点击右上角 "+" 按钮
2. 选择"导入 DSL 文件"
3. 上传 `vscode-code-assistant.yml`
4. 确认导入

### 3. 配置模型

导入后需要手动配置模型：

1. 进入应用设置
2. 在"模型"部分选择你已配置的模型（如 DeepSeek）
3. 保存配置

### 4. 获取 API Key

1. 进入应用 → "访问 API"
2. 创建新的 API Key
3. 复制 API Key（格式：`app-xxxxxxxx`）

### 5. 配置 VS Code 插件

在 VS Code 设置中填入：

```json
{
  "dify.apiUrl": "http://your-dify-server:port",
  "dify.apiKey": "app-your-api-key",
  "dify.model": "your-model-name"
}
```

> **注意**：`dify.apiUrl` 填写基础地址即可，不要加 `/v1` 后缀。

## DSL 配置说明

### System Prompt 特性

- **代码解释** — 逐行解释逻辑，标注关键变量
- **代码补全** — 遵循项目风格，添加类型注解
- **Debug 调试** — 分析错误信息，定位根因
- **代码重构** — 优化结构，提取重复逻辑
- **回答规范** — Markdown 格式，中文回答

### 推荐模型

- DeepSeek V4 Pro（推荐，效果最好）
- DeepSeek V4 Flash（快速，适合简单任务）
- DeepSeek Coder（代码专用）

### 温度设置

- **0.1 - 0.3** — 确定性输出，适合代码补全
- **0.4 - 0.7** — 平衡创造性和准确性
- **0.8 - 1.0** — 创造性强，适合生成新代码

## 自定义修改

你可以修改 DSL 文件中的：

1. **System Prompt**（`pre_prompt` 字段）— AI 行为和回答风格
2. **模型参数**（`completion_params` 字段）— temperature、max_tokens
3. **开场白**（`opening_statement` 字段）— AI 自我介绍

修改后重新导入 DSL 即可生效。
