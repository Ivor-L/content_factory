# n8n Workflow Patterns

Proven architectural patterns for building n8n workflows.

---

## The 6 Core Patterns

Based on analysis of real workflow usage:

1. **[Form Trigger + Form Ending](form-trigger.md)** (Recommended Default)
   - Collect user input via native Web form → Process → Display results on completion page
   - Pattern: Form Trigger → Validate → Process → Form Ending
   - Why: Built-in completion page delivers results to users in a friendly UI

2. **[Webhook Processing](webhook_processing.md)** (Most Common for System Callbacks)
   - Receive HTTP requests → Process → Output
   - Pattern: Webhook → Validate → Transform → Respond/Notify

3. **[HTTP API Integration](http_api_integration.md)**
   - Fetch from REST APIs → Transform → Store/Use
   - Pattern: Trigger → HTTP Request → Transform → Action → Error Handler

4. **[Database Operations](database_operations.md)**
   - Read/Write/Sync database data
   - Pattern: Schedule → Query → Transform → Write → Verify

5. **[AI Agent Workflow](ai_agent_workflow.md)**
   - AI agents with tools and memory
   - Pattern: Trigger → AI Agent (Model + Tools + Memory) → Output

6. **[Scheduled Tasks](scheduled_tasks.md)**
   - Recurring automation workflows
   - Pattern: Schedule → Fetch → Process → Deliver → Log

7. **[Orchestration Patterns](orchestration-patterns.md)** (Cross-cutting)
   - 编排模式：批处理、异步轮询、子工作流
   - 16/23 实战工作流使用批处理模式

---

## Pattern Selection Guide

### When to use each pattern:

**Form Trigger + Form Ending** (首选) - Use when:
- Collecting user input through a web form
- Building tools that need password/secret masking
- Need built-in field validation (required, type constraints)
- Users interact via browser, not API calls
- Want a friendly completion page to display results (Form Ending)
- Example: "Web form collects API key + prompt → Call AI API → Completion page shows result"
- Note: Use respondToWebhook instead of Form Ending only when caller needs raw JSON/API response

**Webhook Processing** - Use when:
- Receiving data from external systems
- Building integrations (Slack commands, form submissions, GitHub webhooks)
- Need instant response to events
- Example: "Receive Stripe payment webhook → Update database → Send confirmation"

**HTTP API Integration** - Use when:
- Fetching data from external APIs
- Synchronizing with third-party services
- Building data pipelines
- Example: "Fetch GitHub issues → Transform → Create Jira tickets"

**Database Operations** - Use when:
- Syncing between databases
- Running database queries on schedule
- ETL workflows
- Example: "Read Postgres records → Transform → Write to MySQL"

**AI Agent Workflow** - Use when:
- Building conversational AI
- Need AI with tool access
- Multi-step reasoning tasks
- Example: "Chat with AI that can search docs, query database, send emails"

**Scheduled Tasks** - Use when:
- Recurring reports or summaries
- Periodic data fetching
- Maintenance tasks
- Example: "Daily: Fetch analytics → Generate report → Email team"

---

## Common Workflow Components

All patterns share these building blocks:

### 1. Triggers
- **Form Trigger + Form Ending** - Native web form + completion page (recommended for user input)
- **Webhook** - HTTP endpoint (system callbacks)
- **Schedule** - Cron-based timing (periodic)
- **Manual** - Click to execute (testing)
- **Polling** - Check for changes (intervals)

### 2. Data Sources
- **HTTP Request** - REST APIs
- **Database nodes** - Postgres, MySQL, MongoDB
- **Service nodes** - Slack, Google Sheets, etc.
- **Code** - Custom JavaScript/Python

### 3. Transformation
- **Set** - Map/transform fields
- **Code** - Complex logic
- **IF/Switch** - Conditional routing
- **Merge** - Combine data streams

### 4. Outputs
- **HTTP Request** - Call APIs
- **Database** - Write data
- **Communication** - Email, Slack, Discord
- **Storage** - Files, cloud storage

### 5. Error Handling
- **Error Trigger** - Catch workflow errors
- **IF** - Check for error conditions
- **Stop and Error** - Explicit failure
- **Continue On Fail** - Per-node setting

---

## Workflow Creation Checklist

When building ANY workflow, follow this checklist:

### Planning Phase
- [ ] Identify the pattern (webhook, API, database, AI, scheduled)
- [ ] List required nodes (use search_nodes)
- [ ] Understand data flow (input → transform → output)
- [ ] Plan error handling strategy

### Implementation Phase
- [ ] Create workflow with appropriate trigger
- [ ] Add data source nodes
- [ ] Configure authentication/credentials
- [ ] Add transformation nodes (Set, Code, IF)
- [ ] Add output/action nodes
- [ ] Configure error handling

