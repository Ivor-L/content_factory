# AI Agent Workflow Pattern

**Use Case**: Build AI agents with tool access, memory, and reasoning capabilities.

---

## Pattern Structure

```
Trigger → AI Agent (Model + Tools + Memory) → [Process Response] → Output
```

**Key Characteristic**: AI-powered decision making with tool use

---

## Core AI Connection Types

n8n supports **8 AI connection types** for building agent workflows:

1. **ai_languageModel** - The LLM (OpenAI, Anthropic, etc.)
2. **ai_tool** - Functions the agent can call
3. **ai_memory** - Conversation context
4. **ai_outputParser** - Parse structured outputs
5. **ai_embedding** - Vector embeddings
6. **ai_vectorStore** - Vector database
7. **ai_document** - Document loaders
8. **ai_textSplitter** - Text chunking

---

## Core Components

### 1. Trigger
**Options**:
- **Webhook** - Chat interfaces, API calls (most common)
- **Manual** - Testing and development
- **Schedule** - Periodic AI tasks

### 2. AI Agent Node
**Purpose**: Orchestrate LLM with tools and memory

**Configuration**:
```javascript
{
  agent: "conversationalAgent",  // or "openAIFunctionsAgent"
  promptType: "define",
  text: "You are a helpful assistant that can search docs, query databases, and send emails."
}
```

**Connections**:
- **ai_languageModel input** - Connected to LLM node
- **ai_tool inputs** - Connected to tool nodes
- **ai_memory input** - Connected to memory node (optional)

### 3. Language Model
**Available providers**:
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Google (Gemini)
- Local models (Ollama, LM Studio)

**Example** (OpenAI Chat Model):
```javascript
{
  model: "gpt-4",
  temperature: 0.7,
  maxTokens: 1000
}
```

### 4. Tools (ANY Node Can Be a Tool!)
**Critical insight**: Connect ANY n8n node to agent via `ai_tool` port

**Common tool types**:
- HTTP Request - Call APIs
- Database nodes - Query data
- Code - Custom functions
- Search nodes - Web/document search
- Pre-built tool nodes (Calculator, Wikipedia, etc.)

### 5. Memory (Optional but Recommended)
**Purpose**: Maintain conversation context

**Types**:
- **Buffer Memory** - Store recent messages
- **Window Buffer Memory** - Store last N messages
- **Summary Memory** - Summarize conversation

### 6. Output Processing
**Purpose**: Format AI response for delivery

**Common patterns**:
- Return directly (chat response)
- Store in database (conversation history)
- Send to communication channel (Slack, email)

---

## Common Use Cases

### 1. Conversational Chatbot
**Flow**: Webhook (chat message) → AI Agent → Webhook Response

**Example** (Customer support bot):
```
1. Webhook (path: "chat", POST)
   - Receives: {user_id, message, session_id}

2. Window Buffer Memory (load context by session_id)

3. AI Agent
   ├─ OpenAI Chat Model (gpt-4)
   ├─ HTTP Request Tool (search knowledge base)
   ├─ Database Tool (query customer orders)
   └─ Window Buffer Memory (conversation context)

4. Code (format response)

5. Webhook Response (send reply)
```

**AI Agent prompt**:
```
You are a customer support assistant.
You can:
1. Search the knowledge base for answers
2. Look up customer orders
3. Provide shipping information

Be helpful and professional.
```

### 2. Document Q&A
**Flow**: Upload docs → Embed → Store → Query with AI

**Example** (Internal documentation assistant):
```
Setup Phase (run once):
1. Read Files (load documentation)
2. Text Splitter (chunk into paragraphs)
3. Embeddings (OpenAI Embeddings)
4. Vector Store (Pinecone/Qdrant) (store vectors)

Query Phase (recurring):
1. Webhook (receive question)
2. AI Agent
   ├─ OpenAI Chat Model (gpt-4)
   ├─ Vector Store Tool (search similar docs)
   └─ Buffer Memory (context)
3. Webhook Response (answer with citations)
```

### 3. Data Analysis Assistant
**Flow**: Request → AI Agent (with data tools) → Analysis → Visualization

**Example** (SQL analyst agent):
```
1. Webhook (data question: "What were sales last month?")

2. AI Agent
   ├─ OpenAI Chat Model (gpt-4)
   ├─ Postgres Tool (execute queries)
   └─ Code Tool (data analysis)

3. Code (generate visualization data)

4. Webhook Response (answer + chart data)
```

