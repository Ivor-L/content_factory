# Form Trigger Pattern

n8n 原生 Web 表单触发器，首选的用户输入收集方式。

---

## Pattern Structure

```
Form Trigger → [Validate] → [Process] → [Respond]
```

The simplest and most user-friendly way to collect input and trigger workflows.

---

## Form Trigger vs Webhook

| 维度 | Form Trigger | Webhook |
|------|-------------|---------|
| 节点类型 | `n8n-nodes-base.formTrigger` | `n8n-nodes-base.webhook` |
| typeVersion | 2.5 | 2.1 |
| 数据访问 | `$json["fieldName"]`（扁平，v2.4+ 用 fieldName 标识） | `$json.body.x`（嵌套在 body 下） |
| URL 格式 | `/form/{webhookId}`（v2.5 用 webhookId 路由，非 path） | `/webhook/{path}` |
| 用户界面 | 原生 Web 表单（浏览器可直接访问） | 无 UI，需 curl 或代码调用 |
| 字段验证 | 内置（required、类型约束） | 需自行实现 |
| 密钥输入 | password 字段类型（自动遮掩） | 明文传输 |
| 适用场景 | 人工输入（表单提交） | 系统回调（外部系统 HTTP 请求） |

**选择原则**：人工输入用 Form Trigger，系统回调用 Webhook。

---

## formTrigger Node Configuration

### Complete JSON Skeleton

```json
{
  "parameters": {
    "path": "my-form",
    "formTitle": "My Form Title",
    "formDescription": "Brief description of what this form does",
    "responseMode": "lastNode",
    "formFields": {
      "values": [
        {
          "fieldLabel": "API Key",
          "fieldName": "api_key",
          "fieldType": "password",
          "requiredField": true,
          "placeholder": "sk-..."
        },
        {
          "fieldLabel": "Prompt",
          "fieldName": "prompt",
          "fieldType": "textarea",
          "requiredField": true,
          "placeholder": "Describe what you want..."
        },
        {
          "fieldLabel": "Model",
          "fieldName": "model",
          "fieldType": "dropdown",
          "requiredField": true,
          "fieldOptions": {
            "values": [
              {"option": "gpt-4o"},
              {"option": "gpt-4o-mini"},
              {"option": "claude-sonnet-4-5-20250929"}
            ]
          }
        }
      ]
    }
  },
  "type": "n8n-nodes-base.formTrigger",
  "typeVersion": 2.5,
  "position": [0, 0],
  "webhookId": "auto-generated",
  "name": "Form Trigger"
}
```

### Key Parameters

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | Yes | 表单 URL 路径（如 `ai-service`） |
| `formTitle` | string | Yes | 表单标题（显示在页面顶部） |
| `formDescription` | string | No | 表单描述（标题下方说明文字） |
| `responseMode` | enum | Yes | `lastNode`（等待处理完成后响应）/ `onReceived`（立即响应） |
| `formFields.values` | array | Yes | 表单字段定义数组 |

### Field Definition (v2.4+)

v2.4 起 `fieldLabel` 和 `fieldName` 分离：

| 参数 | 说明 |
|------|------|
| `fieldLabel` | **显示标签**：用户在表单 UI 上看到的名称 |
| `fieldName` | **技术标识符**：工作流中引用数据的 key，`$json["fieldName"]` |

> **v2.5 变更**：`formFields` 底层使用 `formFieldsDynamic`（`hideOptionalFields: true`），UI 更简洁，非必填字段默认隐藏。构建 JSON 时仍使用 `formFields.values` 结构。

### Form Ending respondWith 模式对照

| respondWith | UI 名称 | 参数名 | HTML 清洗 | 适用场景 |
|-------------|---------|--------|-----------|---------|
| `"text"` | Show Completion Screen | `completionTitle` + `completionMessage` | sanitize-html（allowedSchemes: http/https） | 纯文字结果展示（默认首选） |
| `"showText"` | Show Text | `responseText` | **不清洗** | **含图片/data:URI 的 HTML**（图片首选） |
| `"redirect"` | Redirect to URL | `redirectUrl` | - | 跳转外部页面 |
| `"returnBinary"` | Return Binary File | `inputDataFieldName` | - | 直接返回文件下载 |

> **关键区别**：`"text"` 模式的 `completionMessage` 会被 sanitize-html 清洗（`data:` URI 被剥离），base64 图片无法渲染。需要展示图片时必须用 `"showText"` 模式。

### Two Response Patterns

Form Trigger 有两种结尾模式，选择后**所有配置都不同**：

