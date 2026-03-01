# Step 06: 工作流构建

> **执行者**: 主Agent
> **输入**: `{run_dir}/step05-design/design.md` + `{run_dir}/state/config.json`
> **输出**: n8n 工作流（草稿状态），workflow_id 写入 progress.json

---

## 执行说明

读取设计稿和配置，调用 n8n-mcp 工具在 n8n 实例上构建工作流。

### 读取输入

```
Read {run_dir}/step05-design/design.md → 获取设计蓝图
Read {run_dir}/state/config.json → 获取 workflow_name
```

### 构建流程

按以下顺序执行 MCP 工具调用：

**阶段 1：节点发现（三层查询）**

设计稿中每个节点已标注知识层级（Step 05），按层级执行不同策略：

| 层级 | 策略 | 说明 |
|------|------|------|
| `[L3]` | 优先使用 reference/patterns/ 知识 | 12 核心节点，配置信息已在 Skill 文档中 |
| `[L2]` | **必须**调用 MCP `get_node` | 非核心节点，运行时获取配置 |

**[L2] 节点的标准查询流程**：

```
get_node(nodeType="{catalog 中的 mcpNodeType}", detail="standard", includeExamples=true)
    -> 获取 properties + operations + 示例
```

**[L2] 节点的文档降级策略**：

当 `get_node` 返回的信息不足以确定参数配置时（如缺少必填参数说明、操作模式不明确），按以下优先级降级：

| 优先级 | 策略 | 说明 |
|--------|------|------|
| 1 | `get_node(detail="full")` | 获取完整 schema（3-8K tokens） |
| 2 | WebFetch 官方文档 | 从 `nodes-catalog.md` 的 `[docs]` 链接获取原文 |
| 3 | brave_web_search | `"n8n {node_type} configuration {operation} 2025 OR 2026"` |

> **规则**：优先级 2-3 仅在 Step 04 未预取该节点文档时触发。若 Step 04 已 WebFetch 过同一节点文档，直接复用缓存知识。

nodeType 直接使用 `nodes-catalog.md` 中的值，已是 MCP 格式：
- nodes-base 节点：`nodes-base.slack`、`nodes-base.formTrigger`
- langchain 节点：`nodes-langchain.agent`、`nodes-langchain.lmChatOpenAi`

**[L2-C] 社区节点的查询流程**：

对 `confirmed_plan.key_nodes` 中 `source: "community"` 或 `source: "verified"` 的节点：

```
get_node(nodeType="{search_nodes 返回的 workflowNodeType}", detail="standard", includeExamples=true)
    -> 获取 properties + operations + 示例
```

社区节点注意事项：

| 注意 | 说明 |
|------|------|
| nodeType 格式 | 社区节点前缀由 npm 包名决定，不在 `nodes-catalog.md` 中 |
| type 字段 | 工作流 JSON 中直接使用 `search_nodes` 返回的 `workflowNodeType` |
| typeVersion | 社区节点无固定版本表，使用 `get_node` 返回的默认值 |
| 安装前提 | 社区节点必须已安装到 n8n 实例才能正常使用 |

**[L3] 节点的验证流程**：

```
使用 reference/ 已有知识（patterns/*.md + specs/node-configuration.md）
仅在信息不足时补充调用 get_node
```

> **规则**：内置节点 nodeType 必须与 `nodes-catalog.md` 中的 nodeType 列完全一致，直接复制使用。社区节点 nodeType 使用 `search_nodes` 返回值。

**阶段 2：创建工作流**

```
n8n_create_workflow(
    name="工作流名称",
    nodes=[...初始节点配置...],
    connections={...连接定义...}
)
    -> 返回 workflow_id
```

**创建成功后立即写入 progress.json**：

```json
{
  "workflow_id": "{返回的 workflow_id}",
  "workflow_url": "{n8n 实例地址}/workflow/{workflow_id}"
}
```

**阶段 3：迭代完善**

