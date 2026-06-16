# Changelog

所有 notable changes 记录在此文件中。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [1.0.0] - 2026-06-17

首个正式版本。

### 核心功能

- **侧边栏 AI 对话** — 基于 Webview 的侧边栏聊天面板，支持 Markdown 渲染和代码高亮
- **代码操作** — 选中代码后右键菜单：解释、修复、重构、生成
- **内联代码补全** — 基于上下文的智能补全建议，500ms 防抖 + 本地缓存
- **一键复制/插入** — 代码块支持复制到剪贴板或直接插入编辑器

### Dify 集成

- 对接 Dify Chat API（`/v1/chat-messages`）
- 支持 blocking 和 streaming 两种响应模式
- 多轮对话上下文保持（conversation_id）
- 可配置 API 地址、API Key、模型名称
- 提供预配置 DSL 文件，一键导入 Dify 应用

### 技术实现

- 遵循 VS Code Webview 最佳实践：外部 JS/CSS 文件加载，CSP 安全策略
- nonce 验证脚本安全性
- `postMessage` 双向通信机制
- Node.js 原生 `http`/`https` 模块发送请求
- 配置变更自动热更新

### UI / UX

- VS Code 原生主题适配（亮色/暗色自动跟随）
- 快捷操作按钮（解释代码、修复 Bug、重构、生成代码）
- AI 思考中动画指示器
- 键盘快捷键支持（`Ctrl+Shift+D` 打开面板，`Enter` 发送）
- 状态栏快捷入口

### 文档

- 完整的 README 文档（安装、配置、使用、开发）
- Dify 配置详细指南（`docs/dify-guide.md`）
- Dify 应用 DSL 配置说明（`dify/README.md`）
- MIT 开源许可证

## [0.2.4] - 2026-06-16

- 修正默认 API Key 配置
- 上传 Dify DSL 配置文件

## [0.2.3] - 2026-06-16

- 参考 VS Code 官方 webview-view-sample 重构
- 改为外部 JS 文件加载方案（`media/main.js` + `media/main.css`）
- 彻底解决 CSP 策略限制问题

## [0.2.2] - 2026-06-16

- 使用 nonce 验证脚本安全性
- 优化侧边栏 UI 设计

## [0.2.1] - 2026-06-16

- 修复所有按钮无响应问题
- 使用 `addEventListener` 替代内联事件绑定

## [0.2.0] - 2026-06-16

- 从编辑器面板改为侧边栏显示模式
- 全新 UI 设计
- 添加快捷操作按钮

## [0.1.1] - 2026-06-16

- 修复回车发送消息问题
- 中文化界面

## [0.1.0] - 2026-06-16

- 初始版本
- 基本聊天功能
- 代码解释、修复、重构命令