### Validation Phase
- [ ] Validate each node configuration (validate_node)
- [ ] Validate complete workflow (validate_workflow)
- [ ] Test with sample data
- [ ] Handle edge cases (empty data, errors)

### Deployment Phase
- [ ] Review workflow settings (execution order, timeout, error handling)
- [ ] Activate workflow using `activateWorkflow` operation
- [ ] Monitor first executions
- [ ] Document workflow purpose and data flow

---

## Data Flow Patterns

### Linear Flow
```
Trigger → Transform → Action → End
```
**Use when**: Simple workflows with single path

### Branching Flow
```
Trigger → IF → [True Path]
             └→ [False Path]
```
**Use when**: Different actions based on conditions

### Parallel Processing
```
Trigger → [Branch 1] → Merge
       └→ [Branch 2] ↗
```
**Use when**: Independent operations that can run simultaneously

### Loop Pattern
```
Trigger → Split in Batches → Process → Loop (until done)
```
**Use when**: Processing large datasets in chunks

### Error Handler Pattern
```
Main Flow → [Success Path]
         └→ [Error Trigger → Error Handler]
```
**Use when**: Need separate error handling workflow

### Split-Process-Aggregate (Batch)
```
Trigger → Set(params) → SplitInBatches → [Process Each] → Loop
                                Done ↓
                              Aggregate → Output
```
**Use when**: Processing large datasets, API rate limiting, memory constraints
**Details**: [orchestration-patterns.md](orchestration-patterns.md) → Section 1

### Async Polling
```
Submit Task → Wait(interval) → Poll Status → IF(done?)
                   ↑              [No] ────────↗
                                  [Yes] → Process Result → Output
```
**Use when**: Waiting for async task completion (video gen, file conversion)
**Details**: [orchestration-patterns.md](orchestration-patterns.md) → Section 2

---

## Common Gotchas

### 1. Webhook Data Structure
**Problem**: Can't access webhook payload data

**Solution**: Data is nested under `$json.body`
```javascript
❌ {{$json.email}}
✅ {{$json.body.email}}
```
See: n8n Expression Syntax skill

### 2. Multiple Input Items
**Problem**: Node processes all input items, but I only want one

**Solution**: Use "Execute Once" mode or process first item only
```javascript
{{$json[0].field}}  // First item only
```

### 3. Authentication Issues
**Problem**: API calls failing with 401/403

**Solution**:
- Configure credentials properly
- Use the "Credentials" section, not parameters
- Test credentials before workflow activation

### 4. Node Execution Order
**Problem**: Nodes executing in unexpected order

**Solution**: Check workflow settings → Execution Order
- v0: Top-to-bottom (legacy)
- v1: Connection-based (recommended)

### 5. Expression Errors
**Problem**: Expressions showing as literal text

**Solution**: Use {{}} around expressions
- See n8n Expression Syntax skill for details

### 6. Form Trigger vs Webhook Data Structure
**Problem**: Using wrong data access pattern for trigger type

**Solution**: Form Trigger data is flat, Webhook data is nested under `.body`
```javascript
// Form Trigger
✅ {{$json["Field Label"]}}
❌ {{$json.body["Field Label"]}}

// Webhook
✅ {{$json.body.email}}
❌ {{$json.email}}
```
See: `reference/patterns/form-trigger.md`

---

## Integration with Other Skills

These skills work together with Workflow Patterns:

**n8n MCP Tools Expert** - Use to:
- Find nodes for your pattern (search_nodes)
- Understand node operations (get_node)
- Create workflows (n8n_create_workflow)
- Deploy templates (n8n_deploy_template)
- Use ai_agents_guide for AI pattern guidance

**n8n Expression Syntax** - Use to:
- Write expressions in transformation nodes
- Access webhook data correctly ({{$json.body.field}})
- Reference previous nodes ({{$node["Node Name"].json.field}})

**n8n Node Configuration** - Use to:
- Configure specific operations for pattern nodes
- Understand node-specific requirements

**n8n Validation Expert** - Use to:
- Validate workflow structure
- Fix validation errors
- Ensure workflow correctness before deployment

---

## Pattern Statistics

Common workflow patterns:

**Most Common Triggers**:
1. Form Trigger + Form Ending (recommended, completion page) - 35%
2. Webhook (system callbacks) - 25%
3. Schedule (periodic tasks) - 23%
4. Manual (testing/admin) - 12%
5. Service triggers (Slack, email, etc.) - 5%

**Most Common Transformations**:
1. Set (field mapping) - 68%
2. Code (custom logic) - 42%
3. IF (conditional routing) - 38%
4. Switch (multi-condition) - 18%