| 维度 | Pattern A: Form Ending（首选默认） | Pattern B: respondToWebhook |
|------|----------------------------------------------|---------------------------|
| 结尾节点 | `n8n-nodes-base.form`（operation: "completion"） | `n8n-nodes-base.respondToWebhook` |
| responseMode | `"lastNode"`（必须显式设置） | `"lastNode"`（必须显式设置） |
| 用户体验 | 原生表单完成页（标题 + HTML 内容，最佳 UX） | 纯文本/JSON 响应 |
| 适用场景 | 人工表单交互（首选，结果展示友好） | 仅在需要 JSON/API 返回时使用 |

Pattern A 根据输出内容类型分为 A1（文字）和 A2（图片）两个子模式。

#### Pattern A1: Form Ending Completion Screen（文字内容首选）

> **为什么首选**：Completion Screen 提供原生完成页，以标题 + HTML 内容形式展示处理结果，用户体验远优于 respondToWebhook 返回的原始 JSON。前置 Code 节点将 Markdown 转为内联样式 HTML，映射到 `html` 字段，completionMessage 引用该字段即可。

**标准链路**：

```
Form Trigger → [业务节点...] → Format Output (Code) → Form Ending (Completion Screen)
```

```json
// Form Trigger（responseMode: "lastNode"）
{
  "parameters": {
    "path": "my-form",
    "formTitle": "My Form Title",
    "formDescription": "Description",
    "responseMode": "lastNode",
    "formFields": { "values": [
      {"fieldLabel": "显示名称", "fieldName": "field_key", "fieldType": "text", "requiredField": true}
    ] },
    "options": {}
  },
  "type": "n8n-nodes-base.formTrigger",
  "typeVersion": 2.5,
  "position": [0, 0],
  "name": "Form Trigger",
  "webhookId": "uuid-v4-auto-generated"
}

// Format Output (Code) — 末前节点，输出 html 字段
// return [{ json: { html: "<div>...</div>" } }];

// Form Ending Completion Screen（结尾节点，文字内容）
{
  "parameters": {
    "operation": "completion",
    "respondWith": "text",
    "completionTitle": "Result Title",
    "completionMessage": "={{ $json[\"html\"] }}",
    "limitWaitTime": true,
    "resumeUnit": "minutes",
    "options": {}
  },
  "type": "n8n-nodes-base.form",
  "typeVersion": 2.5,
  "position": [1200, 0],
  "name": "Form Ending",
  "webhookId": "another-uuid-v4"
}
```

**A1 必需参数**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `operation` | `"completion"` | 固定值，标记为表单完成页 |
| `respondWith` | `"text"` | Completion Screen 模式，映射 HTML 内容 |
| `completionTitle` | 表达式或字符串 | 完成页标题 |
| `completionMessage` | `={{ $json["html"] }}` | 完成页内容，引用前置 Code 节点输出的 HTML |
| `limitWaitTime` | `true` | 必须设置，控制等待超时 |
| `resumeUnit` | `"minutes"` | 超时单位 |
| `webhookId` | UUID v4 | 每个 Form 节点都需要独立 webhookId |

> **适用场景**：纯文字/简单 HTML 结果展示。`completionMessage` 经过 sanitize-html 清洗，`data:` URI 会被剥离。

#### Pattern A2: Form Ending Show Text（图片内容首选）

> **为什么用于图片**：Show Text 模式的 `responseText` 参数**不经过** sanitize-html 清洗，base64 `data:` URI 图片可完整渲染。任何需要展示图片的场景必须使用此模式。

**标准链路**：

```
Form Trigger → [业务节点...] → Format Output (Code) → Form Ending (Show Text)
```

```json
// Form Ending Show Text（结尾节点，图片内容）
{
  "parameters": {
    "operation": "completion",
    "respondWith": "showText",
    "responseText": "={{ $json[\"html\"] }}",
    "limitWaitTime": true,
    "resumeUnit": "minutes",
    "options": {}
  },
  "type": "n8n-nodes-base.form",
  "typeVersion": 2.5,
  "position": [1200, 0],
  "name": "Form Ending",
  "webhookId": "another-uuid-v4"
}
```

**A2 必需参数**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `operation` | `"completion"` | 固定值，标记为表单完成页 |
| `respondWith` | `"showText"` | Show Text 模式，**不清洗 HTML** |
| `responseText` | `={{ $json["html"] }}` | 显示内容，引用前置 Code 节点输出的 HTML（含 `<img src="data:...">` 可正常渲染） |
| `limitWaitTime` | `true` | 必须设置，控制等待超时 |
| `resumeUnit` | `"minutes"` | 超时单位 |
| `webhookId` | UUID v4 | 每个 Form 节点都需要独立 webhookId |

