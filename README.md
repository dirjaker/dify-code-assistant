# Dify Code Assistant

<p align="center">
  <img src="assets/banner.svg" alt="Dify Code Assistant" width="100%">
</p>

<p align="center">
  <strong>基于 Dify 平台的 VS Code AI 编程助手</strong>
</p>

<p align="center">
  <a href="#功能特性">功能</a> •
  <a href="#安装">安装</a> •
  <a href="#配置">配置</a> •
  <a href="#使用方法">使用</a> •
  <a href="#开发">开发</a> •
  <a href="#许可证">许可</a>
</p>

---

## 功能特性

| 功能 | 说明 |
|------|------|
| **AI 对话** | 侧边栏实时对话，支持 Markdown 渲染和代码高亮 |
| **代码解释** | 选中代码，AI 逐行解析逻辑和关键变量 |
| **Bug 修复** | 分析代码问题，定位根因并提供修复方案 |
| **代码重构** | 优化代码结构，提取重复逻辑，提高可读性 |
| **代码生成** | 根据自然语言描述生成代码片段 |
| **内联补全** | 基于上下文的智能代码补全建议 |
| **一键复制** | 代码块右上角快速复制，支持插入到编辑器 |

## 安装

### 方式一：下载 VSIX 安装包（推荐）

1. 从 [Releases](https://github.com/dirjaker/dify-code-assistant/releases) 下载最新 `.vsix` 文件
2. VS Code 中按 `Ctrl+Shift+P`（Mac: `Cmd+Shift+P`）
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件

### 方式二：从源码构建

```bash
git clone https://github.com/dirjaker/dify-code-assistant.git
cd dify-code-assistant
npm install
npm run compile
npm run package
```

构建完成后在项目根目录生成 `dify-code-assistant-1.0.0.vsix` 文件。

## 配置

### 前置条件

- 已部署 Dify 实例（参考 [Dify 官方文档](https://docs.dify.ai)）
- 在 Dify 中创建聊天应用并获取 API Key

### 快速配置

按 `Ctrl+Shift+P` → 输入 `Preferences: Open User Settings (JSON)`，添加：

```json
{
  "dify.apiUrl": "http://your-dify-server:port",
  "dify.apiKey": "app-your-api-key",
  "dify.model": "your-model-name"
}
```

> **注意**：`dify.apiUrl` 填写 Dify 的基础地址即可，**不要** 加 `/v1` 后缀，插件会自动拼接。

### 全部配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dify.apiUrl` | string | `http://localhost:9000` | Dify API 地址 |
| `dify.apiKey` | string | — | Dify 应用 API Key（`app-` 开头） |
| `dify.model` | string | `deepseek-v4-pro` | 使用的模型名称 |
| `dify.enableAutocomplete` | boolean | `true` | 是否启用内联代码补全 |
| `dify.maxTokens` | number | `4096` | 最大响应 token 数 |

也可以通过命令面板 `Ctrl+Shift+P` → `Dify: Settings` 打开设置界面。

### Dify 应用配置

详细的应用创建和 Prompt 配置指南，请参考 [Dify 配置指南](docs/dify-guide.md)。

本项目提供了预配置的 DSL 文件，可直接导入 Dify：

1. 登录 Dify 控制台
2. 点击 "+" → "导入 DSL 文件"
3. 选择 `dify/vscode-code-assistant.yml`
4. 获取应用的 API Key

## 使用方法

### 打开 AI 助手

- 点击左侧活动栏的 **Dify AI** 图标
- 或按快捷键 `Ctrl+Shift+D`（Mac: `Cmd+Shift+D`）

### 对话功能

1. 在输入框输入问题
2. 点击 **发送按钮** 或按 **Enter** 发送
3. **Shift+Enter** 可换行输入多行内容

### 代码操作

1. 在编辑器中选中代码
2. 右键选择 AI 功能：
   - **AI: 解释代码** — 详细解释代码逻辑
   - **AI: 修复代码** — 找出并修复问题
   - **AI: 重构代码** — 优化代码结构
   - **AI: 生成代码** — 根据描述生成代码

### 快捷键

| 操作 | Windows/Linux | macOS |
|------|---------------|-------|
| 打开 AI 助手 | `Ctrl+Shift+D` | `Cmd+Shift+D` |
| 发送消息 | `Enter` | `Enter` |
| 换行 | `Shift+Enter` | `Shift+Enter` |

## 项目结构

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
│   ├── icon.png                # 插件图标（PNG）
│   ├── icon.svg                # 插件图标（SVG）
│   └── sidebar-icon.svg        # 侧边栏图标
├── assets/                     # 项目静态资源
│   └── banner.svg              # README Banner
├── dify/                       # Dify 平台配置
│   ├── README.md               # Dify 配置说明
│   └── vscode-code-assistant.yml  # 预配置 DSL 文件
├── docs/                       # 技术文档
│   └── dify-guide.md           # Dify 配置详细指南
├── package.json                # 项目配置和依赖
├── tsconfig.json               # TypeScript 编译配置
├── .gitignore                  # Git 忽略规则
├── .vscodeignore               # VSIX 打包忽略规则
├── README.md                   # 项目说明
├── LICENSE                     # MIT 许可证
└── CHANGELOG.md                # 版本更新日志
```

## 开发

### 环境要求

- Node.js >= 16
- VS Code >= 1.85
- TypeScript >= 5.3

### 开发命令

```bash
# 安装依赖
npm install

# 编译（一次性）
npm run compile

# 监听文件变化自动编译
npm run watch

# 打包生成 VSIX
npm run package
```

### 调试

1. 在 VS Code 中打开项目
2. 按 `F5` 启动 Extension Development Host
3. 在新窗口中测试插件功能
4. 查看 `Output` 面板中的日志输出

### 架构说明

插件采用 **VS Code Webview 最佳实践**：

- 侧边栏 Webview 模式，不占用编辑器区域
- 外部 JS/CSS 文件加载（符合 CSP 安全策略）
- nonce 验证脚本安全性
- 通过 `postMessage` 实现 Extension Host 与 Webview 双向通信

API 通信使用 Node.js 原生 `http`/`https` 模块，支持 blocking 和 streaming 两种响应模式。

## 常见问题

**Q: 连接失败 / Connection Refused**
A: 检查以下几点：
- Dify 服务是否正在运行
- `dify.apiUrl` 是否正确（不要加 `/v1`）
- 网络是否可达（同一局域网或有路由）
- 服务器防火墙是否放行对应端口

**Q: 代码补全没有反应**
A: 确认 `dify.enableAutocomplete` 设置为 `true`，且 Dify 应用正常响应。补全有 500ms 防抖延迟，输入稍等片刻即可。

**Q: 如何切换模型**
A: 在 VS Code 设置中修改 `dify.model`，或在 Dify 平台侧切换应用关联的模型。

## 许可证

[MIT License](LICENSE)

## 相关链接

- [Dify 官网](https://dify.ai)
- [Dify 文档](https://docs.dify.ai)
- [VS Code Extension API](https://code.visualstudio.com/api)
