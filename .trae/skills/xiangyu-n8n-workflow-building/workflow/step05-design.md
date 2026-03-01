# Step 05: 架构设计

> **执行者**: 主Agent
> **输入**: `{run_dir}/state/config.json`（含 `confirmed_plan`）+ Step 04 知识
> **输出**: `{run_dir}/step05-design/design.md`

---

## 执行说明

基于用户确认的方案（`confirmed_plan`）和知识库知识，输出工作流设计稿并写入 `step05-design/design.md`。

### 读取配置

```
Read {run_dir}/state/config.json → 获取 workflow_name、workflow_type、business_logic、confirmed_plan 等
```

### 设计稿结构

设计稿写入 `{run_dir}/step05-design/design.md`，必须包含以下部分：

#### 1. 节点清单

列出工作流需要的所有节点，`nodeType` 必须来自 `nodes-catalog.md`（社区节点来自 `search_nodes`）：

| 序号 | 节点名称 | nodeType | 知识层级 | 来源 | npm | 职责 | 关键参数 |
|------|---------|----------|---------|------|-----|------|----------|
| 1 | Webhook | `webhook` | [L3] | core | - | 接收请求 | path, method |
| 2 | Set | `set` | [L3] | core | - | 数据转换 | 字段映射 |
| 3 | Notion | `@xxx/n8n-nodes-notion.notion` | [L2] | community | n8n-nodes-notion | 写入数据库 | database |
| ... | ... | ... | ... | ... | ... | ... | ... |

**知识层级标注**：

| 标记 | 含义 | Step 06 行为 |
|------|------|-------------|
| `[L3]` | reference/ 有深度文档 | 优先使用 Pattern 知识 |
| `[L2]` | 依赖 MCP `get_node` | 必须调用 `get_node(detail="standard", includeExamples=true)` |

**来源标注**：

| 来源 | 说明 | npm 列 |
|------|------|--------|
| core | 内置节点（nodes-base / nodes-langchain） | `-` |
| verified | 已认证社区节点 | 必填 npm 包名 |
| community | 普通社区节点 | 必填 npm 包名 |

> **注意**：节点清单必须基于 `confirmed_plan.key_nodes` 和 `confirmed_plan.architecture`。内置节点 nodeType 必须在 `nodes-catalog.md` 中存在，社区节点 nodeType 来自 `search_nodes` 返回值。来源和 npm 信息来自 `confirmed_plan.key_nodes`。

#### 2. 连接拓扑

描述节点之间的连接关系：

```
Webhook -> Set -> IF -> [true] -> Slack
                    -> [false] -> NoOp
```

#### 3. 表达式映射

列出需要使用表达式的字段：

| 节点 | 字段 | 表达式 | 说明 |
|------|------|--------|------|
| Set | field1 | `{{ $json.body.action }}`（webhook）/ `{{ $json["Action"] }}`（form_trigger） | 提取触发器数据 |
| Slack | message | `{{ $json.field1 }}` | 发送消息内容 |

#### 4. Code 节点逻辑（如需要）

| 节点名 | 语言 | 功能描述 | 输入 | 输出 |
|--------|------|---------|------|------|
| Transform | JavaScript | 转换数据格式 | raw payload | formatted data |

#### 5. 表单字段定义（form_trigger 类型必填）

当 `workflow_type == form_trigger` 时，设计稿必须包含表单字段定义：

**formTrigger 元信息**：

| 属性 | 值 | 说明 |
|------|------|------|
| path | `{keyword}` | 表单 URL 路径 |
| formTitle | `{workflow_name}` | 表单标题 |
| responseMode | `lastNode` | Pattern A（Form Ending Show Text）和 Pattern B（respondToWebhook）均设置 `lastNode` |

**字段定义**：

| 序号 | fieldLabel | fieldType | required | placeholder | 说明 |
|------|-----------|-----------|----------|-------------|------|
| 1 | API Key | password | Yes | sk-... | 密钥输入 |
| 2 | Prompt | textarea | Yes | Describe... | 用户输入 |
| ... | ... | ... | ... | ... | ... |

> **注意**：fieldLabel 与下游表达式引用必须完全一致。Form Trigger 表达式使用 `$json["Field Label"]`（扁平访问），不是 Webhook 的 `$json.body.x`。

#### 6. 编排模式标注（如适用）

当工作流涉及批处理、异步轮询或子工作流时，标注所选编排模式：

| 编排模式 | 关键节点 | 配置要点 |
|---------|---------|---------|
| Split-Process-Aggregate | SplitInBatches(batchSize=?) / Aggregate | 循环连接、Done 输出位置 |
| 异步轮询 | Wait(interval=?) / IF(status check) | maxRetries、超时退出路径 |
| 子工作流 | Execute Workflow(workflowId=?) | waitForSubWorkflow、参数传递 |

> **参考**：`reference/patterns/orchestration-patterns.md` + `reference/rules/pattern-checklist.md`

#### 7. 第三方服务集成（基于 confirmed_plan）

| 服务 | API 端点 | 用途 | 对应节点 |
|------|---------|------|---------|
| {confirmed_plan.services[0]} | {endpoint} | {用途} | {node_name} |

### 设计原则

| 原则 | 说明 |
|------|------|
| 最小节点数 | 能用内置节点解决的不用 Code 节点 |
| 错误处理 | 关键节点添加 Error Trigger |
| 数据流清晰 | 每个节点只做一件事 |
| 命名规范 | 节点名反映功能（如 `Parse Webhook Data`） |

---

## 更新进度

设计稿写入后，更新 `{run_dir}/state/progress.json`：

```json
{
  "step": "step05-design",
  "step_status": { "step05-design": "completed" },
  "updated_at": "{当前时间}",
  "恢复提示": { "resume": "Step 05 完成，设计稿在 step05-design/design.md，进入 Step 06 构建" }
}
```

---

## 验证检查点

| 编号 | 检查项 | 通过标准 |
|------|--------|----------|
| 5a | 节点清单完整 | 覆盖所有业务需求，每个节点有 nodeType 和知识层级标注 |
| 5b | 连接拓扑合理 | 无孤立节点，数据流通畅 |
| 5c | 表达式正确 | 引用路径与上游节点输出匹配 |
| 5d | 设计稿已确认 | 向用户展示设计稿并确认 |
| 5e | design.md 已写入 | `{run_dir}/step05-design/design.md` 存在 |
| 5f | progress.json 已更新 | step05 标记 completed |

---

## 下一步

-> `Step 06: 工作流构建`
