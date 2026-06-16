<div align="center">


<br>

### VS Code AI 编程助手

[![Stars](https://img.shields.io/github/stars/dirjaker/dify-code-assistant?style=flat-square&label=Stars&color=FFD700)](https://github.com/dirjaker/dify-code-assistant/stargazers)
[![Forks](https://img.shields.io/github/forks/dirjaker/dify-code-assistant?style=flat-square&label=Forks&color=4A90D9)](https://github.com/dirjaker/dify-code-assistant/network/members)
[![Contributors](https://img.shields.io/github/contributors/dirjaker/dify-code-assistant?style=flat-square&label=Contributors&color=8B4513)](https://github.com/dirjaker/dify-code-assistant/graphs/contributors)
[![License](https://img.shields.io/github/license/dirjaker/dify-code-assistant?style=flat-square&label=License&color=20B2AA)](https://github.com/dirjaker/dify-code-assistant/blob/dev/LICENSE)

</div>

---

## 功能特性

| 功能 | 描述 |
|------|------|
| 💬 **智能对话** | 基于 Dify 平台的 AI 聊天助手 |
| ✨ **代码补全** | 输入时自动补全代码建议 |
| 📖 **代码解释** | 选中代码一键获取详细解释 |
| 🔧 **代码重构** | AI 辅助代码重构建议 |
| 🐛 **错误修复** | 智能识别并修复代码错误 |
| ⚙️ **灵活配置** | 支持自定义 API 地址和模型 |

## 快速开始

### 安装插件

```bash
# 克隆项目
git clone https://github.com/dirjaker/dify-code-assistant.git
cd dify-code-assistant

# 安装依赖
npm install

# 编译打包
npm run package

# 安装到 VS Code
# 方法1: 双击生成的 .vsix 文件
# 方法2: VS Code -> Ctrl+Shift+P -> Extensions: Install from VSIX...
```

### 配置

打开 VS Code 设置 (`Ctrl+,`)，搜索 `Dify`：

```json
{
  "dify.apiUrl": "http://your-dify-server:9000",
  "dify.apiKey": "app-xxxxxxxxxxxx",
  "dify.model": "deepseek-coder"
}
```

### 使用方法

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+D` | 打开聊天面板 |
| `Ctrl+Shift+P` → `Dify: Explain Code` | 解释选中代码 |
| `Ctrl+Shift+P` → `Dify: Refactor Code` | 重构选中代码 |
| `Ctrl+Shift+P` → `Dify: Fix Code` | 修复选中代码 |

## 技术栈

| 层级 | 技术 |
|------|------|
| **框架** | VS Code Extension API |
| **语言** | TypeScript |
| **API** | Dify REST API |
| **UI** | WebView (HTML/CSS/JS) |
| **构建** | esbuild / tsc |

## 项目结构

```
dify-code-assistant/
├── src/
│   ├── extension.ts          # 入口，注册命令
│   ├── difyClient.ts         # Dify API 客户端
│   ├── chatPanel.ts          # 聊天 WebView 面板
│   ├── completionProvider.ts # 代码补全
│   └── config.ts             # 配置管理
├── assets/
├── resources/
│   └── icon.png              # 插件图标
├── package.json              # 插件清单
└── README.md
```

## 开发日志

- [x] 项目初始化
- [x] Dify API 客户端
- [x] 聊天面板 UI
- [x] 代码补全功能
- [x] 代码操作（解释/重构/修复）
- [x] 打包为 .vsix
- [ ] 流式响应支持
- [ ] 多会话管理
- [ ] 代码库上下文（RAG）
- [ ] 自定义系统提示词

## 许可证

[MIT License](LICENSE)

---

<div align="center">

GitHub: [dirjaker/dify-code-assistant](https://github.com/dirjaker/dify-code-assistant)

如果这个项目对你有帮助，请给一个 Star 支持一下！

</div>
