# Step 04: 知识库查询

> **执行者**: 主Agent
> **输入**: `{run_dir}/state/config.json`（含 `confirmed_plan`）
> **输出**: 架构模式 + 节点规范知识（内存）

---

## 执行说明

读取 config.json 获取 `workflow_type` 和 `confirmed_plan`，根据类型和已确认方案读取对应的 reference/ 文件获取构建知识。

### 读取配置

```
Read {run_dir}/state/config.json → 获取 workflow_type、needs_code_node、confirmed_plan 等字段
```

### 必读文件

每次执行都必须读取：

| 文件 | 用途 |
|------|------|
| `reference/tools/mcp-tools-expert.md` | MCP 工具使用方法 |
| `reference/patterns/workflow-patterns.md` | 架构模式总览 |

### 按需搜索（节点目录）

> **重要**：`nodes-catalog.md` 包含 540 个节点（~76KB），**禁止全量读取**。

根据 `confirmed_plan` 中的关键词，用 Grep 按需搜索 `reference/catalog/nodes-catalog.md`：

```
Grep pattern="关键词" path="reference/catalog/nodes-catalog.md" output_mode="content"
```

搜索策略：
- 从 `confirmed_plan.services` 和 `confirmed_plan.key_nodes` 提取关键词
- 每个关键词搜索一次，获取匹配的节点行（含 nodeType、凭证、文档链接）
- nodeType 列已是 MCP 格式（`nodes-base.xxx` / `nodes-langchain.xxx`），可直接用于 Step 06 的 `get_node` 调用

### 按类型读取

| workflow_type | 必读 | 可选 |
|--------------|------|------|
| `form_trigger` | `reference/patterns/form-trigger.md` | `reference/specs/expression-syntax.md` |
| `webhook` | `reference/patterns/webhook-processing.md` | `reference/specs/expression-syntax.md` |
| `http_api` | `reference/patterns/http-api-integration.md` | `reference/specs/node-operation-patterns.md` |
| `database` | `reference/patterns/database-operations.md` | `reference/specs/node-dependencies.md` |
| `ai_agent` | `reference/patterns/ai-agent-workflow.md` | `reference/specs/node-configuration.md` |
| `scheduled` | `reference/patterns/scheduled-tasks.md` | `reference/specs/expression-syntax.md` |

### 按编排模式读取

当 `confirmed_plan` 涉及以下关键词时，额外读取编排模式文档：

| 关键词 | 读取文件 |
|--------|----------|
| 批处理 / batch / split / 分批 / 大量数据 | `reference/patterns/orchestration-patterns.md` → Split-Process-Aggregate |
| 轮询 / polling / 异步等待 / wait / 状态查询 | `reference/patterns/orchestration-patterns.md` → Async Polling |
| 子工作流 / sub-workflow / executeWorkflow / 复用 | `reference/patterns/orchestration-patterns.md` → Sub-Workflow |
| RAG / 向量 / vector / embedding / 检索增强 | `reference/specs/vector-store-config.md` |
| 工程规范 / 参数容器 / StickyNote / 命名规范 | `reference/specs/workflow-conventions.md` |

### 按 confirmed_plan 调整

当 `confirmed_plan` 存在时，根据其中的 `services` 和 `key_nodes` 调整知识查询策略：

| 条件 | 动作 |
|------|------|
| `confirmed_plan.services` 包含特定 API | 额外读取相关节点配置文档 |
| `confirmed_plan.key_nodes` 包含 code 节点 | 读取对应语言的 Code 节点文档 |
| `confirmed_plan.architecture` 涉及特殊模式 | 读取对应的架构模式文档 |

### 按需读取

| 条件 | 读取文件 |
|------|----------|
| `needs_code_node == true` 且 JS | `reference/code/javascript/code-javascript.md` |
| `needs_code_node == true` 且 Python | `reference/code/python/code-python.md` |
| 涉及复杂表达式 | `reference/specs/expression-syntax.md` + `reference/specs/expression-mistakes.md` |
| 涉及节点配置 | `reference/specs/node-configuration.md` + `reference/specs/node-dependencies.md` |