```
n8n_update_partial_workflow(
    workflowId=workflow_id,
    nodes=[...更新的节点...],
    connections={...更新的连接...}
)
```

使用 `update_partial` 而非 `update_workflow`，避免覆盖已有配置。

### 参考文档

构建过程中按需查阅：

| 场景 | 参考文件 |
|------|----------|
| 搜索节点策略 | `reference/tools/search-guide.md` |
| 工作流创建/更新 | `reference/tools/workflow-guide.md` |
| 节点参数配置 | `reference/specs/node-configuration.md` |
| 节点属性依赖 | `reference/specs/node-dependencies.md` |
| 节点操作模式 | `reference/specs/node-operation-patterns.md` |
| 表达式语法 | `reference/specs/expression-syntax.md` |
| 表达式示例 | `reference/specs/expression-examples.md` |
| JS Code 节点 | `reference/code/javascript/code-javascript.md` |
| Python Code 节点 | `reference/code/python/code-python.md` |
| 编排模式（批处理/轮询/子工作流） | `reference/patterns/orchestration-patterns.md` |
| 工程规范（参数容器/命名/StickyNote） | `reference/specs/workflow-conventions.md` |
| 生产级 Code 模式 | `reference/code/javascript/production-patterns.md` |
| RAG 向量数据库配置 | `reference/specs/vector-store-config.md` |
| 模式验证清单（构建后检查） | `reference/rules/pattern-checklist.md` |

### 关键注意事项

| 注意 | 说明 |
|------|------|
| 节点位置 | 设置合理的 `position` 坐标，避免节点重叠 |
| 连接格式 | connections 使用 n8n 标准格式（source -> target） |
| 表达式引用 | 确保表达式中引用的节点名称与实际节点名一致 |
| 凭证绑定 | 需要认证的节点配置 credentials 引用 |
| 增量更新 | 优先用 `update_partial` 逐步添加节点 |

### typeVersion 信任链

MCP `get_node` 返回的 typeVersion 可能与实例实际运行版本不一致（如 MCP 返回 2.5，实例跑 2.3）。构建时必须遵循以下优先级：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1（最高） | reference/ 硬编码版本 | Skill 文档中经过验证的固定版本 |
| 2 | versions 模式交叉校验 | `get_node` 返回的 `versions` 数组与实例版本取交集 |
| 3（最低） | `get_node` 默认值 | 仅在无其他来源时使用，需人工确认 |

**已验证固定版本表**（直接使用，无需查询）：

| 节点类型 | typeVersion | 验证日期 |
|---------|-------------|----------|
| `nodes-base.formTrigger` | **2.3** | 2026-02-11 |
| `nodes-base.form`（Form Ending） | **2.3** | 2026-02-11 |
| `nodes-base.webhook` | **2** | 2026-02-11 |
| `nodes-base.respondToWebhook` | **1.1** | 2026-02-11 |

> **规则**：优先使用上表固定版本。遇到表中未列出的节点，按优先级 2 → 3 逐级确认。

---

### formTrigger 构建注意事项

当 `workflow_type == form_trigger` 时，额外注意：

