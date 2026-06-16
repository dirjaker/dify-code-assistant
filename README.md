# Dify Code Assistant

基于 [Dify](https://dify.ai) 的 VS Code AI 编程助手，支持智能对话、代码补全、代码解释和重构。

## ✨ 功能特性

- 🤖 **AI 对话** - 在侧边栏与 AI 实时对话
- 📖 **代码解释** - 选中代码，AI 详细解释逻辑
- 🐛 **Bug 修复** - AI 帮你找出并修复代码问题
- ♻️ **代码重构** - 优化代码结构，提高可读性
- ✨ **代码生成** - 根据描述生成代码
- 📋 **一键复制** - 快速复制 AI 生成的代码

## 📦 安装

### 方式一：下载 VSIX 安装包

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

## ⚙️ 配置

### 1. 准备 Dify 应用

**方式 A：导入预配置 DSL（推荐）**

1. 登录你的 Dify 实例
2. 点击 "+" → "导入 DSL 文件"
3. 选择 `dify/vscode-code-assistant.yml`
4. 获取应用的 API Key

**方式 B：手动创建应用**

1. 在 Dify 中创建聊天应用
2. 配置 System Prompt（参考 `docs/dify-guide.md`）
3. 获取应用的 API Key

### 2. 配置 VS Code

按 `Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`，添加：

```json
{
  "dify.apiUrl": "http://your-dify-server:9000",
  "dify.apiKey": "app-your-api-key",
  "dify.model": "deepseek-v4-pro"
}
```

或按 `Ctrl+Shift+P` → `Dify: Settings` 打开设置界面。

## 🚀 使用方法

### 打开 AI 助手

- 点击左侧活动栏的 **Dify AI** 图标
- 或按快捷键 `Ctrl+Shift+D`（Mac: `Cmd+Shift+D`）

### 对话功能

1. 在输入框输入问题
2. 点击 **发送按钮** 或按 **Enter** 发送
3. **Shift+Enter** 可换行

### 代码操作

1. 在编辑器中选中代码
2. 右键选择 AI 功能：
   - **AI: 解释代码** - 详细解释代码逻辑
   - **AI: 修复代码** - 找出并修复问题
   - **AI: 重构代码** - 优化代码结构
   - **AI: 生成代码** - 根据描述生成代码

### 快捷操作

- 📋 **复制代码** - 点击代码块右上角的"复制"按钮
- 🗑️ **清空对话** - 点击工具栏的清空按钮

## 📁 项目结构

```
dify-code-assistant/
├── src/                    # 源代码
│   ├── extension.ts        # 插件入口
│   ├── chatPanel.ts        # 聊天面板（侧边栏）
│   ├── completionProvider.ts # 代码补全
│   ├── config.ts           # 配置管理
│   └── difyClient.ts       # Dify API 客户端
├── resources/              # 资源文件
│   ├── icon.png           # 插件图标
│   ├── icon.svg           # 插件图标（矢量）
│   └── sidebar-icon.svg   # 侧边栏图标
├── dify/                   # Dify 配置
│   ├── README.md          # Dify 配置说明
│   └── vscode-code-assistant.yml  # 预配置 DSL
├── docs/                   # 文档
│   └── dify-guide.md      # Dify 配置指南
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript 配置
├── .gitignore             # Git 忽略规则
├── .vscodeignore          # VSIX 打包忽略规则
├── README.md              # 项目说明
├── LICENSE                # MIT 许可证
└── CHANGELOG.md           # 更新日志
```

## 🔧 开发

### 环境要求

- Node.js >= 16
- VS Code >= 1.85
- TypeScript >= 5.3

### 开发命令

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听变化
npm run watch

# 打包
npm run package
```

### 调试

1. 按 `F5` 启动调试
2. 在新窗口中测试插件
3. 查看输出面板的日志

## 📝 更新日志

### v0.2.2 (2026-06-16)

- 修复 CSP 策略导致脚本无法执行的问题
- 使用 nonce 验证脚本安全性
- 优化侧边栏 UI 设计

### v0.2.1 (2026-06-16)

- 修复所有按钮无响应问题
- 使用 addEventListener 绑定事件

### v0.2.0 (2026-06-16)

- 改为侧边栏显示
- 全新 UI 设计
- 添加快捷操作按钮

### v0.1.1 (2026-06-16)

- 修复回车发送消息问题
- 中文化界面

### v0.1.0 (2026-06-16)

- 初始版本
- 基本聊天功能
- 代码解释、修复、重构

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE)

## 🔗 相关链接

- [Dify 官网](https://dify.ai)
- [Dify 文档](https://docs.dify.ai)
- [VS Code Extension API](https://code.visualstudio.com/api)
