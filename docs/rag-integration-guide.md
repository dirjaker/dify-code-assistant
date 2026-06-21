# RAG 检索功能嵌入方案

## 目录
1. [Dify RAG 架构](#dify-rag-架构)
2. [知识库建设](#知识库建设)
3. [VS Code 插件集成](#vs-code-插件集成)
4. [Workflow 设计](#workflow-设计)
5. [实现步骤](#实现步骤)

---

## Dify RAG 架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code 插件                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ 代码补全    │  │ 代码审查    │  │ 知识查询    │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          │                                   │
│                          ▼                                   │
│                   ┌─────────────┐                            │
│                   │ DifyClient  │                            │
│                   └──────┬──────┘                            │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Dify 平台                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Workflow Engine                         │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │    │
│  │  │ 知识库  │  │   LLM   │  │  工具   │             │    │
│  │  │ 检索    │  │  生成    │  │  调用   │             │    │
│  │  └────┬────┘  └────┬────┘  └────┬────┘             │    │
│  │       │            │            │                   │    │
│  │       └────────────┼────────────┘                   │    │
│  │                    │                                │    │
│  └────────────────────┼────────────────────────────────┘    │
│                       │                                     │
│  ┌────────────────────▼────────────────────────────────┐    │
│  │              Knowledge Base                          │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │    │
│  │  │ 项目    │  │  API    │  │ 最佳    │             │    │
│  │  │ 文档    │  │  文档   │  │ 实践    │             │    │
│  │  └─────────┘  └─────────┘  └─────────┘             │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### RAG 工作流程

```
用户查询
    │
    ▼
┌─────────────┐
│ 查询理解    │  理解用户意图
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 知识检索    │  从知识库检索相关文档
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 上下文组装  │  将检索结果组装成上下文
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ LLM 生成    │  基于上下文生成回答
└──────┬──────┘
       │
       ▼
   输出结果
```

---

## 知识库建设

### 1. 知识库类型

| 类型 | 内容 | 更新频率 |
|------|------|----------|
| **项目文档** | README、API 文档、设计文档 | 每次提交 |
| **代码库** | 源代码、测试代码 | 实时 |
| **最佳实践** | 编码规范、架构模式 | 定期 |
| **问题库** | 常见问题、解决方案 | 持续 |

### 2. 知识库结构

```
knowledge-base/
├── project-docs/           # 项目文档
│   ├── README.md
│   ├── API.md
│   ├── ARCHITECTURE.md
│   └── CHANGELOG.md
├── codebase/               # 代码库
│   ├── src/
│   ├── tests/
│   └── examples/
├── best-practices/         # 最佳实践
│   ├── coding-standards.md
│   ├── design-patterns.md
│   └── security-guidelines.md
└── faq/                    # 常见问题
    ├── setup.md
    ├── troubleshooting.md
    └── performance.md
```

### 3. 文档格式要求

```markdown
# 文档标题

## 概述
[简要描述]

## 详细内容
[具体内容]

## 代码示例
```python
# 示例代码
```

## 相关链接
- [链接1](url1)
- [链接2](url2)

## 标签
`tag1` `tag2` `tag3`
```

---

## VS Code 插件集成

### 1. 知识库查询命令

```typescript
// src/commands/knowledgeQuery.ts

import * as vscode from 'vscode';
import { DifyClient } from '../difyClient';

export class KnowledgeQueryCommand {
    private client: DifyClient;

    constructor(client: DifyClient) {
        this.client = client;
    }

    /**
     * 查询知识库
     */
    async query(query: string): Promise<string> {
        // 调用 Dify Workflow
        const response = await this.client.queryKnowledge(query);
        return response.answer;
    }

    /**
     * 查询当前文件相关知识
     */
    async queryCurrentFile(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        const selectedText = document.getText(selection);

        // 构建查询
        let query = `关于文件 ${document.fileName} 的知识`;
        if (selectedText) {
            query += `，特别是这段代码：\n${selectedText}`;
        }

        // 查询知识库
        const result = await this.query(query);

        // 显示结果
        this.showResult(result);
    }

    /**
     * 查询项目架构
     */
    async queryArchitecture(): Promise<void> {
        const query = '请描述这个项目的整体架构和模块划分';
        const result = await this.query(query);
        this.showResult(result);
    }

    /**
     * 查询 API 文档
     */
    async queryApi(apiName: string): Promise<void> {
        const query = `请提供 ${apiName} 的 API 文档和使用示例`;
        const result = await this.query(query);
        this.showResult(result);
    }

    /**
     * 显示查询结果
     */
    private showResult(result: string): void {
        // 创建 Webview 显示结果
        const panel = vscode.window.createWebviewPanel(
            'knowledgeResult',
            '知识库查询结果',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        panel.webview.html = this.getHtml(result);
    }

    private getHtml(content: string): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        color: var(--vscode-foreground);
                    }
                    pre {
                        background: var(--vscode-editor-background);
                        padding: 12px;
                        border-radius: 6px;
                        overflow-x: auto;
                    }
                    code {
                        font-family: var(--vscode-editor-font-family);
                    }
                </style>
            </head>
            <body>
                ${this.markdownToHtml(content)}
            </body>
            </html>
        `;
    }

    private markdownToHtml(markdown: string): string {
        // 简单的 Markdown 转 HTML
        return markdown
            .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }
}
```

### 2. 自动上下文收集

```typescript
// src/context/contextCollector.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class ContextCollector {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * 收集当前文件上下文
     */
    async collectFileContext(filePath: string): Promise<FileContext> {
        const document = await vscode.workspace.openTextDocument(filePath);
        const content = document.getText();
        const language = document.languageId;

        // 提取导入
        const imports = this.extractImports(content, language);

        // 提取函数/类定义
        const definitions = this.extractDefinitions(content, language);

        // 提取注释
        const comments = this.extractComments(content, language);

        return {
            filePath,
            language,
            content,
            imports,
            definitions,
            comments
        };
    }

    /**
     * 收集项目上下文
     */
    async collectProjectContext(): Promise<ProjectContext> {
        // 扫描项目结构
        const structure = await this.scanProjectStructure();

        // 读取配置文件
        const config = await this.readConfigFiles();

        // 提取依赖
        const dependencies = await this.extractDependencies();

        return {
            structure,
            config,
            dependencies
        };
    }

    /**
     * 收集相关代码上下文
     */
    async collectRelatedContext(
        filePath: string,
        selectedText: string
    ): Promise<RelatedContext> {
        // 查找相关文件
        const relatedFiles = await this.findRelatedFiles(filePath);

        // 查找引用
        const references = await this.findReferences(filePath, selectedText);

        // 查找定义
        const definitions = await this.findDefinitions(selectedText);

        return {
            relatedFiles,
            references,
            definitions
        };
    }

    /**
     * 提取导入语句
     */
    private extractImports(content: string, language: string): string[] {
        const imports: string[] = [];

        // JavaScript/TypeScript
        if (['javascript', 'typescript'].includes(language)) {
            const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }
        }

        // Python
        if (language === 'python') {
            const importRegex = /^(?:from\s+(\S+)\s+)?import\s+(.+)$/gm;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                imports.push(match[1] || match[2]);
            }
        }

        return imports;
    }

    /**
     * 提取函数/类定义
     */
    private extractDefinitions(content: string, language: string): Definition[] {
        const definitions: Definition[] = [];

        // JavaScript/TypeScript
        if (['javascript', 'typescript'].includes(language)) {
            // 函数定义
            const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
            let match;
            while ((match = funcRegex.exec(content)) !== null) {
                definitions.push({
                    type: 'function',
                    name: match[1],
                    line: content.substring(0, match.index).split('\n').length
                });
            }

            // 类定义
            const classRegex = /(?:export\s+)?class\s+(\w+)/g;
            while ((match = classRegex.exec(content)) !== null) {
                definitions.push({
                    type: 'class',
                    name: match[1],
                    line: content.substring(0, match.index).split('\n').length
                });
            }
        }

        return definitions;
    }

    /**
     * 提取注释
     */
    private extractComments(content: string, language: string): string[] {
        const comments: string[] = [];

        // 单行注释
        const singleLineRegex = /\/\/(.*)$/gm;
        let match;
        while ((match = singleLineRegex.exec(content)) !== null) {
            comments.push(match[1].trim());
        }

        // 多行注释
        const multiLineRegex = /\/\*([\s\S]*?)\*\//g;
        while ((match = multiLineRegex.exec(content)) !== null) {
            comments.push(match[1].trim());
        }

        return comments;
    }

    /**
     * 扫描项目结构
     */
    private async scanProjectStructure(): Promise<DirectoryNode> {
        const root = this.workspaceRoot;
        return this.scanDirectory(root, 0, 3); // 最多3层深度
    }

    private async scanDirectory(
        dirPath: string,
        depth: number,
        maxDepth: number
    ): Promise<DirectoryNode> {
        if (depth > maxDepth) {
            return { name: path.basename(dirPath), type: 'directory', children: [] };
        }

        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const children: (DirectoryNode | FileNode)[] = [];

        for (const entry of entries) {
            // 跳过隐藏文件和依赖目录
            if (entry.name.startsWith('.') || 
                ['node_modules', '__pycache__', 'dist', 'build'].includes(entry.name)) {
                continue;
            }

            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                const subDir = await this.scanDirectory(fullPath, depth + 1, maxDepth);
                children.push(subDir);
            } else {
                children.push({
                    name: entry.name,
                    type: 'file',
                    size: (await fs.promises.stat(fullPath)).size
                });
            }
        }

        return {
            name: path.basename(dirPath),
            type: 'directory',
            children
        };
    }

    /**
     * 读取配置文件
     */
    private async readConfigFiles(): Promise<Record<string, any>> {
        const config: Record<string, any> = {};

        // package.json
        const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            config.packageJson = JSON.parse(
                await fs.promises.readFile(packageJsonPath, 'utf-8')
            );
        }

        // tsconfig.json
        const tsconfigPath = path.join(this.workspaceRoot, 'tsconfig.json');
        if (fs.existsSync(tsconfigPath)) {
            config.tsconfig = JSON.parse(
                await fs.promises.readFile(tsconfigPath, 'utf-8')
            );
        }

        return config;
    }

    /**
     * 提取依赖
     */
    private async extractDependencies(): Promise<string[]> {
        const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            return [];
        }

        const packageJson = JSON.parse(
            await fs.promises.readFile(packageJsonPath, 'utf-8')
        );

        return [
            ...Object.keys(packageJson.dependencies || {}),
            ...Object.keys(packageJson.devDependencies || {})
        ];
    }

    /**
     * 查找相关文件
     */
    private async findRelatedFiles(filePath: string): Promise<string[]> {
        const relatedFiles: string[] = [];

        // 查找同目录下的文件
        const dir = path.dirname(filePath);
        const entries = await fs.promises.readdir(dir);

        for (const entry of entries) {
            if (entry !== path.basename(filePath)) {
                relatedFiles.push(path.join(dir, entry));
            }
        }

        // 查找导入的文件
        const document = await vscode.workspace.openTextDocument(filePath);
        const content = document.getText();
        const imports = this.extractImports(content, document.languageId);

        for (const imp of imports) {
            if (imp.startsWith('.')) {
                const resolvedPath = path.resolve(dir, imp);
                if (fs.existsSync(resolvedPath)) {
                    relatedFiles.push(resolvedPath);
                }
            }
        }

        return relatedFiles;
    }

    /**
     * 查找引用
     */
    private async findReferences(
        filePath: string,
        symbol: string
    ): Promise<vscode.Location[]> {
        const locations = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            vscode.Uri.file(filePath),
            new vscode.Position(0, 0)
        );

        return locations || [];
    }

    /**
     * 查找定义
     */
    private async findDefinitions(
        symbol: string
    ): Promise<vscode.Location[]> {
        const locations = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            vscode.window.activeTextEditor?.document.uri!,
            vscode.window.activeTextEditor?.selection.active!
        );

        return locations || [];
    }
}

