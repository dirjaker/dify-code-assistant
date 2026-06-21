<div align="center">

<img src="assets/banner.png" width="100%" alt="Dify Code Assistant">

<br>

### 基于 Dify 的 VS Code AI 编程助手 · v2.0

[![Stars](https://img.shields.io/github/stars/dirjaker/dify-code-assistant?style=flat-square&label=Stars&color=FFD700)](https://github.com/dirjaker/dify-code-assistant/stargazers)
[![Forks](https://img.shields.io/github/forks/dirjaker/dify-code-assistant?style=flat-square&label=Forks&color=4A90D9)](https://github.com/dirjaker/dify-code-assistant/network/members)
[![License](https://img.shields.io/github/license/dirjaker/dify-code-assistant?style=flat-square&label=License&color=20B2AA)](https://github.com/dirjaker/dify-code-assistant/blob/dev/LICENSE)
[![VS Code](https://img.shields.io/badge/VS_Code-1.85+-007ACC?style=flat-square&logo=visual-studio-code)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

</div>

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
| **Agent 工具调用** | Dify Agent 原生工具调用，支持 read_file、edit_file、run_process 等 6 种工具 |
| **Ghost Text** | Tab 接受内联补全建议，500ms 防抖，智能跳过字符串和注释 |
| **Inline Chat** | Ctrl+I 在编辑器内直接对话，Insert at Cursor 插入代码 |
| **@workspace** | 全项目索引（4层深度），检测项目类型、依赖和结构 |
| **@文件引用** | 输入 @ 触发文件搜索下拉，支持模糊匹配和文件大小显示 |
| **斜杠命令** | /explain、/fix、/refactor、/test、/clear、/terminal 等快捷命令 |
| **会话持久化** | 自动保存对话历史，支持多会话管理和切换 |
| **内联编辑** | Edit 按钮打开编辑器，diff 预览，Apply 写入文件 |
| **终端执行** | Run 按钮执行 Shell/Python 命令，自动检测语言类型 |
| **流式输出** | 实时逐 chunk 输出，零频闪，智能滚动（用户上滚不强制拉回） |

### 代码操作

| 操作 | 快捷键 |
|------|--------|
| 打开 AI 助手 | `Ctrl+Shift+D` / `Cmd+Shift+D` |
| 发送消息 | `Enter` |
| 换行 | `Shift+Enter` |
| 切换模式 | `Ctrl+.` |
| 内联对话 | `Ctrl+I` |
| 取消流式 | `Esc` |

## 快速开始

### 环境要求

- VS Code >= 1.85
- Node.js >= 16
- 已部署的 Dify 实例

### 安装步骤

**方式一：下载 VSIX 安装包（推荐）**

1. 从 [Releases](https://github.com/dirjaker/dify-code-assistant/releases) 下载最新 `.vsix` 文件
2. VS Code 中按 `Ctrl+Shift+P`（Mac: `Cmd+Shift+P`）
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件

**方式二：从源码构建**

```bash
# 克隆项目
git clone https://github.com/dirjaker/dify-code-assistant.git
cd dify-code-assistant

# 安装依赖
npm install

# 编译
npm run compile

# 打包
npm run package
```

### 配置插件

按 `Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`，添加：

```json
{
  "dify.apiUrl": "http://your-dify-server:port",
  "dify.apiKey": "app-your-api-key",
  "dify.model": "your-model-name"
}
```

> **注意**：`dify.apiUrl` 填写基础地址即可，**不要** 加 `/v1` 后缀，插件会自动拼接。

Dify 应用配置详见 [Dify 配置指南](docs/dify-guide.md)，也可直接导入预配置 DSL 文件 `dify/vscode-code-assistant.yml`。

## 技术栈

| 层级 | 技术 |
|------|------|
| **插件框架** | VS Code Extension API |
| **UI 渲染** | Webview + 原生 HTML/CSS/JS |
| **通信协议** | Dify Chat API（blocking + streaming） |
| **工具调用** | Dify Agent 原生工具调用（HTTP 本地服务器） |
| **HTTP 客户端** | Node.js 原生 http/https 模块 |
| **开发语言** | TypeScript |
| **构建工具** | tsc + @vscode/vsce |

## Agent 工具调用

插件支持 Dify Agent 原生工具调用，扩展会在本地启动一个 HTTP 工具服务器，Dify Agent 可以调用以下工具：

| 工具 | 功能 | 参数 |
|------|------|------|
| `read_file` | 读取文件内容 | `path`, `start_line`, `end_line` |
| `edit_file` | 创建/覆盖文件 | `path`, `content` |
| `run_process` | 执行终端命令并捕获输出 | `command`, `cwd`, `timeout` |
| `run_terminal` | 在 VS Code 终端执行命令 | `command`, `cwd` |
| `list_files` | 列出目录文件 | `path` |
| `search_code` | 搜索代码内容 | `query`, `include`, `max_results` |

### 工作流程

1. 扩展启动时自动启动本地工具服务器（随机端口）
2. 扩展自动向 Dify 注册工具提供者
3. 用户发送消息时，Dify Agent 决定是否需要调用工具
4. 如果需要，Agent 通过 HTTP 调用本地工具服务器
5. 工具服务器在 VS Code 环境中执行操作并返回结果
6. Agent 根据结果继续对话

### 测试工具服务器

```bash
# 查看工具服务器端口（在 VS Code Output Channel 中）
# 然后测试
./scripts/test-tools.sh <PORT>
```

## 项目结构

```
dify-code-assistant/
├── src/                        # TypeScript 源代码
│   ├── extension.ts            # 插件入口，注册命令和视图
│   ├── chatPanel.ts            # 侧边栏 Webview 面板
│   ├── chatInlineProvider.ts   # Inline Chat provider（Ctrl+I）
│   ├── completionProvider.ts   # Ghost Text 补全提供者
│   ├── workspaceIndexer.ts     # @workspace 全项目索引
│   ├── toolExecutor.ts         # 工具执行器（读写文件、终端）
│   ├── toolServer.ts           # 本地 HTTP 工具服务器（Agent 调用）
│   ├── decorationManager.ts    # 编辑器装饰管理
│   ├── modeManager.ts          # 模式管理（ask/plan/agent）
│   ├── diffEngine.ts           # Diff 引擎
│   ├── fileSystem.ts           # 文件系统操作
│   ├── config.ts               # 配置管理
│   └── difyClient.ts           # Dify API 客户端
├── media/                      # Webview 前端资源
│   ├── main.js                 # 面板交互逻辑
│   └── main.css                # 面板样式
├── resources/                  # 插件图标
├── scripts/                    # 工具脚本
│   ├── register-tools.sh       # 注册工具到 Dify
│   └── test-tools.sh           # 测试工具服务器
├── assets/                     # 项目静态资源
├── dify/                       # Dify 平台配置（DSL 文件）
├── docs/                       # 技术文档
├── package.json                # 项目配置和依赖
├── tsconfig.json               # TypeScript 编译配置
└── CHANGELOG.md                # 版本更新日志
```

## 全部配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dify.apiUrl` | string | `http://localhost:9000` | Dify API 地址 |
| `dify.apiKey` | string | — | Dify 应用 API Key（`app-` 开头） |
| `dify.model` | string | `deepseek-v4-pro` | 使用的模型名称 |
| `dify.enableAutocomplete` | boolean | `true` | 是否启用 Ghost Text 补全 |
| `dify.maxTokens` | number | `8192` | 最大响应 token 数 |

## 相关链接

- [Dify 官网](https://dify.ai)
- [Dify 文档](https://docs.dify.ai)
- [VS Code Extension API](https://code.visualstudio.com/api)

## 许可证

[MIT License](LICENSE)

---