### 官方文档 WebFetch 策略

当 `confirmed_plan.key_nodes` 包含 `[L2]` 层级节点且 `nodes-catalog.md` 中有对应 `[docs]` 链接时，可提前获取官方文档补充知识：

| 步骤 | 操作 |
|------|------|
| 1 | Grep `nodes-catalog.md` 获取节点行，提取 `[docs]` 链接 |
| 2 | 对不确定参数的关键节点（非 L3），WebFetch 官方文档页 |
| 3 | 提取操作列表、必填参数、认证方式、版本变更说明 |

| 规则 | 说明 |
|------|------|
| 触发条件 | `[L2]` 节点且在 `confirmed_plan.services` 中处于核心地位 |
| 上限 | 最多 3 个节点的文档，避免 token 浪费 |
| 跳过 | `[L3]` 节点（reference/ 已有深度知识）、无 `[docs]` 链接的节点 |

> **与 Step 08 的区别**：Step 04 是预防性获取（构建前），Step 08 是修复性获取（验证失败后）。前者减少后者的触发频率。

### 三层知识查询

本 Skill 采用三层知识架构实现 434 节点全覆盖：

| 层级 | 来源 | 解决什么 | 覆盖率 |
|------|------|---------|--------|
| Layer 1 | `reference/catalog/nodes-catalog.md`（Grep 按需搜索） | 节点发现：有哪些节点、分类、凭证、文档链接 | 540/540 = 100%（含 106 个 AI 节点） |
| Layer 2 | MCP `get_node(nodeType="{catalog 中的 nodeType}")` | 节点配置：properties、operations、示例 | 任意节点 |
| Layer 3 | `reference/patterns/` + `reference/specs/` | 深度知识：架构模式、陷阱、最佳实践 | 6 种模式 + 12 核心节点 |

**节点定位流程**：

1. 根据 `confirmed_plan` 中的需求关键词，在 `nodes-catalog.md` 中搜索候选节点
2. 对每个候选节点标注信息来源层级：
   - `[L3]` — reference/ 有深度文档（优先使用）
   - `[L2]` — 需通过 MCP `get_node` 获取配置（Step 06 执行）
3. 对需要凭证的节点，查阅 `reference/catalog/credentials-map.md` 确认凭证类型

### 知识提取

从读取的文件中提取以下关键信息：

| 信息 | 来源 | 用途 |
|------|------|------|
| 架构骨架 | patterns/*.md | Step 05 设计蓝图 |
| 候选节点 | catalog/nodes-catalog.md | Step 05 节点选型 |
| 凭证需求 | catalog/credentials-map.md | Step 07 凭据配置 |
| 连接模式 | patterns/*.md | Step 06 连接拓扑 |
| 表达式模式 | specs/expression-*.md | Step 06 数据映射 |
| 配置要点 | specs/node-*.md | Step 06 节点参数 |

---

## 更新进度

完成后更新 `{run_dir}/state/progress.json`：

```json
{
  "step": "step04-knowledge",
  "step_status": { "step04-knowledge": "completed" },
  "updated_at": "{当前时间}",
  "恢复提示": { "resume": "Step 04 完成，知识已提取，进入 Step 05 架构设计" }
}
```

---

## 验证检查点

| 编号 | 检查项 | 通过标准 |
|------|--------|----------|
| 4a | 架构模式已读取 | 对应模式文档已读取 |
| 4b | MCP 工具文档已读取 | mcp-tools-expert.md 已读取 |
| 4c | 节点目录已查询 | 候选节点已从 nodes-catalog.md 定位，并标注层级 |
| 4d | confirmed_plan 已参考 | 知识查询策略与确认方案一致 |
| 4e | 关键知识已提取 | 能描述出架构骨架和核心节点 |
| 4e+ | 关键 L2 节点文档已获取（如适用） | WebFetch 了核心 L2 节点的官方文档 |
| 4f | progress.json 已更新 | step04 标记 completed |

---

## 下一步

-> `Step 05: 架构设计`