**Postgres Tool Configuration**:
```javascript
{
  name: "query_database",
  description: "Execute SQL queries to analyze sales data. Use SELECT queries only.",
  // Node executes AI-generated SQL
}
```

### 4. Workflow Automation Agent
**Flow**: Command → AI Agent → Execute actions → Report

**Example** (DevOps assistant):
```
1. Slack (slash command: /deploy production)

2. AI Agent
   ├─ OpenAI Chat Model (gpt-4)
   ├─ HTTP Request Tool (GitHub API)
   ├─ HTTP Request Tool (Deploy API)
   └─ Postgres Tool (deployment logs)

3. Agent actions:
   - Check if tests passed
   - Create deployment
   - Log deployment
   - Notify team

4. Slack (deployment status)
```

### 5. Email Processing Agent
**Flow**: Email received → AI Agent → Categorize → Route → Respond

**Example** (Support ticket router):
```
1. Email Trigger (new support email)

2. AI Agent
   ├─ OpenAI Chat Model (gpt-4)
   ├─ Vector Store Tool (search similar tickets)
   └─ HTTP Request Tool (create Jira ticket)

3. Agent actions:
   - Categorize urgency (low/medium/high)
   - Find similar past tickets
   - Create ticket in appropriate project
   - Draft response

4. Email (send auto-response)
5. Slack (notify assigned team)
```

---

## Tool Configuration

### Making ANY Node an AI Tool

**Critical concept**: Any n8n node can become an AI tool!

**Requirements**:
1. Connect node to AI Agent via `ai_tool` port (NOT main port)
2. Configure tool name and description
3. Define input schema (optional)

**Example** (HTTP Request as tool):
```javascript
{
  // Tool metadata (for AI)
  name: "search_github_issues",
  description: "Search GitHub issues by keyword. Returns issue titles and URLs.",

  // HTTP Request configuration
  method: "GET",
  url: "https://api.github.com/search/issues",
  sendQuery: true,
  queryParameters: {
    "q": "={{$json.query}} repo:{{$json.repo}}",
    "per_page": "5"
  }
}
```

**How it works**:
1. AI Agent sees tool: `search_github_issues(query, repo)`
2. AI decides to use it: `search_github_issues("bug", "n8n-io/n8n")`
3. n8n executes HTTP Request with parameters
4. Result returned to AI Agent
5. AI Agent processes result and responds

### Pre-built Tool Nodes

**Available in @n8n/n8n-nodes-langchain**:

- **Calculator Tool** - Math operations
- **Wikipedia Tool** - Wikipedia search
- **Serper Tool** - Google search
- **Wolfram Alpha Tool** - Computational knowledge
- **Custom Tool** - Define with Code node

**Example** (Calculator Tool):
```
AI Agent
  ├─ OpenAI Chat Model
  └─ Calculator Tool (ai_tool connection)

User: "What's 15% of 2,847?"
AI: *uses calculator tool* → "426.05"
```

### Database as Tool

**Pattern**: Postgres/MySQL node connected as ai_tool

**Configuration**:
```javascript
{
  // Tool metadata
  name: "query_customers",
  description: "Query customer database. Use SELECT queries to find customer information by email, name, or ID.",

  // Postgres config
  operation: "executeQuery",
  query: "={{$json.sql}}",  // AI provides SQL
  // Security: Use read-only database user!
}
```

**Safety**: Create read-only DB user for AI tools!

```sql
CREATE USER ai_readonly WITH PASSWORD 'secure_password';
GRANT SELECT ON customers, orders TO ai_readonly;
-- NO INSERT, UPDATE, DELETE access
```

### Code Node as Tool

**Pattern**: Custom Python/JavaScript function

**Example** (Data processor):
```javascript
// Tool metadata
{
  name: "process_csv",
  description: "Process CSV data and return statistics. Input: csv_string"
}

// Code node
const csv = $input.first().json.csv_string;
const lines = csv.split('\n');
const data = lines.slice(1).map(line => line.split(','));

return [{
  json: {
    row_count: data.length,
    columns: lines[0].split(','),
    summary: {
      // Calculate statistics
    }
  }
}];
```

---

## Memory Configuration

### Buffer Memory
**Stores all messages** (until cleared)

```javascript
{
  memoryType: "bufferMemory",
  sessionKey: "={{$json.body.user_id}}"  // Per-user memory
}
```

### Window Buffer Memory
**Stores last N messages** (recommended)

```javascript
{
  memoryType: "windowBufferMemory",
  sessionKey: "={{$json.body.session_id}}",
  contextWindowLength: 10  // Last 10 messages
}
```

