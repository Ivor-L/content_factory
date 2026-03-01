# Vector Store Configuration

**Use Case**: Configure RAG (Retrieval-Augmented Generation) pipelines in n8n with vector databases.

---

## RAG Pipeline Overview

完整 RAG 链路：

```
Document Loader → Text Splitter → Embedding → Vector Store (Write)
Query → Embedding → Vector Store (Retrieve) → LLM (Generate)
```

**n8n 中的 RAG 实现**：
- 使用 AI Agent + Vector Store Tool 模式
- 或使用 Question and Answer Chain

---

## Vector Store Node Configuration

### Pinecone

```javascript
{
  type: "@n8n/n8n-nodes-langchain.vectorStorePinecone",
  typeVersion: 1,
  parameters: {
    pineconeIndex: "my-index",
    pineconeNamespace: "production",  // 用 namespace 隔离不同数据集
    options: {}
  },
  credentials: {
    pineconeApi: { id: "xxx", name: "Pinecone-Prod" }
  }
}
```

### Qdrant

```javascript
{
  type: "@n8n/n8n-nodes-langchain.vectorStoreQdrant",
  typeVersion: 1,
  parameters: {
    qdrantCollection: "documents",
    options: {}
  },
  credentials: {
    qdrantApi: { id: "xxx", name: "Qdrant-Local" }
  }
}
```

### Supabase (pgvector)

```javascript
{
  type: "@n8n/n8n-nodes-langchain.vectorStoreSupabase",
  typeVersion: 1,
  parameters: {
    tableName: "documents",
    queryName: "match_documents"
  },
  credentials: {
    supabaseApi: { id: "xxx", name: "Supabase-Prod" }
  }
}
```

### In-Memory Vector Store

```javascript
{
  type: "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
  typeVersion: 1,
  parameters: {}
}
```

开发测试专用，无需外部服务，workflow 结束后数据丢失。

**选型建议**：

| 向量数据库 | 适用场景 | 特点 |
|-----------|---------|------|
| Pinecone | 生产环境 | 全托管、Namespace 隔离 |
| Qdrant | 本地/自托管 | 开源、性能好 |
| Supabase | 已有 Supabase 项目 | pgvector 扩展 |
| In-Memory | 开发测试 | 无需外部服务 |

---

## Embedding Model Configuration

### OpenAI Embeddings

```javascript
{
  type: "@n8n/n8n-nodes-langchain.embeddingsOpenAi",
  typeVersion: 1,
  parameters: {
    model: "text-embedding-3-small",  // 推荐：性价比最高
    options: {
      dimensions: 1536  // 必须与向量数据库索引维度一致
    }
  },
  credentials: {
    openAiApi: { id: "xxx", name: "OpenAI-Prod" }
  }
}
```

### Ollama Embeddings (本地)

```javascript
{
  type: "@n8n/n8n-nodes-langchain.embeddingsOllama",
  typeVersion: 1,
  parameters: {
    model: "nomic-embed-text"
  },
  credentials: {
    ollamaApi: { id: "xxx", name: "Ollama-Local" }
  }
}
```

**模型对比**：

| 模型 | 维度 | 价格 | 适用场景 |
|------|------|------|---------|
| text-embedding-3-small | 1536 | $0.02/1M tokens | 通用推荐 |
| text-embedding-3-large | 3072 | $0.13/1M tokens | 高精度需求 |
| text-embedding-ada-002 | 1536 | $0.10/1M tokens | 旧版本（不推荐） |
| nomic-embed-text | 768 | 免费（本地） | 离线/隐私场景 |

**维度对齐规则**：
- Embedding 维度必须与向量数据库索引创建时指定的维度一致
- Pinecone 创建索引时指定 `dimension: 1536`
- 更换 Embedding 模型后必须重新生成所有向量
- 混用不同维度的 Embedding 会导致检索失败

---

## Retrieval Strategy

### Basic Retrieval

```javascript
{
  type: "@n8n/n8n-nodes-langchain.retrieverVectorStore",
  typeVersion: 1,
  parameters: {
    topK: 10  // 返回最相关的 10 条
  }
}
```

### Multi-Query Retrieval

```javascript
{
  type: "@n8n/n8n-nodes-langchain.retrieverMultiQuery",
  typeVersion: 1,
  parameters: {
    queryCount: 5  // 生成 5 个变体查询
  }
}
```

**Multi-Query 原理**：
1. LLM 将用户问题改写为 5 个不同角度的查询
2. 每个查询分别检索 topK 条结果
3. 合并去重后返回

### Contextual Compression

```javascript
{
  type: "@n8n/n8n-nodes-langchain.retrieverContextualCompression",
  typeVersion: 1,
  parameters: {}
}
```

检索后用 LLM 压缩/过滤无关片段，提高传入 LLM 的上下文质量。

**检索参数建议**：

| 参数 | 推荐值 | 说明 |
|------|-------|------|
| topK | 10 | 平衡召回率和精度 |
| queryCount | 5 | Multi-Query 变体数 |
| scoreThreshold | 0.7 | 相似度阈值（可选） |

---

## Document Splitting Strategy

### Recursive Character Text Splitter

```javascript
{
  type: "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
  typeVersion: 1,
  parameters: {
    chunkSize: 1000,      // 每块最大字符数
    chunkOverlap: 100,    // 块间重叠（保持上下文连贯）
    options: {}
  }
}
```

### Token Text Splitter

```javascript
{
  type: "@n8n/n8n-nodes-langchain.textSplitterTokenSplitter",
  typeVersion: 1,
  parameters: {
    chunkSize: 500,       // 每块最大 token 数
    chunkOverlap: 50
  }
}
```

