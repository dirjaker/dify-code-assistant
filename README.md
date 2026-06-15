<div align="center">

# Dify Code Assistant

**AI-Powered Code Assistant for VS Code, Powered by Dify**

[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-blue.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.1.0-orange.svg)](CHANGELOG.md)

</div>

---

## Overview

Dify Code Assistant is a VS Code extension that brings AI-powered coding assistance directly to your editor. Powered by [Dify](https://dify.ai), it provides intelligent code completion, chat-based assistance, and code analysis capabilities.

## Features

### Chat Assistant
- Ask questions about your code
- Get explanations for complex code blocks
- Receive refactoring suggestions
- Debug issues with AI assistance

### Code Completion
- Inline code suggestions as you type
- Context-aware completions
- Multi-language support

### Code Actions
- **Explain Code** - Get detailed explanations of selected code
- **Refactor Code** - Get suggestions for improving code quality
- **Fix Code** - Identify and fix bugs in your code

## Installation

### Method 1: Install from VSIX

1. Download the latest `.vsix` file from [Releases](https://github.com/dirjaker/dify-code-assistant/releases)
2. Open VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
4. Type "Extensions: Install from VSIX..."
5. Select the downloaded `.vsix` file

### Method 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/dirjaker/dify-code-assistant.git
cd dify-code-assistant

# Install dependencies
npm install

# Compile
npm run compile

# Package
npm run package
```

## Configuration

Open VS Code Settings (`Ctrl+,`) and search for "Dify":

| Setting | Description | Default |
|---------|-------------|---------|
| `dify.apiUrl` | Dify API URL | `http://192.168.31.100:9000` |
| `dify.apiKey` | Dify API Key (app-xxx) | `""` |
| `dify.model` | Model name | `deepseek-coder` |
| `dify.enableAutocomplete` | Enable inline completion | `true` |
| `dify.maxTokens` | Maximum tokens for response | `2048` |

### Example Configuration

```json
{
  "dify.apiUrl": "http://your-dify-server:9000",
  "dify.apiKey": "REDACTED_DIFY_KEY",
  "dify.model": "deepseek-coder"
}
```

## Usage

### Open Chat
- Press `Ctrl+Shift+D` (or `Cmd+Shift+D` on macOS)
- Or click the Dify icon in the status bar
- Or use Command Palette: "Dify: Open Chat"

### Code Actions
1. Select code in the editor
2. Right-click to open context menu
3. Choose an action:
   - **Dify: Explain Code**
   - **Dify: Refactor Code**
   - **Dify: Fix Code**

### Chat Features
- Type your question in the chat input
- Press `Enter` to send
- Use `Shift+Enter` for new line
- Click "Copy" to copy code blocks
- Click "Insert" to insert code at cursor position

## Architecture

```
src/
├── extension.ts        # Entry point, command registration
├── difyClient.ts       # Dify API client (HTTP/Stream)
├── chatPanel.ts        # Chat WebView panel
├── completionProvider.ts # Inline completion provider
└── config.ts           # Configuration management
```

### API Integration

The extension communicates with Dify via REST API:

```
POST /v1/chat-messages
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "inputs": {},
  "query": "Your question",
  "response_mode": "blocking",
  "user": "vscode-user"
}
```

## Development

### Prerequisites

- Node.js >= 18.x
- npm >= 9.x
- VS Code >= 1.85

### Setup

```bash
# Install dependencies
npm install

# Watch mode for development
npm run watch

# Run extension in VS Code
# Press F5 in VS Code to launch Extension Development Host
```

### Build

```bash
# Compile
npm run compile

# Package
npm run package
```

## Roadmap

- [ ] Streaming response support
- [ ] Multi-conversation management
- [ ] Codebase-aware context (RAG)
- [ ] Custom system prompts
- [ ] Model selection UI
- [ ] Conversation history
- [ ] Export conversations
- [ ] Keyboard shortcuts customization

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Dify](https://dify.ai) - LLM application development platform
- [VS Code Extension API](https://code.visualstudio.com/api) - Extension development framework