### Summary Memory
**Summarizes old messages** (for long conversations)

```javascript
{
  memoryType: "summaryMemory",
  sessionKey: "={{$json.body.session_id}}",
  maxTokenLimit: 2000
}
```

**How it works**:
1. Conversation grows beyond limit
2. AI summarizes old messages
3. Summary stored, old messages discarded
4. Saves tokens while maintaining context

---

## Agent Types

### 1. Conversational Agent
**Best for**: General chat, customer support

**Features**:
- Natural conversation flow
- Memory integration
- Tool use with reasoning

**When to use**: Most common use case

### 2. OpenAI Functions Agent
**Best for**: Tool-heavy workflows, structured outputs

**Features**:
- Optimized for function calling
- Better tool selection
- Structured responses

**When to use**: Multiple tools, need reliable tool calling

### 3. ReAct Agent
**Best for**: Step-by-step reasoning

**Features**:
- Think → Act → Observe loop
- Visible reasoning process
- Good for debugging

**When to use**: Complex multi-step tasks

---

## Prompt Engineering for Agents

### System Prompt Structure
```
You are a [ROLE].

You can:
- [CAPABILITY 1]
- [CAPABILITY 2]
- [CAPABILITY 3]

Guidelines:
- [GUIDELINE 1]
- [GUIDELINE 2]

Format:
- [OUTPUT FORMAT]
```

### Example (Customer Support)
```
You are a customer support assistant for Acme Corp.

You can:
- Search the knowledge base for answers
- Look up customer orders and shipping status
- Create support tickets for complex issues

Guidelines:
- Be friendly and professional
- If you don't know something, say so and offer to create a ticket
- Always verify customer identity before sharing order details

Format:
- Keep responses concise
- Use bullet points for multiple items
- Include relevant links when available
```

### Example (Data Analyst)
```
You are a data analyst assistant with access to the company database.

You can:
- Query sales, customer, and product data
- Perform data analysis and calculations
- Generate summary statistics

Guidelines:
- Write efficient SQL queries (always use LIMIT)
- Explain your analysis methodology
- Highlight important trends or anomalies
- Use read-only queries (SELECT only)

Format:
- Provide numerical answers with context
- Include query used (for transparency)
- Suggest follow-up analyses when relevant
```

---

## Error Handling

### Pattern 1: Tool Execution Errors
```
AI Agent (continueOnFail on tool nodes)
  → IF (tool error occurred)
    └─ Code (log error)
    └─ Webhook Response (user-friendly error)
```

### Pattern 2: LLM API Errors
```
Main Workflow:
  AI Agent → Process Response

Error Workflow:
  Error Trigger
    → IF (rate limit error)
      └─ Wait → Retry
    → ELSE
      └─ Notify Admin
```

### Pattern 3: Invalid Tool Outputs
```javascript
// Code node - validate tool output
const result = $input.first().json;

if (!result || !result.data) {
  throw new Error('Tool returned invalid data');
}

return [{ json: result }];
```

---

## Performance Optimization

### 1. Choose Right Model
```
Fast & cheap: GPT-3.5-turbo, Claude 3 Haiku
Balanced: GPT-4, Claude 3 Sonnet
Powerful: GPT-4-turbo, Claude 3 Opus
```

### 2. Limit Context Window
```javascript
{
  memoryType: "windowBufferMemory",
  contextWindowLength: 5  // Only last 5 messages
}
```

### 3. Optimize Tool Descriptions
```javascript
// ❌ Vague
description: "Search for things"

// ✅ Clear and concise
description: "Search GitHub issues by keyword and repository. Returns top 5 matching issues with titles and URLs."
```

### 4. Cache Embeddings
For document Q&A, embed documents once:

```
Setup (run once):
  Documents → Embed → Store in Vector DB

Query (fast):
  Question → Search Vector DB → AI Agent
```

### 5. Async Tools for Slow Operations
```
AI Agent → [Queue slow tool request]
       → Return immediate response
       → [Background: Execute tool + notify when done]
```

---

## Security Considerations

### 1. Read-Only Database Tools
```sql
-- Create limited user for AI tools
CREATE USER ai_agent_ro WITH PASSWORD 'secure';
GRANT SELECT ON public.* TO ai_agent_ro;
-- NO write access!
```

### 2. Validate Tool Inputs
```javascript
// Code node - validate before execution
const query = $json.query;

if (query.toLowerCase().includes('drop ') ||
    query.toLowerCase().includes('delete ') ||
    query.toLowerCase().includes('update ')) {
  throw new Error('Invalid query - write operations not allowed');
}
```

