# RAG 检索功能集成方案

本文档详细说明 `dify-code-assistant` 的 RAG（检索增强生成）集成架构和使用方法。

> 最后更新：2026-06-22（v2.1.0）

## 目录

1. [Dify RAG 架构](#dify-rag-架构)
2. [知识库建设](#知识库建设)
3. [VS Code 插件集成](#vs-code-插件集成)
4. [Workflow 设计](#workflow-设计)
5. [缓存与性能优化](#缓存与性能优化)

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
│ 查询理解    │  理解用户意图，提取关键词
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 知识检索    │  从 Dify 知识库检索相关文档
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 上下文组装  │  将检索结果与当前代码上下文组装
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
| **代码库** | 源代码、测试代码 | 实时（通过 @ 引用） |
| **最佳实践** | 编码规范、架构模式 | 定期更新 |
| **问题库** | 常见问题、解决方案 | 持续积累 |

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

### 3. 建设脚本

使用项目提供的脚本自动收集和上传知识库：

```bash
# 设置环境变量
export DIFY_API_KEY=app-xxxxxxxx

# 收集项目文档到 knowledge-base/ 目录
./scripts/build-knowledge-base.sh /path/to/your/project ./knowledge-base

# 上传到 Dify 知识库
./scripts/upload-to-dify.sh ./knowledge-base
```

脚本会自动收集：
- README.md、CHANGELOG.md 等文档
- package.json、requirements.txt 等依赖文件
- 目录结构
- 关键源代码文件

### 4. 在 Dify 中关联知识库

1. 进入主应用设置
2. 点击 **"知识库"** 区域
3. 添加你刚上传的知识库
4. 设置检索模式：
   - **单路召回** — 适合小知识库，速度快
   - **多路召回** — 适合大知识库，精度更高

---

## VS Code 插件集成

### 知识库查询命令

插件通过斜杠命令提供知识库查询能力：

| 命令 | 功能 | 示例 |
|------|------|------|
| `/knowledge <查询>` | 通用知识库查询 | `/knowledge 项目认证机制` |
| `/api <API名称>` | 查询 API 文档 | `/api DifyClient.chat` |
| `/arch` | 查询项目架构 | `/arch` |
| `/best <主题>` | 查询最佳实践 | `/best 错误处理` |

### 上下文收集器（ContextCollector）

`contextCollector.ts` 负责收集代码上下文信息，v2.1.0 改进了缓存机制：

```typescript
// 上下文收集器主要功能
class ContextCollector {
  // 收集当前文件上下文（导入、定义、注释）
  async collectFileContext(filePath: string): Promise<FileContext>;

  // 收集项目上下文（结构、配置、依赖）
  async collectProjectContext(): Promise<ProjectContext>;

  // 收集相关代码上下文（引用、定义）
  async collectRelatedContext(filePath: string, selectedText: string): Promise<RelatedContext>;
}
```

**v2.1.0 缓存改进**：
- 缓存带 **5 分钟 TTL**，避免频繁重复计算
- 监听 `onDidChangeTextDocument` 事件，文档修改时自动清除对应缓存
- 保证缓存数据的时效性和准确性

### RAG 增强补全（RAGCompletionProvider）

启用 `dify.enableRagCompletion` 后，Ghost Text 补全会利用知识库提供更准确的建议：

```json
{
  "dify.enableRagCompletion": true
}
```

工作流程：
1. 用户输入代码 → 收集光标前后的上下文
2. 通过 Workflow API 查询知识库
3. 将检索结果与上下文一起发送给 LLM
4. LLM 生成更准确的补全建议

---

## Workflow 设计

### 知识检索 Workflow（knowledge-retrieval.yml）

```
开始 → 知识检索 → LLM 总结 → 结束

开始节点变量：
  - query (paragraph) — 查询内容
  - language (select) — 语言类型
  - query_type (select) — 查询类型（问题解答/API查询/架构查询）
  - project_context (paragraph) — 项目上下文

知识检索节点：
  - 关联已创建的知识库
  - 检索模式: 单路/多路召回

LLM 节点：
  - 根据检索结果生成回答
  - Temperature: 0.3

结束节点输出：
  - answer ← llm-node.text
```

### 代码补全 Workflow（code-completion.yml）

```
开始 → LLM → 结束

开始节点变量：
  - code_context (paragraph) — 光标前后的代码（前后各 30 行）
  - language (select) — document.languageId
  - completion_type (select) — 自动检测（函数/类/代码块/行）

LLM 节点：
  - 模型: deepseek-chat
  - Temperature: 0.3
  - Max Tokens: 2000

结束节点输出：
  - completion_result ← llm-node.text
```

---

## 缓存与性能优化

### v2.1.0 上下文缓存改进

| 特性 | 说明 |
|------|------|
| **缓存 TTL** | 5 分钟自动过期 |
| **自动失效** | 监听文档修改事件，自动清除对应缓存 |
| **粒度控制** | 文件级缓存，修改一个文件不影响其他文件的缓存 |

### 性能建议

1. **知识库大小**：建议单个知识库不超过 1000 个文档
2. **检索模式**：小知识库用单路召回，大知识库用多路召回
3. **maxTokens**：代码补全建议 2000，对话建议 4096-8192
4. **大文件处理**：v2.1.0 对超过 5000 行的文件自动使用简化 diff 算法，避免 OOM