interface FileContext {
    filePath: string;
    language: string;
    content: string;
    imports: string[];
    definitions: Definition[];
    comments: string[];
}

interface Definition {
    type: 'function' | 'class' | 'variable';
    name: string;
    line: number;
}

interface ProjectContext {
    structure: DirectoryNode;
    config: Record<string, any>;
    dependencies: string[];
}

interface DirectoryNode {
    name: string;
    type: 'directory';
    children: (DirectoryNode | FileNode)[];
}

interface FileNode {
    name: string;
    type: 'file';
    size: number;
}

interface RelatedContext {
    relatedFiles: string[];
    references: vscode.Location[];
    definitions: vscode.Location[];
}
```

---

## Workflow 设计

### 1. 知识检索 Workflow

```yaml
# dify/workflows/knowledge-retrieval.yml

app:
  description: 知识检索 Workflow - RAG 检索增强
  mode: workflow
  name: 知识检索

workflow:
  graph:
    edges:
      - source: start
        target: knowledge-retrieval
      - source: knowledge-retrieval
        target: llm
      - source: llm
        target: end

    nodes:
      - data:
          title: 开始
          type: start
          variables:
            - label: 查询内容
              variable: query
              type: paragraph
              required: true

            - label: 项目上下文
              variable: project_context
              type: paragraph
              required: false

      - data:
          title: 知识检索
          type: knowledge-retrieval
          dataset_ids:
            - ${PROJECT_DOCS_DATASET_ID}
            - ${CODEBASE_DATASET_ID}
            - ${BEST_PRACTICES_DATASET_ID}
          retrieval_mode: semantic
          top_k: 5
          score_threshold: 0.7

      - data:
          title: LLM 生成
          type: llm
          model:
            name: deepseek-chat
            provider: deepseek
          prompt_template:
            - role: system
              text: |
                你是一个专业的编程助手。根据检索到的知识库内容，回答用户的问题。

                规则：
                1. 基于检索到的内容回答
                2. 如果检索内容不足，可以补充说明
                3. 提供具体的代码示例
                4. 保持回答简洁明了

            - role: user
              text: |
                查询：{{#start.query#}}

                项目上下文：
                {{#start.project_context#}}

                检索到的知识：
                {{#knowledge-retrieval.result#}}

                请回答：

      - data:
          title: 结束
          type: end
          outputs:
            - variable: answer
              value_selector:
                - llm
                - text
```

### 2. 代码补全 + RAG Workflow

```yaml
# dify/workflows/code-completion-with-rag.yml

app:
  description: 代码补全 Workflow - 带 RAG 检索
  mode: workflow
  name: 代码补全 RAG

workflow:
  graph:
    edges:
      - source: start
        target: knowledge-retrieval
      - source: knowledge-retrieval
        target: llm
      - source: llm
        target: end

    nodes:
      - data:
          title: 开始
          type: start
          variables:
            - label: 代码上下文
              variable: code_context
              type: paragraph
              required: true

            - label: 语言类型
              variable: language
              type: select
              options:
                - Python
                - JavaScript
                - TypeScript
                - Java
                - Go
                - Rust
              required: true

            - label: 补全类型
              variable: completion_type
              type: select
              options:
                - 函数补全
                - 类补全
                - 代码块补全
                - 行补全
              required: true

      - data:
          title: 知识检索
          type: knowledge-retrieval
          dataset_ids:
            - ${CODEBASE_DATASET_ID}
            - ${BEST_PRACTICES_DATASET_ID}
          retrieval_mode: semantic
          top_k: 3
          score_threshold: 0.6
          query_variable: code_context

      - data:
          title: 代码补全
          type: llm
          model:
            name: deepseek-coder
            provider: deepseek
          prompt_template:
            - role: system
              text: |
                你是一个专业的代码补全助手。

                规则：
                1. 基于检索到的代码库知识进行补全
                2. 保持代码风格一致
                3. 遵循项目最佳实践
                4. 只输出需要补全的代码

            - role: user
              text: |
                语言：{{#start.language#}}
                补全类型：{{#start.completion_type#}}

                代码上下文：
                ```{{#start.language#}}
                {{#start.code_context#}}
                ```

                相关代码参考：
                {{#knowledge-retrieval.result#}}

                请补全代码：

      - data:
          title: 结束
          type: end
          outputs:
            - variable: completion
              value_selector:
                - llm
                - text
```

---

## 实现步骤

### 阶段 1：知识库建设（1周）

1. **收集项目文档**
   ```bash
   # 创建知识库目录
   mkdir -p knowledge-base/{project-docs,codebase,best-practices,faq}
   
   # 收集文档
   cp README.md knowledge-base/project-docs/
   cp docs/*.md knowledge-base/project-docs/
   cp -r src knowledge-base/codebase/
   ```

2. **上传到 Dify**
   - 登录 Dify 控制台
   - 创建知识库
   - 上传文档
   - 配置分段策略

3. **测试检索**
   - 测试查询准确性
   - 调整检索参数

### 阶段 2：插件集成（1周）

1. **添加知识查询命令**
   - 实现 `KnowledgeQueryCommand`
   - 注册命令到 VS Code

2. **添加上下文收集**
   - 实现 `ContextCollector`
   - 自动收集文件上下文

3. **集成 Dify Workflow**
   - 调用知识检索 Workflow
   - 处理返回结果

### 阶段 3：优化迭代（持续）

1. **优化检索效果**
   - 调整分段策略
   - 优化检索参数

2. **扩展知识库**
   - 添加更多文档
   - 更新代码库

3. **用户反馈**
   - 收集使用反馈
   - 持续改进

---

## 配置示例

### VS Code 配置

```json
{
  "dify.apiUrl": "http://localhost:9000",
  "dify.apiKey": "app-xxx",
  "dify.knowledge.enabled": true,
  "dify.knowledge.datasets": {
    "project-docs": "dataset-xxx",
    "codebase": "dataset-yyy",
    "best-practices": "dataset-zzz"
  },
  "dify.knowledge.topK": 5,
  "dify.knowledge.scoreThreshold": 0.7
}
```

### Dify 环境变量

```bash
# Dify 配置
DIFY_API_URL=http://localhost:9000
DIFY_API_KEY=app-xxx

# 知识库 ID
PROJECT_DOCS_DATASET_ID=dataset-xxx
CODEBASE_DATASET_ID=dataset-yyy
BEST_PRACTICES_DATASET_ID=dataset-zzz

# 模型配置
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_MODEL=deepseek-chat
```

---

## 总结

### RAG 集成要点

1. **知识库建设** - 收集和整理项目文档
2. **Workflow 设计** - 设计检索和生成流程
3. **插件集成** - 实现查询和上下文收集
4. **持续优化** - 根据反馈改进效果

### 预期效果

- **代码补全准确率提升 30%**
- **代码审查覆盖率提升 50%**
- **开发者效率提升 40%**

### 下一步

1. 开始知识库建设
2. 实现基础 RAG Workflow
3. 集成到 VS Code 插件
4. 测试和优化