> **适用场景**：含 base64 图片、`data:` URI 的 HTML 输出。无 `completionTitle` 参数，标题需写在 HTML 内。

**图片 Format Output 标准模板**：

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

#### Pattern B: Form Trigger + respondToWebhook

```
Form Trigger（responseMode: "lastNode"）→ ... → respondToWebhook
```

> **注意**：`lastNode` 模式需要在工作流末尾添加 `respondToWebhook` 节点返回结果。

---

## Field Types Reference

| fieldType | 用途 | 数据格式 | 典型场景 |
|-----------|------|----------|----------|
| `text` | 单行文本 | `string` | 名称、URL、简短输入 |
| `textarea` | 多行文本 | `string` | 长文本、prompt、描述 |
| `password` | 密码/密钥 | `string`（遮掩显示） | API Key、Token、密码 |
| `email` | 邮箱地址 | `string`（邮箱验证） | 用户邮箱 |
| `number` | 数字 | `number` | 数量、金额、参数值 |
| `date` | 日期选择 | `string`（ISO 格式） | 日期范围、截止日期 |
| `dropdown` | 下拉单选 | `string` | 模型选择、类型选择 |
| `checkbox` | 复选框 | `boolean` / `string[]` | 多选开关、功能启用（v2.3+） |
| `radio` | 单选按钮 | `string` | 互斥选项（v2.3+，替代 dropdown multiselect） |
| `file` | 文件上传 | `object`（binary） | 图片、文档上传 |
| `hiddenField` | 隐藏字段 | `string` | 预设参数、版本号 |

> **v2.3 变更**：新增 `checkbox` 和 `radio` 字段类型，废弃 dropdown 的 multiselect 选项。

---

## Data Access Pattern

### Flat Structure (No Nesting!)

Form Trigger 数据**直接在 $json 根级**，**不嵌套在 body 下**。

**v2.4+ 字段标识变更**：工作流中引用数据使用 `fieldName`（技术标识符），不再使用 `fieldLabel`（显示标签）。

```javascript
// Form Trigger v2.5 输出结构（key = fieldName）
{
  "api_key": "sk-xxx",
  "prompt": "Generate a video about...",
  "model": "gpt-4o",
  "submittedAt": "2026-02-10T14:30:00.000Z",
  "formMode": "production"
}
```

### Correct Access

```javascript
// ✅ Form Trigger v2.5（扁平，用 fieldName 引用）
{{$json["api_key"]}}
{{$json["prompt"]}}
{{$json["model"]}}

// ❌ 错误！
{{$json.body["api_key"]}}   // 错误：没有 body 嵌套
{{$json["API Key"]}}         // 错误：v2.4+ 用 fieldName，不是 fieldLabel
```

### Bracket Notation Rules

| 场景 | 表达式 | 说明 |
|------|--------|------|
| 标准访问 | `$json["fieldName"]` | 推荐统一用 bracket notation |
| 简单字段名 | `$json.model` | 无特殊字符时可用 dot notation |
| Code 节点 | `$json["fieldName"]` | 同样直接访问，无需 {{}} |
| 引用其他节点 | `$node["Form Trigger"].json["fieldName"]` | 完整路径 |

> **最佳实践**：Form Trigger v2.5 表达式统一使用 bracket notation `$json["fieldName"]`，字段名建议用 snake_case 以避免特殊字符。

---

## Common Use Case Templates

### 1. AI Service Call (password + textarea + dropdown)

```
Form Trigger → Code (构建 API 请求) → HTTP Request (调用 AI API) → Respond to Webhook
```

Fields:
| # | fieldLabel | fieldName | fieldType | required | placeholder |
|---|-----------|-----------|-----------|----------|-------------|
| 1 | API Key | api_key | password | Yes | sk-... |
| 2 | Prompt | prompt | textarea | Yes | Describe what you want... |
| 3 | Model | model | dropdown | Yes | — |
| 4 | Temperature | temperature | number | No | 0.7 |

### 2. Data Query Tool (text + date + radio)

```
Form Trigger → Database Query → Format Results → Respond to Webhook
```