### 3. Rate Limiting
```
Webhook → IF (check user rate limit)
        ├─ [Within limit] → AI Agent
        └─ [Exceeded] → Error (429 Too Many Requests)
```

### 4. Sanitize User Input
```javascript
// Code node
const userInput = $json.body.message
  .trim()
  .substring(0, 1000);  // Max 1000 chars

return [{ json: { sanitized: userInput } }];
```

### 5. Monitor Tool Usage
```
AI Agent → Log Tool Calls
        → IF (suspicious pattern)
          └─ Alert Admin + Pause Agent
```

---

## Testing AI Agents

### 1. Start with Manual Trigger
Replace webhook with manual trigger:
```
Manual Trigger
  → Set (mock user input)
  → AI Agent
  → Code (log output)
```

### 2. Test Tools Independently
Before connecting to agent:
```
Manual Trigger → Tool Node → Verify output format
```

### 3. Test with Standard Questions
Create test suite:
```
1. "Hello" - Test basic response
2. "Search for bug reports" - Test tool calling
3. "What did I ask before?" - Test memory
4. Invalid input - Test error handling
```

### 4. Monitor Token Usage
```javascript
// Code node - log token usage
console.log('Input tokens:', $node['AI Agent'].json.usage.input_tokens);
console.log('Output tokens:', $node['AI Agent'].json.usage.output_tokens);
```

### 5. Test Edge Cases
- Empty input
- Very long input
- Tool returns no results
- Tool returns error
- Multiple tool calls in sequence

---

## Common Gotchas

### 1. ❌ Wrong: Connecting tools to main port
```
HTTP Request → AI Agent  // Won't work as tool!
```

### ✅ Correct: Use ai_tool connection type
```
HTTP Request --[ai_tool]--> AI Agent
```

### 2. ❌ Wrong: Vague tool descriptions
```
description: "Get data"  // AI won't know when to use this
```

### ✅ Correct: Specific descriptions
```
description: "Query customer orders by email address. Returns order ID, status, and shipping info."
```

### 3. ❌ Wrong: No memory for conversations
```
Every message is standalone - no context!
```

### ✅ Correct: Add memory
```
Window Buffer Memory --[ai_memory]--> AI Agent
```

### 4. ❌ Wrong: Giving AI write access
```
Postgres (full access) as tool  // AI could DELETE data!
```

### ✅ Correct: Read-only access
```
Postgres (read-only user) as tool  // Safe
```

### 5. ❌ Wrong: Unbounded tool responses
```
Tool returns 10MB of data → exceeds token limit
```

### ✅ Correct: Limit tool output
```javascript
{
  query: "SELECT * FROM table LIMIT 10"  // Only 10 rows
}
```

---

## Real Template Examples

From n8n template library (234 AI templates):

**Simple Chatbot**:
```
Webhook → AI Agent (GPT-4 + Memory) → Webhook Response
```

**Document Q&A**:
```
Setup: Files → Embed → Vector Store
Query: Webhook → AI Agent (GPT-4 + Vector Store Tool) → Response
```

**SQL Analyst**:
```
Webhook → AI Agent (GPT-4 + Postgres Tool) → Format → Response
```

Use `search_templates({query: "ai agent"})` to find more!

---

## Checklist for AI Agent Workflows

### Planning
- [ ] Define agent purpose and capabilities
- [ ] List required tools (APIs, databases, etc.)
- [ ] Design conversation flow
- [ ] Plan memory strategy (per-user, per-session)
- [ ] Consider token costs

### Implementation
- [ ] Choose appropriate LLM model
- [ ] Write clear system prompt
- [ ] Connect tools via ai_tool ports (NOT main)
- [ ] Add tool descriptions
- [ ] Configure memory (Window Buffer recommended)
- [ ] Test each tool independently

### Security
- [ ] Use read-only database access for tools
- [ ] Validate tool inputs
- [ ] Sanitize user inputs
- [ ] Add rate limiting
- [ ] Monitor for abuse

### Testing
- [ ] Test with diverse inputs
- [ ] Verify tool calling works
- [ ] Check memory persistence
- [ ] Test error scenarios
- [ ] Monitor token usage and costs

### Deployment
- [ ] Add error handling
- [ ] Set up logging
- [ ] Monitor performance
- [ ] Set cost alerts
- [ ] Document agent capabilities

---

## Summary