| 注意 | 说明 |
|------|------|
| typeVersion | formTrigger 和 Form Ending 均为 **2.3**（见信任链表） |
| 字段名引用 | 下游表达式使用 **bracket notation**：`$json["Field Label"]` |
| 下游引用 key | Form Trigger 输出 key 是 **fieldLabel**（显示标签），Code 节点引用必须用 `$json["fieldLabel"]`，不是 fieldName |
| 数据结构 | 数据**扁平化**在 `$json` 根级，**无 body 嵌套** |
| responseMode | `lastNode` 模式需在工作流末尾添加 **respondToWebhook** 节点 |
| formFields | 字段定义来自 Step 05 设计稿的「表单字段定义」部分 |
| Form Ending 显示 | completionMessage **不渲染 Markdown**，只支持纯文本和 HTML。需在前置 Code 节点中将 Markdown 转为内联样式 HTML（`<h2>`、`<strong>`、`<br>`），确保结果页排版美观 |
| Form Ending 输出（文字） | `respondWith: "text"` + `completionMessage` 写 `={{ $json["html"] }}`（Completion Screen 模式，经 sanitize-html 清洗） |
| Form Ending 输出（图片） | `respondWith: "showText"` + `responseText` 写 `={{ $json["html"] }}`（Show Text 模式，**不清洗**，base64 图片可渲染） |
| webhookId 初始化 | `n8n_create_workflow` 不自动生成 webhookId。创建后必须通过 REST API PUT 为 Form Trigger 和 Form Ending 节点各分配一个 UUID v4 的 webhookId |
| Form Ending 模式选择 | 纯文字 → `respondWith: "text"`（Completion Screen，默认首选）；含图片 → `respondWith: "showText"`（Show Text）。不使用 Redirect 或默认消息 |
| 参数名对应 | `"text"` 模式用 `completionTitle` + `completionMessage`；`"showText"` 模式用 `responseText`（无 completionTitle） |
| limitWaitTime | Form Ending 必须设置 `limitWaitTime: true` + `resumeUnit: "minutes"` |

### Form 工作流标准链路

当 `workflow_type == form_trigger` 时，工作流**必须**遵循以下首尾结构：

**标准链路**：

```
Form Trigger → [业务节点...] → Format Output (Code) → Form Ending (Show Text)
```

| 位置 | 节点 | 配置要求 |
|------|------|---------|
| 首节点 | Form Trigger (v2.3) | formFields 定义表单字段，responseMode = `lastNode` |
| 末前节点 | Format Output (Code) | 输出 `{ html: "<html>..." }`，将 Markdown/纯文本转为内联样式 HTML |
| 末节点（文字） | Form Ending (v2.3) | `respondWith` = `"text"`，`completionMessage` = `={{ $json["html"] }}`，`limitWaitTime` = `true`，`resumeUnit` = `"minutes"` |
| 末节点（图片） | Form Ending (v2.3) | `respondWith` = `"showText"`，`responseText` = `={{ $json["html"] }}`，`limitWaitTime` = `true`，`resumeUnit` = `"minutes"` |

**Format Output 标准模板**：

```javascript
// MD→HTML 转换（内联样式，确保 Form Ending 正确渲染）
function md2html(md) {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#2563eb;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-top:24px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="color:#1e293b;text-align:center;margin-bottom:16px">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#1e293b">$1</strong>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0;line-height:1.8">')
    .replace(/\n/g, '<br>');
}

const content = $json.rawContent || $json.result || '';
const html = `<div style="background:#f8fafc;border-radius:12px;padding:24px;max-width:800px;margin:0 auto;font-family:system-ui,-apple-system,sans-serif">
<p style="margin:8px 0;line-height:1.8">${md2html(content)}</p>
</div>`;

return [{ json: { html: html } }];
```

> **规则**：Form Ending 的 completionMessage 不渲染 Markdown，只支持纯文本和 HTML。所有格式化必须在前置 Code 节点完成。

**图片 Format Output 标准模板**（配合 `respondWith: "showText"` 使用）：

```javascript
// 图片结果 → HTML（Show Text 模式，不被 sanitize-html 清洗）
const imageBase64 = $json.image_base64 || $json.result;
const prompt = $json.prompt || 'Generated Image';

const html = `<div style="text-align:center;padding:24px;font-family:system-ui,-apple-system,sans-serif">
<h2 style="color:#1e293b;margin-bottom:16px">${prompt}</h2>
<img src="data:image/png;base64,${imageBase64}" style="max-width:100%;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1)" />
</div>`;

return [{ json: { html } }];
```

> **规则**：含 base64 图片时，Form Ending 必须用 `respondWith: "showText"` + `responseText`。`"text"` 模式的 sanitize-html 会剥离 `data:` URI。

### HTTP Request jsonBody 表达式规则