Fields:
| # | fieldLabel | fieldName | fieldType | required | placeholder |
|---|-----------|-----------|-----------|----------|-------------|
| 1 | Search Keyword | search_keyword | text | Yes | Enter search term... |
| 2 | Start Date | start_date | date | No | — |
| 3 | End Date | end_date | date | No | — |
| 4 | Output Format | output_format | dropdown | Yes | — |

### 3. Content Generator (text + dropdown + number + file)

```
Form Trigger → AI Generate → Format → Respond to Webhook
```

Fields:
| # | fieldLabel | fieldName | fieldType | required | placeholder |
|---|-----------|-----------|-----------|----------|-------------|
| 1 | Topic | topic | text | Yes | Article topic... |
| 2 | Style | style | dropdown | Yes | — |
| 3 | Word Count | word_count | number | No | 1000 |
| 4 | Reference File | reference_file | file | No | — |

### 4. Configuration Form (hiddenField + text)

```
Form Trigger → Validate → Apply Config → Respond to Webhook
```

Fields:
| # | fieldLabel | fieldName | fieldType | required | placeholder |
|---|-----------|-----------|-----------|----------|-------------|
| 1 | Version | version | hiddenField | — | (preset: v2.0) |
| 2 | Service Name | service_name | text | Yes | my-service |
| 3 | API Endpoint | api_endpoint | text | Yes | https://api.example.com |
| 4 | Max Retries | max_retries | number | No | 3 |

---

## Form Field Design Templates

### API Service Call Standard Template

```json
{
  "formFields": {
    "values": [
      {"fieldLabel": "API Key", "fieldName": "api_key", "fieldType": "password", "requiredField": true, "placeholder": "Your API key"},
      {"fieldLabel": "Input", "fieldName": "input", "fieldType": "textarea", "requiredField": true, "placeholder": "Enter your request..."},
      {"fieldLabel": "Model", "fieldName": "model", "fieldType": "dropdown", "requiredField": true, "fieldOptions": {"values": [{"option": "default"}]}},
      {"fieldLabel": "Options", "fieldName": "options", "fieldType": "textarea", "requiredField": false, "placeholder": "Additional options (JSON)"}
    ]
  }
}
```

### Data Processing Standard Template

```json
{
  "formFields": {
    "values": [
      {"fieldLabel": "Data Source", "fieldName": "data_source", "fieldType": "text", "requiredField": true, "placeholder": "URL or identifier"},
      {"fieldLabel": "Operation", "fieldName": "operation", "fieldType": "dropdown", "requiredField": true, "fieldOptions": {"values": [{"option": "transform"}, {"option": "filter"}, {"option": "aggregate"}]}},
      {"fieldLabel": "Output Format", "fieldName": "output_format", "fieldType": "dropdown", "requiredField": true, "fieldOptions": {"values": [{"option": "JSON"}, {"option": "CSV"}, {"option": "Markdown"}]}}
    ]
  }
}
```

---

## webhookId 生产环境管理

### 问题：MCP 创建工作流不生成 webhookId

`n8n_create_workflow` 通过 MCP 创建工作流时，Form Trigger 和 Form Ending 节点**不会**自动分配 `webhookId`。这导致激活后 `/form/{webhookId}` 返回 404。

### 修复流程

```bash
# 1. 获取当前工作流 JSON
n8n_get_workflow(workflowId, mode="full")

# 2. 检查 Form Trigger 和 Form Ending 节点是否有 webhookId
#    若缺失，通过 REST API PUT 补充

# 3. 生成 UUID v4 并写入节点
curl -X PUT "{N8N_URL}/api/v1/workflows/{workflowId}" \
  -H "X-N8N-API-KEY: {N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{完整工作流 JSON，含 webhookId}'

# 4. 必须 deactivate → reactivate 刷新路由
n8n_deactivate_workflow(workflowId)
# sleep 2s
n8n_activate_workflow(workflowId)
```

### 关键规则

| 规则 | 说明 |
|------|------|
| Form Trigger 需要 webhookId | 路由格式 `/form/{webhookId}`，无 webhookId 则 404 |
| Form Ending 同样需要 webhookId | 每个 `n8n-nodes-base.form` 节点都需独立 UUID v4 |
| 更新后必须重激活 | n8n 在 activate 时注册 webhook 路由，中途更新不触发重注册 |
| deactivate → sleep 2s → reactivate | 确保路由完全注销后再重新注册 |

---

## Testing

### Browser Access

激活工作流后，直接在浏览器访问。

**重要**：Form Trigger v2.5 的 URL 路由使用 `webhookId`，而非 `path` 参数：

```
https://{n8n-instance}/form/{webhookId}
```

