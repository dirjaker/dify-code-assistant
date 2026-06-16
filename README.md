<div align="center">

<img src="assets/banner.svg" width="100%" alt="Dify Code Assistant">

<br>

### 🤖 基于 Dify 的 VS Code AI 编程助手

[![Stars](https://img.shields.io/github/stars/dirjaker/dify-code-assistant?style=flat-square&label=Stars&color=FFD700)](https://github.com/dirjaker/dify-code-assistant/stargazers)
[![Forks](https://img.shields.io/github/forks/dirjaker/dify-code-assistant?style=flat-square&label=Forks&color=4A90D9)](https://github.com/dirjaker/dify-code-assistant/network/members)
[![Contributors](https://img.shields.io/github/contributors/dirjaker/dify-code-assistant?style=flat-square&label=Contributors&color=8B4513)](https://github.com/dirjaker/dify-code-assistant/graphs/contributors)
[![License](https://img.shields.io/github/license/dirjaker/dify-code-assistant?style=flat-square&label=License&color=20B2AA)](https://github.com/dirjaker/dify-code-assistant/blob/dev/LICENSE)
[![VS Code](https://img.shields.io/badge/VS_Code-1.85+-007ACC?style=flat-square&logo=visual-studio-code)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## ✨ 功能特性

| 功能 | 描述 |
|------|------|
| 💬 **AI 对话** | 侧边栏实时对话，支持 Markdown 渲染和代码高亮 |
| 📖 **代码解释** | 选中代码，AI 逐行解析逻辑和关键变量 |
| 🐛 **Bug 修复** | 分析代码问题，定位根因并提供修复方案 |
| ♻️ **代码重构** | 优化代码结构，提取重复逻辑，提高可读性 |
| ✨ **代码生成** | 根据自然语言描述生成代码片段 |
| 🔮 **内联补全** | 基于上下文的智能代码补全建议，500ms 防抖 |
| 📋 **一键复制** | 代码块快速复制到剪贴板或插入编辑器 |

## 🚀 快速开始

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

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **插件框架** | VS Code Extension API |
| **UI 渲染** | Webview + 原生 HTML/CSS/JS |
| **通信协议** | Dify Chat API（blocking + streaming） |
| **HTTP 客户端** | Node.js 原生 http/https 模块 |
| **开发语言** | TypeScript |
| **构建工具** | tsc + @vscode/vsce |

## 📖 使用方法

### AI 对话

| 操作 | 快捷键 |
|------|--------|
| 打开 AI 助手 | `Ctrl+Shift+D` / `Cmd+Shift+D` |
| 发送消息 | `Enter` |
| 换行 | `Shift+Enter` |

### 代码操作

1. 在编辑器中选中代码
2. 右键选择 AI 功能：
   - **AI: 解释代码** — 详细解释代码逻辑
   - **AI: 修复代码** — 找出并修复问题
   - **AI: 重构代码** — 优化代码结构
   - **AI: 生成代码** — 根据描述生成代码

## 🏗️ 项目结构

```
dify-code-assistant/
├── src/                        # TypeScript 源代码
│   ├── extension.ts            # 插件入口，注册命令和视图
│   ├── chatPanel.ts            # 侧边栏 Webview 面板
│   ├── completionProvider.ts   # 内联代码补全提供者
│   ├── config.ts               # 配置管理
│   └── difyClient.ts           # Dify API 客户端
├── media/                      # Webview 前端资源
│   ├── main.js                 # 面板交互逻辑
│   └── main.css                # 面板样式
├── resources/                  # 插件图标
├── assets/                     # 项目静态资源
├── dify/                       # Dify 平台配置（DSL 文件）
├── docs/                       # 技术文档
├── package.json                # 项目配置和依赖
├── tsconfig.json               # TypeScript 编译配置
└── CHANGELOG.md                # 版本更新日志
```

## 📝 开发日志

- [x] 侧边栏 AI 对话面板
- [x] 代码解释、修复、重构、生成
- [x] 内联代码补全
- [x] Webview CSP 安全策略
- [x] Dify DSL 预配置文件
- [x] 完整技术文档
- [ ] 流式响应实时输出
- [ ] 多模型切换支持
- [ ] 项目级代码索引

## ⚙️ 全部配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dify.apiUrl` | string | `http://localhost:9000` | Dify API 地址 |
| `dify.apiKey` | string | — | Dify 应用 API Key（`app-` 开头） |
| `dify.model` | string | `deepseek-v4-pro` | 使用的模型名称 |
| `dify.enableAutocomplete` | boolean | `true` | 是否启用内联代码补全 |
| `dify.maxTokens` | number | `4096` | 最大响应 token 数 |

## 🔗 相关链接

- [Dify 官网](https://dify.ai)
- [Dify 文档](https://docs.dify.ai)
- [VS Code Extension API](https://code.visualstudio.com/api)

## 📄 许可证

[MIT License](LICENSE)

---