当工作流包含 HTTP Request 节点且 jsonBody 中有动态表达式时，遵循以下规则：

| # | 规则 | 说明 |
|---|------|------|
| 1 | **一律前置 Code 节点构建 JSON（强制）** | HTTP Request 的 jsonBody 有动态字段时，**必须**在前置 Code 节点中用 JS 对象构建完整请求体，jsonBody 仅写 `={{ $json.requestBody }}`。检查点 6h 验证 |
| 2 | **禁止 jsonBody 内嵌表达式** | jsonBody 内不得出现 `{{ $json.xxx }}` 形式的内嵌表达式，消除引号冲突和转义维护成本 |

> 详细规则、示例和对比表见 `reference/specs/expression-syntax.md` → jsonBody 表达式专题。

### 阶段 4：社区节点安装检查（构建后、凭据前）

**触发条件**：`confirmed_plan.key_nodes` 存在 `source != "core"` 的节点。全部为 core 则跳过本阶段。

**4a. 查询已安装包**：

```
curl -s -H "Cookie: n8n-auth={N8N_SESSION}" \
  {N8N_URL}/rest/community-packages
```

> `{N8N_SESSION}` 从 Skill 凭据文件 `credentials/n8n.md` 读取 Session Cookie。

**4b. 比对缺失包**：

遍历 `key_nodes` 中 `source != "core"` 的条目，比对 `npm` 字段与已安装列表，生成 `missing_packages[]`。

**4c. 缺失包处理**：

```
missing_packages 不为空时：
  |
  v 向用户展示缺失列表，询问确认安装
  |
  +-- 用户确认 → POST /rest/community-packages {"name": "{npm}"}
  |     → 重新 GET /rest/community-packages 验证安装成功
  |
  +-- 用户拒绝 → 记录到 skipped[]，Step 08 兜底处理
```

**4d. 结果写入 progress.json**：

```json
{
  "community_packages": {
    "installed": ["already-installed-pkg"],
    "newly_installed": ["just-installed-pkg"],
    "skipped": [],
    "failed": []
  }
}
```

**4e. 降级模式**：

REST API 不可用（401/连接失败）时，输出手动安装提示（参考 `docs/community-nodes.md`），不阻塞流程。

---

## 更新进度

构建完成后，更新 `{run_dir}/state/progress.json`：

```json
{
  "step": "step06-build",
  "step_status": { "step06-build": "completed" },
  "updated_at": "{当前时间}",
  "恢复提示": { "resume": "Step 06 完成，workflow_id={id}，进入 Step 07 凭据配置" }
}
```

---

## 验证检查点

| 编号 | 检查项 | 通过标准 |
|------|--------|----------|
| 6a | workflow_id 已获取 | `n8n_create_workflow` 返回有效 ID |
| 6b | workflow_id 已写入 progress.json | 读取确认字段存在 |
| 6c | 所有节点已创建 | 节点数量与设计稿一致 |
| 6d | 连接已建立 | 所有节点间连接正确 |
| 6e | 表达式已配置 | 数据映射表达式已写入 |
| 6f | progress.json 已更新 | step06 标记 completed |
| 6g | 社区节点已安装（如适用） | community_packages 写入 progress.json，无 failed 项 |
| 6h | jsonBody 无内嵌动态表达式 | jsonBody 内不得出现 `{{ }}` 表达式（除 `={{ $json.requestBody }}` 整体引用外）；动态字段一律由前置 Code 节点构建 |
| 6i | jsonBody 无 bracket notation 双引号 | jsonBody 内不出现 `$json["` 模式；中文/含空格字段用 `$json['']` 单引号或 Code 节点 |
| 6j | Code 节点字段引用匹配 | `$node["Form Trigger"].json["X"]` 中 X 必须是 fieldLabel（非 fieldName） |
| 6k | webhookId 已分配 | Form Trigger 和 Form Ending 节点的 webhookId 非空（UUID v4 格式） |

---

## 下一步

-> `Step 07: 凭据配置`