> **webhookId 获取方式**：`n8n_get_workflow(workflowId)` → 在 Form Trigger 节点 JSON 中找到 `"webhookId": "xxxxxxxx-xxxx-..."` 字段。

例如：
```
{N8N_URL}/form/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Test Steps

1. 激活工作流（Step 09）
2. 通过 `n8n_get_workflow` 获取 Form Trigger 节点的 webhookId
3. 在浏览器打开 `{N8N_URL}/form/{webhookId}`
4. 填写表单字段
5. 提交并观察响应
6. 在 n8n 执行历史中查看结果

**API 测试方式**（适用于自动化验证）：

```
n8n_test_workflow(workflowId, payload={"fieldName": "test value", ...})
```

### Debug Tips

- 表单未显示 → 检查工作流是否已激活
- 提交后无响应 → 检查 responseMode 和末尾的 respondToWebhook/Form Ending 节点
- 字段值为空 → 检查 fieldName 拼写是否与表达式引用一致（v2.4+ 用 fieldName，非 fieldLabel）
- 浏览器 404 → 检查使用的是 **webhookId**（非 path 参数），确认工作流已激活

---

## Checklist

### 通用

- [ ] typeVersion 使用 **2.5**（实例支持的最新版本）
- [ ] 每个字段同时定义 **fieldLabel**（显示）和 **fieldName**（标识）
- [ ] 密钥字段使用 **password** 类型
- [ ] 必填字段标记 **requiredField: true**
- [ ] 表达式使用 **bracket notation** `$json["fieldName"]`（v2.4+ 用 fieldName 而非 fieldLabel）
- [ ] fieldName 与下游表达式引用**完全一致**（大小写敏感）
- [ ] Form URL 使用 **webhookId** 路由：`/form/{webhookId}`（非 path 参数路由）

### Pattern A1: Form Ending Completion Screen 专项（文字内容）

- [ ] Form Trigger 设置 `responseMode: "lastNode"`
- [ ] 结尾节点类型为 `n8n-nodes-base.form`（不是 respondToWebhook）
- [ ] Form Ending `operation` 设为 `"completion"`
- [ ] Form Ending `respondWith` 设为 `"text"`（Completion Screen 模式）
- [ ] Form Ending `completionMessage` 映射 `={{ $json["html"] }}`
- [ ] Form Ending 有独立 `webhookId`（UUID v4）
- [ ] Form Ending 设置 `limitWaitTime: true` + `resumeUnit: "minutes"`
- [ ] 前置 Code 节点输出 `{ html: "<div>...</div>" }`（内联样式 HTML）

### Pattern A2: Form Ending Show Text 专项（图片内容）

- [ ] Form Trigger 设置 `responseMode: "lastNode"`
- [ ] 结尾节点类型为 `n8n-nodes-base.form`（不是 respondToWebhook）
- [ ] Form Ending `operation` 设为 `"completion"`
- [ ] Form Ending `respondWith` 设为 `"showText"`（Show Text 模式，不清洗 HTML）
- [ ] Form Ending `responseText` 映射 `={{ $json["html"] }}`（非 completionMessage）
- [ ] Form Ending 有独立 `webhookId`（UUID v4）
- [ ] Form Ending 设置 `limitWaitTime: true` + `resumeUnit: "minutes"`
- [ ] 前置 Code 节点输出 `{ html: "<img src='data:image/png;base64,...' />" }`（含 base64 图片的 HTML）

### Pattern B: respondToWebhook 专项

- [ ] Form Trigger 设置 `responseMode: "lastNode"`
- [ ] 末尾节点类型为 `n8n-nodes-base.respondToWebhook`

---

## Version Changelog

| 版本 | 变更 |
|------|------|
| v2.3 | 新增 `checkbox` / `radio` 字段类型，废弃 dropdown 的 multiselect |
| v2.4 | `fieldLabel` / `fieldName` 分离：fieldLabel 为显示标签，fieldName 为技术标识符 |
| v2.5 | `formFields` 底层改用 `formFieldsDynamic`（hideOptionalFields），UI 更简洁 |

> **Form Ending 同步**：`n8n-nodes-base.form` 版本与 FormTrigger 保持同步（2.5），completion 模式参数无破坏性变更。v2.3+ 支持 `customCss`。

---

## Related Files

- `workflow-patterns.md` - 架构模式总览（Form Trigger 为首选）
- `webhook-processing.md` - Webhook 模式（系统回调场景）
- `expression-syntax.md` - 表达式语法（含 Form Trigger 数据结构）