按 token 分割，更精确控制 LLM 上下文窗口用量。

**分块策略选择**：

| 策略 | chunkSize | chunkOverlap | 适用场景 |
|------|-----------|-------------|---------|
| 精细检索 | 500 | 50 | FAQ、短文 |
| 通用 | 1000 | 100 | 文章、报告 |
| 长文档 | 2000 | 200 | 书籍、论文 |
| 代码 | 1500 | 0 | 代码文件（不重叠） |

---

## Document Loaders

### Default Document Loader

```javascript
{
  type: "@n8n/n8n-nodes-langchain.documentDefaultDataLoader",
  typeVersion: 1,
  parameters: {
    dataType: "binary",   // binary | json
    options: {
      metadata: {
        metadataValues: [
          { name: "source", value: "={{ $json.fileName }}" }
        ]
      }
    }
  }
}
```

### JSON Document Loader

```javascript
{
  type: "@n8n/n8n-nodes-langchain.documentDefaultDataLoader",
  typeVersion: 1,
  parameters: {
    dataType: "json",
    jsonData: "={{ $json.text }}",  // 指定 JSON 中的文本字段
    options: {}
  }
}
```

**Loader 选择**：
- 文件（PDF/TXT/DOCX）：用 `binary` 模式 + Read File 节点
- 结构化数据（API/DB）：用 `json` 模式 + 指定文本字段

---

## Metadata Standardization

写入向量数据库时，每条记录应携带标准化 Metadata。

### 四件套 Metadata

```javascript
// Code 节点：为每条文档添加标准 Metadata
const items = $input.all();
return items.map(item => ({
  json: {
    ...item.json,
    metadata: {
      filename: item.json.source_file || 'unknown',
      upload_time: new Date().toISOString(),
      execution_id: $execution.id,
      workflow_id: $workflow.id
    }
  }
}));
```

**Metadata 字段说明**：

| 字段 | 类型 | 用途 |
|------|------|------|
| filename | string | 溯源：知道来自哪个文件 |
| upload_time | ISO date | 数据新鲜度判断 |
| execution_id | string | 关联到具体执行记录 |
| workflow_id | string | 关联到工作流 |

**可选扩展字段**：
- `category`: 文档分类（用于过滤检索）
- `language`: 文档语言
- `page_number`: 页码（PDF 分页后）
- `chunk_index`: 分块序号

---

## Vector Store Operations

### Insert Mode（写入）

Vector Store 节点设为 Insert 模式时执行写入：

```javascript
// Vector Store 节点 - Insert 操作
{
  type: "@n8n/n8n-nodes-langchain.vectorStorePinecone",
  typeVersion: 1,
  parameters: {
    mode: "insert",
    pineconeIndex: "my-index",
    pineconeNamespace: "production",
    options: {}
  }
}
```

写入管道连接顺序：
```
Document Loader → Text Splitter → Vector Store (Insert)
                                   ↑
                                Embedding
```

### Retrieve Mode（查询）

Vector Store 节点设为 Retrieve 模式时执行检索：

```javascript
// Vector Store 节点 - Retrieve 操作（作为 Tool）
{
  type: "@n8n/n8n-nodes-langchain.toolVectorStore",
  typeVersion: 1,
  parameters: {
    name: "knowledge_base",
    description: "Search the knowledge base for relevant documents",
    topK: 10
  }
}
```

---

## Complete RAG Pipeline Example

完整的 RAG 工作流配置。

### 写入管道（Indexing）

```
File Trigger → Read File → Text Splitter → Add Metadata (Code) → Embedding → Vector Store Insert
```

节点连接关系：
1. File Trigger (`n8n-nodes-base.localFileTrigger`) → Read File (`n8n-nodes-base.readBinaryFiles`)
2. Read File → Default Document Loader (`documentDefaultDataLoader`)
3. Document Loader → Text Splitter (`textSplitterRecursiveCharacterTextSplitter`)
4. Text Splitter → Vector Store Insert (`vectorStorePinecone`, mode: insert)
5. Embedding (`embeddingsOpenAi`) → Vector Store Insert（`ai_embedding` 端口）

### 查询管道（Querying）

```
Chat Trigger → AI Agent → Vector Store Tool → Retriever → Embedding
                 ↑
              Chat Model
```

### AI Agent + Vector Store Tool 配置

```javascript
// AI Agent 节点
{
  type: "@n8n/n8n-nodes-langchain.agent",
  typeVersion: 1.7,
  parameters: {
    agent: "openAiFunctionsAgent",
    text: "={{ $json.chatInput }}",
    promptType: "define",
    systemMessage: "你是一个知识库助手。根据检索到的文档回答问题。如果文档中没有相关信息，请说明。"
  }
}

// Vector Store Tool 连接到 Agent 的 ai_tool 端口
// Retriever 连接到 Vector Store Tool
// Embedding 连接到 Retriever 和 Vector Store
```

---

## Best Practices

**写入阶段**：
- 写入和查询使用相同的 Embedding 模型
- 用 Namespace/Collection 隔离不同知识库
- Metadata 包含四件套用于溯源
- chunkOverlap 不要设为 0（代码类文档除外）
- 不要跳过 Text Splitter 直接存大文档

**查询阶段**：
- Multi-Query 提高召回率（推荐 queryCount: 5）
- topK 从 10 开始调优，按需增减
- 不要混用不同维度的 Embedding

**维护阶段**：
- 定期清理过期向量（通过 upload_time 判断）
- 更换 Embedding 模型后必须全量重建索引
- 监控检索质量，按需调整 chunkSize 和 topK