**Most Common Outputs**:
1. HTTP Request (APIs) - 45%
2. Slack - 32%
3. Database writes - 28%
4. Email - 24%

**Average Workflow Complexity**:
- Simple (3-5 nodes): 42%
- Medium (6-10 nodes): 38%
- Complex (11+ nodes): 20%

---

## Quick Start Examples

### Example 1: Simple Webhook → Slack
```
1. Webhook (path: "form-submit", POST)
2. Set (map form fields)
3. Slack (post message to #notifications)
```

### Example 2: Scheduled Report
```
1. Schedule (daily at 9 AM)
2. HTTP Request (fetch analytics)
3. Code (aggregate data)
4. Email (send formatted report)
5. Error Trigger → Slack (notify on failure)
```

### Example 3: Database Sync
```
1. Schedule (every 15 minutes)
2. Postgres (query new records)
3. IF (check if records exist)
4. MySQL (insert records)
5. Postgres (update sync timestamp)
```

### Example 4: AI Assistant
```
1. Webhook (receive chat message)
2. AI Agent
   ├─ OpenAI Chat Model (ai_languageModel)
   ├─ HTTP Request Tool (ai_tool)
   ├─ Database Tool (ai_tool)
   └─ Window Buffer Memory (ai_memory)
3. Webhook Response (send AI reply)
```

### Example 5: API Integration
```
1. Manual Trigger (for testing)
2. HTTP Request (GET /api/users)
3. Split In Batches (process 100 at a time)
4. Set (transform user data)
5. Postgres (upsert users)
6. Loop (back to step 3 until done)
```

---

## Detailed Pattern Files

For comprehensive guidance on each pattern:

- **[form-trigger.md](form-trigger.md)** - Form trigger patterns, field types, data access, templates
- **[webhook_processing.md](webhook_processing.md)** - Webhook patterns, data structure, response handling
- **[http_api_integration.md](http_api_integration.md)** - REST APIs, authentication, pagination, retries
- **[database_operations.md](database_operations.md)** - Queries, sync, transactions, batch processing
- **[ai_agent_workflow.md](ai_agent_workflow.md)** - AI agents, tools, memory, langchain nodes
- **[scheduled_tasks.md](scheduled_tasks.md)** - Cron schedules, reports, maintenance tasks
- **[orchestration-patterns.md](orchestration-patterns.md)** - Batch processing, async polling, sub-workflows

---

## Real Template Examples

From n8n template library:

**Template #2947**: Weather to Slack
- Pattern: Scheduled Task
- Nodes: Schedule → HTTP Request (weather API) → Set → Slack
- Complexity: Simple (4 nodes)

**Webhook Processing**: Most common pattern
- Most common: Form submissions, payment webhooks, chat integrations

**HTTP API**: Common pattern
- Most common: Data fetching, third-party integrations

**Database Operations**: Common pattern
- Most common: ETL, data sync, backup workflows

**AI Agents**: Growing in usage
- Most common: Chatbots, content generation, data analysis

Use `search_templates` and `get_template` from n8n-mcp tools to find examples!

---

## Best Practices

### ✅ Do

- Start with the simplest pattern that solves your problem
- Plan your workflow structure before building
- Use error handling on all workflows
- Test with sample data before activation
- Follow the workflow creation checklist
- Use descriptive node names
- Document complex workflows (notes field)
- Monitor workflow executions after deployment

### ❌ Don't

- Build workflows in one shot (iterate! avg 56s between edits)
- Skip validation before activation
- Ignore error scenarios
- Use complex patterns when simple ones suffice
- Hardcode credentials in parameters
- Forget to handle empty data cases
- Mix multiple patterns without clear boundaries
- Deploy without testing

---

## Summary

**Key Points**:
1. **6 core patterns** cover 90%+ of workflow use cases
2. **Form Trigger + Form Ending** is the recommended default for user input (completion page for best UX)
3. **Webhook processing** is recommended for system callbacks
4. Use the **workflow creation checklist** for every workflow
5. **Plan pattern** → **Select nodes** → **Build** → **Validate** → **Deploy**
6. Integrate with other skills for complete workflow development

**Next Steps**:
1. Identify your use case pattern
2. Read the detailed pattern file
3. Use n8n MCP Tools Expert to find nodes
4. Follow the workflow creation checklist
5. Use n8n Validation Expert to validate

**Related Skills**:
- n8n MCP Tools Expert - Find and configure nodes
- n8n Expression Syntax - Write expressions correctly
- n8n Validation Expert - Validate and fix errors
- n8n Node Configuration - Configure specific operations