**Key Points**:
1. **8 AI connection types** - Use ai_tool for tools, ai_memory for context
2. **ANY node can be a tool** - Connect to ai_tool port
3. **Memory is essential** for conversations (Window Buffer recommended)
4. **Tool descriptions matter** - AI uses them to decide when to call tools
5. **Security first** - Read-only database access, validate inputs

**Pattern**: Trigger → AI Agent (Model + Tools + Memory) → Output

**Related**:
- [webhook_processing.md](webhook_processing.md) - Receiving chat messages
- [http_api_integration.md](http_api_integration.md) - Tools that call APIs
- [database_operations.md](database_operations.md) - Database tools for agents

---

## Multi-Model Routing

**Use Case**: 根据任务类型将请求路由到不同的 AI 模型，优化成本和性能。

### Pattern Structure

```
Trigger → Switch(task_type) → [Route A: GPT-4] → Merge → Output
                             → [Route B: Claude] ↗
                             → [Route C: Local LLM] ↗
```

### Switch 节点配置

Switch 节点（typeVersion: 3）根据任务类型分发：

```javascript
{
  type: "n8n-nodes-base.switch",
  typeVersion: 3,
  parameters: {
    rules: {
      values: [
        {
          conditions: {
            conditions: [{ leftValue: "={{ $json.task_type }}", operator: { type: "string", operation: "equals" }, rightValue: "reasoning" }]
          },
          outputKey: "complex_reasoning"
        },
        {
          conditions: {
            conditions: [{ leftValue: "={{ $json.task_type }}", operator: { type: "string", operation: "equals" }, rightValue: "creative" }]
          },
          outputKey: "creative_generation"
        },
        {
          conditions: {
            conditions: [{ leftValue: "={{ $json.task_type }}", operator: { type: "string", operation: "equals" }, rightValue: "classify" }]
          },
          outputKey: "simple_classification"
        }
      ]
    },
    options: { fallbackOutput: "extra" }  // 未匹配走默认路由
  }
}
```

### 各路由 LLM 配置

- **路由 A**（复杂推理）: GPT-4, temperature: 0.3, maxTokens: 4000
- **路由 B**（创意生成）: Claude, temperature: 0.8, maxTokens: 2000
- **路由 C**（简单分类）: Local Ollama, temperature: 0

### Merge 统一出口

使用 Merge 节点（mode: `chooseBranch`）统一所有路由的输出格式：

```javascript
{
  type: "n8n-nodes-base.merge",
  typeVersion: 3,
  parameters: {
    mode: "chooseBranch",
    output: "empty"  // 仅转发有数据的分支
  }
}
```

### 最佳实践

- 每条路由出口前用 Set 节点统一输出 schema
- Switch 设置 `fallbackOutput` 默认路由，避免未匹配请求丢失
- 不要在路由中硬编码模型选择，通过参数容器集中管理模型名称

---

## Multi-Agent Chain

**Use Case**: 多个 AI Agent 串行协作，每个 Agent 负责不同子任务。

### Pattern Structure

```
Trigger → Agent 1(Research) → Set(context) → Agent 2(Analysis) → Set(context) → Agent 3(Writing) → Output
```

### 链式传递元数据

关键：用 Set 节点在 Agent 之间传递上下文。

- Agent 1 输出 → Set 节点提取关键信息 → 注入 Agent 2 的 System Prompt
- 每个 Agent 的 System Prompt 通过表达式引用上游结果

### Agent 间上下文传递配置

Set 节点（在 Agent 1 和 Agent 2 之间）：

```javascript
{
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  parameters: {
    mode: "manual",
    assignments: {
      assignments: [
        { name: "research_summary", value: "={{ $json.output }}", type: "string" },
        {
          name: "key_findings",
          value: "={{ $json.output.match(/关键发现[：:](.*?)(?=\\n|$)/)?.[1] || '' }}",
          type: "string"
        }
      ]
    }
  }
}
```

Agent 2 的 System Prompt 引用上游结果：

```
基于以下研究结果进行分析：{{ $node['Set-Context'].json.research_summary }}

关键发现：{{ $node['Set-Context'].json.key_findings }}
```

### 错误处理

- 每个 Agent 后加 IF 检查输出是否有效（`{{ $json.output !== '' }}`）
- Agent 超时使用 `onError: "continueRegularOutput"` + 默认响应
- 链路中任一环节失败时，通过 Error Workflow 通知并记录断点位置

---

## Prompt Templates

**Use Case**: 在全局参数容器中管理 System Prompt 模板，便于维护和复用。

### 实现方式

全局参数容器（Set 节点）集中管理所有 Prompt：

```javascript
{
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  parameters: {
    mode: "manual",
    assignments: {
      assignments: [
        {
          name: "system_prompt_analyst",
          value: "你是一个数据分析专家。\\n你的职责是：\\n1. 分析数据趋势\\n2. 提供可操作的洞察\\n3. 用清晰的语言解释复杂数据",
          type: "string"
        },
        {
          name: "system_prompt_writer",
          value: "你是一个专业文案撰写者。\\n风格要求：\\n1. 简洁有力\\n2. 面向目标受众\\n3. 包含明确的行动号召",
          type: "string"
        }
      ]
    }
  }
}
```

AI Agent 引用模板：

```javascript
{
  text: "={{ $node['设置参数-综合'].json.system_prompt_analyst }}"
}
```

### 最佳实践

- Prompt 集中在参数容器管理，修改时只需改一处
- 用 `\\n` 换行（Set 节点不支持多行值）
- 不要在 Agent 节点内直接写长 Prompt，难以维护和复用

---

## Dynamic Prompt Assembly

**Use Case**: 根据运行时数据动态组装 Prompt。

### 实现方式

Code 节点根据输入数据条件拼接 Prompt：

```javascript
const data = $input.first().json;
const sections = [];

if (data.product_name) {
  sections.push(`产品名称：${data.product_name}`);
}
if (data.target_audience) {
  sections.push(`目标受众：${data.target_audience}`);
}
if (data.competitors?.length) {
  sections.push(`竞品列表：\n${data.competitors.map(c => `- ${c}`).join('\n')}`);
}

const prompt = `请基于以下信息生成营销文案：\n\n${sections.join('\n\n')}`;
return [{ json: { dynamic_prompt: prompt } }];
```

### AI Agent 引用

```javascript
{
  text: "={{ $json.dynamic_prompt }}"
}
```

### 适用场景

- 输入字段不固定，需按条件组装上下文
- 多数据源汇聚后拼接为统一 Prompt
- 模板中需要插入动态列表或表格

---

## Few-Shot Injection

**Use Case**: 动态注入示例到 Prompt 中，提高输出质量和一致性。

### 实现方式

Code 节点构建 few-shot 示例块：

```javascript
const examples = $input.all().slice(0, 3);  // 取前 3 个作为示例

const fewShotBlock = examples.map((ex, i) => {
  return `示例 ${i + 1}：\n输入：${ex.json.input}\n输出：${ex.json.output}`;
}).join('\n\n');

const prompt = `请按照以下示例的风格处理新输入：

${fewShotBlock}

现在请处理：
输入：{{ $json.new_input }}`;

return [{ json: { prompt_with_examples: prompt } }];
```

### 注意事项

- **示例数量**：3-5 个最佳，过多会消耗 token 且效果递减
- **示例来源**：可从数据库或 Airtable 动态获取，保持示例库更新
- **示例选择**：选择与当前输入最相似的示例效果更好（可用 Embedding 相似度筛选）
- **格式一致**：所有示例的输入/输出格式必须一致，否则会误导模型

---

## Structured Output Constraints

**Use Case**: 确保 LLM 输出可解析的结构化数据。

### JSON Mode

OpenAI Chat Model 配置强制 JSON 输出：

```javascript
{
  model: "gpt-4o",
  options: {
    responseFormat: "json_object"
  }
}
```

System Prompt 中添加格式指令：

```
请严格按以下 JSON 格式输出：
{"title": "string", "summary": "string", "score": number}
```

### XML 标签约束

当 JSON Mode 不可用时（如 Claude、Ollama），使用 XML 标签：

System Prompt：

```
将你的回答放在以下标签中：
<analysis>你的分析内容</analysis>
<recommendation>你的建议</recommendation>
```

后续 Code 节点提取：

```javascript
const text = $json.output;
const analysis = text.match(/<analysis>([\s\S]*?)<\/analysis>/)?.[1]?.trim() || '';
const recommendation = text.match(/<recommendation>([\s\S]*?)<\/recommendation>/)?.[1]?.trim() || '';
return [{ json: { analysis, recommendation } }];
```

### 最佳实践

- JSON Mode + Schema 描述 = 最可靠的结构化输出
- XML 标签作为 fallback，兼容所有模型
- 后处理节点做格式校验，不要只靠 Prompt 约束
- 对关键字段做 `|| ''` 兜底，防止正则未匹配时返回 undefined
