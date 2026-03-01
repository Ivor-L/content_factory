# n8n Expression Syntax

Expert guide for writing correct n8n expressions in workflows.

---

## Expression Format

All dynamic content in n8n uses **double curly braces**:

```
{{expression}}
```

**Examples**:
```
✅ {{$json.email}}
✅ {{$json.body.name}}
✅ {{$node["HTTP Request"].json.data}}
❌ $json.email  (no braces - treated as literal text)
❌ {$json.email}  (single braces - invalid)
```

---

## Core Variables

### $json - Current Node Output

Access data from the current node:

```javascript
{{$json.fieldName}}
{{$json['field with spaces']}}
{{$json.nested.property}}
{{$json.items[0].name}}
```

### $node - Reference Other Nodes

Access data from any previous node:

```javascript
{{$node["Node Name"].json.fieldName}}
{{$node["HTTP Request"].json.data}}
{{$node["Webhook"].json.body.email}}
```

**Important**:
- Node names **must** be in quotes
- Node names are **case-sensitive**
- Must match exact node name from workflow

### $now - Current Timestamp

Access current date/time:

```javascript
{{$now}}
{{$now.toFormat('yyyy-MM-dd')}}
{{$now.toFormat('HH:mm:ss')}}
{{$now.plus({days: 7})}}
```

### $env - Environment Variables

Access environment variables:

```javascript
{{$env.API_KEY}}
{{$env.DATABASE_URL}}
```

---

## 🚨 CRITICAL: Webhook Data Structure

**Most Common Mistake**: Webhook data is **NOT** at the root!

### Webhook Node Output Structure

```javascript
{
  "headers": {...},
  "params": {...},
  "query": {...},
  "body": {           // ⚠️ USER DATA IS HERE!
    "name": "John",
    "email": "john@example.com",
    "message": "Hello"
  }
}
```

### Correct Webhook Data Access

```javascript
❌ WRONG: {{$json.name}}
❌ WRONG: {{$json.email}}

✅ CORRECT: {{$json.body.name}}
✅ CORRECT: {{$json.body.email}}
✅ CORRECT: {{$json.body.message}}
```

**Why**: Webhook node wraps incoming data under `.body` property to preserve headers, params, and query parameters.

---

## Form Trigger Data Structure

**Form Trigger data is FLAT** — fields are directly on `$json`, not nested under `.body`.

### Form Trigger Node Output Structure

```javascript
{
  "API Key": "sk-xxx",
  "Prompt": "Generate a video about nature",
  "Model": "gpt-4o",
  "Temperature": 0.7,
  "submittedAt": "2026-02-10T14:30:00.000Z",
  "formMode": "production"
}
```

### Correct Form Trigger Data Access

```javascript
✅ CORRECT: {{$json["API Key"]}}
✅ CORRECT: {{$json["Prompt"]}}
✅ CORRECT: {{$json["Model"]}}

❌ WRONG: {{$json.body["API Key"]}}    // No .body nesting!
❌ WRONG: {{$json.api_key}}             // Use exact field label!
❌ WRONG: {{$json.apiKey}}              // Not camelCase!
```

### Form Trigger vs Webhook Comparison

| 维度 | Form Trigger | Webhook |
|------|-------------|---------|
| 数据位置 | `$json["Field Label"]`（根级） | `$json.body.field`（body 下） |
| 字段命名 | 使用 Field Label（可含空格） | 由发送方定义（通常 camelCase） |
| 访问方式 | Bracket notation `$json["Label"]` | Dot notation `$json.body.field` |
| 示例 | `{{$json["API Key"]}}` | `{{$json.body.apiKey}}` |

> **记忆口诀**：Form = Flat（扁平），Webhook = Wrapped（包裹在 body 下）。

### Form Ending（完成页）显示规则

Form Ending 节点的 `completionMessage` **不渲染 Markdown**，只支持纯文本和 HTML。

```
❌ 错误（Markdown 被压成一行纯文本）：
completionMessage = "## Scene 1\n**画面描述**：..."

✅ 正确（前置 Code 节点输出 HTML）：
completionMessage = "<h2>Scene 1</h2><strong>画面描述</strong>：..."
```

> **最佳实践**：当 AI 生成的内容包含 Markdown 格式时，在 Format 节点中用 `replace()` 链将 `#`/`##`/`**`/`\n` 转为对应 HTML 标签（含内联样式），再传给 Form Ending 的 completionMessage。

---

## Common Patterns

### Access Nested Fields

```javascript
// Simple nesting
{{$json.user.email}}

// Array access
{{$json.data[0].name}}
{{$json.items[0].id}}

// Bracket notation for spaces
{{$json['field name']}}
{{$json['user data']['first name']}}
```

### Reference Other Nodes

```javascript
// Node without spaces
{{$node["Set"].json.value}}

// Node with spaces (common!)
{{$node["HTTP Request"].json.data}}
{{$node["Respond to Webhook"].json.message}}

// Webhook node
{{$node["Webhook"].json.body.email}}
```

### Combine Variables

```javascript
// Concatenation (automatic)
Hello {{$json.body.name}}!

// In URLs
https://api.example.com/users/{{$json.body.user_id}}

// In object properties
{
  "name": "={{$json.body.name}}",
  "email": "={{$json.body.email}}"
}
```

---

## When NOT to Use Expressions

### ❌ Code Nodes

Code nodes use **direct JavaScript access**, NOT expressions!

```javascript
// ❌ WRONG in Code node
const email = '={{$json.email}}';
const name = '{{$json.body.name}}';

// ✅ CORRECT in Code node
const email = $json.email;
const name = $json.body.name;

// Or using Code node API
const email = $input.item.json.email;
const allItems = $input.all();
```

### ❌ Webhook Paths

```javascript
// ❌ WRONG
path: "{{$json.user_id}}/webhook"

// ✅ CORRECT
path: "user-webhook"  // Static paths only
```

### ❌ Credential Fields

```javascript
// ❌ WRONG
apiKey: "={{$env.API_KEY}}"

// ✅ CORRECT
Use n8n credential system, not expressions
```

---

## Validation Rules

### 1. Always Use {{}}

Expressions **must** be wrapped in double curly braces.

```javascript
❌ $json.field
✅ {{$json.field}}
```

### 2. Use Quotes for Spaces

Field or node names with spaces require **bracket notation**:

```javascript
❌ {{$json.field name}}
✅ {{$json['field name']}}

❌ {{$node.HTTP Request.json}}
✅ {{$node["HTTP Request"].json}}
```

### 3. Match Exact Node Names

Node references are **case-sensitive**:

```javascript
❌ {{$node["http request"].json}}  // lowercase
❌ {{$node["Http Request"].json}}  // wrong case
✅ {{$node["HTTP Request"].json}}  // exact match
```

### 4. No Nested {{}}

Don't double-wrap expressions:

```javascript
❌ {{{$json.field}}}
✅ {{$json.field}}
```

---

## Common Mistakes

For complete error catalog with fixes, see [COMMON_MISTAKES.md](COMMON_MISTAKES.md)

### Quick Fixes

| Mistake | Fix |
|---------|-----|
| `$json.field` | `{{$json.field}}` |
| `{{$json.field name}}` | `{{$json['field name']}}` |
| `{{$node.HTTP Request}}` | `{{$node["HTTP Request"]}}` |
| `{{{$json.field}}}` | `{{$json.field}}` |
| `{{$json.name}}` (webhook) | `{{$json.body.name}}` |
| `'={{$json.email}}'` (Code node) | `$json.email` |

---

## Working Examples

For real workflow examples, see [EXAMPLES.md](EXAMPLES.md)

### Example 1: Webhook to Slack

**Webhook receives**:
```json
{
  "body": {
    "name": "John Doe",
    "email": "john@example.com",
    "message": "Hello!"
  }
}
```

**In Slack node text field**:
```
New form submission!

Name: {{$json.body.name}}
Email: {{$json.body.email}}
Message: {{$json.body.message}}
```

### Example 2: HTTP Request to Email

**HTTP Request returns**:
```json
{
  "data": {
    "items": [
      {"name": "Product 1", "price": 29.99}
    ]
  }
}
```

**In Email node** (reference HTTP Request):
```
Product: {{$node["HTTP Request"].json.data.items[0].name}}
Price: ${{$node["HTTP Request"].json.data.items[0].price}}
```

### Example 3: Format Timestamp

```javascript
// Current date
{{$now.toFormat('yyyy-MM-dd')}}
// Result: 2025-10-20

// Time
{{$now.toFormat('HH:mm:ss')}}
// Result: 14:30:45

// Full datetime
{{$now.toFormat('yyyy-MM-dd HH:mm')}}
// Result: 2025-10-20 14:30
```

---

## Data Type Handling

### Arrays

```javascript
// First item
{{$json.users[0].email}}

// Array length
{{$json.users.length}}

// Last item
{{$json.users[$json.users.length - 1].name}}
```

### Objects

```javascript
// Dot notation (no spaces)
{{$json.user.email}}

// Bracket notation (with spaces or dynamic)
{{$json['user data'].email}}
```

### Strings

```javascript
// Concatenation (automatic)
Hello {{$json.name}}!

// String methods
{{$json.email.toLowerCase()}}
{{$json.name.toUpperCase()}}
```

### Numbers

```javascript
// Direct use
{{$json.price}}

// Math operations
{{$json.price * 1.1}}  // Add 10%
{{$json.quantity + 5}}
```

---

## Advanced Patterns

### Conditional Content

```javascript
// Ternary operator
{{$json.status === 'active' ? 'Active User' : 'Inactive User'}}

// Default values
{{$json.email || 'no-email@example.com'}}
```

### Date Manipulation

```javascript
// Add days
{{$now.plus({days: 7}).toFormat('yyyy-MM-dd')}}

// Subtract hours
{{$now.minus({hours: 24}).toISO()}}

// Set specific date
{{DateTime.fromISO('2025-12-25').toFormat('MMMM dd, yyyy')}}
```

### String Manipulation

```javascript
// Substring
{{$json.email.substring(0, 5)}}

// Replace
{{$json.message.replace('old', 'new')}}

// Split and join
{{$json.tags.split(',').join(', ')}}
```

---

## jsonBody 表达式专题

HTTP Request 节点的 `jsonBody` 参数内嵌表达式时，存在独立于普通表达式的转义规则。

### 核心规则

#### 规则 1：字段引用优先 dot notation

jsonBody 是 JSON 字符串，内部已使用双引号包裹 key/value。bracket notation `$json["field"]` 的双引号会与 JSON 自身引号冲突，导致解析失败。

```
❌ 错误（引号冲突）：
"body": "{ \"prompt\": \"={{ $json[\"Topic\"] }}\" }"

✅ 正确（dot notation 无引号冲突）：
"body": "{ \"prompt\": \"={{ $json.Topic }}\" }"

✅ 也正确（单引号 bracket，但 dot 更简洁）：
"body": "{ \"prompt\": \"={{ $json['Topic'] }}\" }"
```

> **例外**：字段名含空格时只能用 bracket notation + 单引号：`$json['Field Label']`。

#### 规则 2：JSON 字符串值中禁止真实换行

JSON 规范不允许字符串值内出现裸换行符（`\n`）。jsonBody 中的多行内容必须用转义换行。

```
❌ 错误（裸换行导致 JSON 解析失败）：
"body": "{ \"prompt\": \"Line 1
Line 2\" }"

✅ 正确（转义换行）：
"body": "{ \"prompt\": \"Line 1\\nLine 2\" }"
```

#### 规则 3：动态拼接多字段的正确写法

```javascript
// ✅ 正确：dot notation + 转义换行
"body": "{ \"prompt\": \"={{ $json.Topic }}\\nStyle: {{ $json.Style }}\" }"

// ❌ 错误：bracket notation 引号冲突
"body": "{ \"prompt\": \"={{ $json[\"Topic\"] }}\\nStyle: {{ $json[\"Style\"] }}\" }"
```

#### 规则 4：jsonBody 有动态字段时，一律用前置 Code 节点（强制，检查点 6h）

HTTP Request 的 jsonBody 包含任何动态字段时，**必须**在前置 Code 节点中构建完整 JSON 请求体。jsonBody 仅写 `={{ $json.requestBody }}`，不得内嵌 `{{ }}` 表达式。

> **原因**：jsonBody 内嵌表达式存在引号冲突（bracket notation 双引号 vs JSON 双引号）和转义维护成本，无论字段数量多少都应避免。

```javascript
// Code 节点（前置）
const body = {
  model: $json.Model,
  prompt: $json.Topic,
  style: $json.Style,
  temperature: parseFloat($json.Temperature),
  max_tokens: parseInt($json.MaxTokens)
};
return [{ json: { requestBody: JSON.stringify(body) } }];
```

```javascript
// HTTP Request 节点 jsonBody 直接引用
"body": "={{ $json.requestBody }}"
```

### jsonBody vs 普通表达式对比

| 维度 | 普通表达式字段 | jsonBody 内表达式 |
|------|--------------|------------------|
| 引号环境 | 无外层 JSON 包裹 | 嵌套在 JSON 字符串内 |
| bracket notation | `$json["field"]` 正常使用 | 双引号冲突，必须用 dot 或单引号 bracket |
| 换行符 | 部分字段允许真实换行 | 必须用 `\\n`，裸换行导致 JSON 解析失败 |
| 动态字段处理 | 直接使用表达式 | 一律用前置 Code 节点构建，jsonBody 仅整体引用 |
| 调试难度 | 低（表达式编辑器可预览） | 高（转义层叠，错误信息不直观） |

> **最佳实践**：jsonBody 内表达式一律用 dot notation，字段名设计时避免空格（用下划线或 camelCase）。

---

## Debugging Expressions

### Test in Expression Editor

1. Click field with expression
2. Open expression editor (click "fx" icon)
3. See live preview of result
4. Check for errors highlighted in red

### Common Error Messages

**"Cannot read property 'X' of undefined"**
→ Parent object doesn't exist
→ Check your data path

**"X is not a function"**
→ Trying to call method on non-function
→ Check variable type

**Expression shows as literal text**
→ Missing {{ }}
→ Add curly braces

---

## Expression Helpers

### Available Methods

**String**:
- `.toLowerCase()`, `.toUpperCase()`
- `.trim()`, `.replace()`, `.substring()`
- `.split()`, `.includes()`

**Array**:
- `.length`, `.map()`, `.filter()`
- `.find()`, `.join()`, `.slice()`

**DateTime** (Luxon):
- `.toFormat()`, `.toISO()`, `.toLocal()`
- `.plus()`, `.minus()`, `.set()`

**Number**:
- `.toFixed()`, `.toString()`
- Math operations: `+`, `-`, `*`, `/`, `%`

---

## Best Practices

### ✅ Do

- Always use {{ }} for dynamic content
- Use bracket notation for field names with spaces
- Reference webhook data from `.body`
- Use $node for data from other nodes
- Test expressions in expression editor

### ❌ Don't

- Don't use expressions in Code nodes
- Don't forget quotes around node names with spaces
- Don't double-wrap with extra {{ }}
- Don't assume webhook data is at root (it's under .body!)
- Don't use expressions in webhook paths or credentials

---

## Related Skills

- **n8n MCP Tools Expert**: Learn how to validate expressions using MCP tools
- **n8n Workflow Patterns**: See expressions in real workflow examples
- **n8n Node Configuration**: Understand when expressions are needed

---

## Summary

**Essential Rules**:
1. Wrap expressions in {{ }}
2. Webhook data is under `.body`
3. No {{ }} in Code nodes
4. Quote node names with spaces
5. Node names are case-sensitive

**Most Common Mistakes**:
- Missing {{ }} → Add braces
- `{{$json.name}}` in webhooks → Use `{{$json.body.name}}`
- `{{$json.email}}` in Code → Use `$json.email`
- `{{$node.HTTP Request}}` → Use `{{$node["HTTP Request"]}}`

For more details, see:
- [COMMON_MISTAKES.md](COMMON_MISTAKES.md) - Complete error catalog
- [EXAMPLES.md](EXAMPLES.md) - Real workflow examples

---

**Need Help?** Reference the n8n expression documentation or use n8n-mcp validation tools to check your expressions.

---

## Advanced Expression Patterns

以下 5 个高级模式从实战工作流中提炼，覆盖内联计算、空值处理、URL 重建、二进制操作和 XML 提取。

### IIFE Inline Computation（立即执行函数表达式）

**Use Case**: 表达式中需要多步计算但不想用 Code 节点

**语法**：

```javascript
={{ (input => {
  const parts = input.split('-');
  const year = parts[0];
  const month = parts[1];
  return `${year}年${month}月`;
})($json.date_str) }}
```

**更复杂的示例**（数组处理）：

```javascript
={{ ((items) => {
  return items
    .filter(i => i.status === 'active')
    .map(i => i.name)
    .join(', ');
})($json.items) }}
```

**适用场景**：
- 字符串多步处理（split → transform → join）
- 数组过滤 + 映射
- 条件逻辑超过三元运算符的复杂度

**注意事项**：
- IIFE 内部可以用 const/let 声明变量
- 超过 5 行逻辑建议改用 Code 节点
- 参数传入用箭头函数 `(param => { ... })(value)`

---

### Nullish Coalescing Chain（Nullish 链式降级）

**Use Case**: 多个字段中取第一个有值的

**基础语法**：

```javascript
={{ $json.name ?? $json.title ?? $json.label ?? '未命名' }}
```

**与 || 的区别**：
- `??` 只在 null/undefined 时降级（保留 0, '', false）
- `||` 在所有 falsy 值时降级

**示例**：

```javascript
// 价格字段：0 是有效值
={{ $json.sale_price ?? $json.original_price ?? 0 }}

// 用 || 会导致 sale_price=0 时错误降级到 original_price
// 用 ?? 才能正确保留 0
```

**可选链 + Nullish 组合**：

```javascript
={{ $json.data?.items?.[0]?.name ?? '无数据' }}
={{ $json.response?.result?.url ?? $json.fallback_url ?? '' }}
```

---

### URL Fallback Reconstruction（URL 三级降级重建）

**Use Case**: 数据源中 URL 字段不一致，需要智能降级

**模式**：

```javascript
={{ $json.canonical_url
  ?? ($json.base_url && $json.slug ? $json.base_url + '/' + $json.slug : null)
  ?? ($json.domain ? 'https://' + $json.domain + '/' + ($json.path || '') : '')
}}
```

**三级策略**：
1. 优先用完整 canonical_url
2. 降级：base_url + slug 拼接
3. 兜底：domain + path 重建

**亚马逊商品 URL 实例**：

```javascript
={{ $json.product_url
  ?? ($json.asin ? 'https://www.amazon.com/dp/' + $json.asin : null)
  ?? ''
}}
```

---

### Dynamic Binary Access（动态二进制字段访问）

**Use Case**: 二进制字段名不固定（如上传文件、截图节点输出）

**问题**：不同节点输出的二进制字段名不同
- HTTP 下载：`$binary.data`
- 文件上传：`$binary.file` 或 `$binary.attachment`
- 截图：`$binary.screenshot`

**通用访问模式**：

```javascript
={{ Object.keys($binary)[0] }}  // 获取第一个二进制字段名
```

**获取 MIME 类型**：

```javascript
={{ $binary[Object.keys($binary)[0]].mimeType }}
```

**获取文件名**：

```javascript
={{ $binary[Object.keys($binary)[0]].fileName ?? 'download' }}
```

**获取文件大小**：

```javascript
={{ $binary[Object.keys($binary)[0]].fileSize }}
```

**在 HTTP Request 中引用二进制数据**：
- sendBody → body → contentType: "binaryData"
- inputDataFieldName: `={{ Object.keys($binary)[0] }}`

---

### XML Tag Extraction（XML 标签提取）

**Use Case**: 从 LLM 输出中提取 XML 标签包裹的内容

**基础提取**：

```javascript
={{ $json.output.replace(/[\s\S]*?<result>/, '').replace(/<\/result>[\s\S]*/, '') }}
```

**多标签提取**（结合 IIFE）：

```javascript
={{ ((text) => {
  const match = text.match(/<summary>([\s\S]*?)<\/summary>/);
  return match ? match[1].trim() : '';
})($json.output) }}
```

**提取所有匹配**（数组）：

```javascript
={{ ((text) => {
  const matches = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return matches.map(m => m[1].trim()).join('\n---\n');
})($json.output) }}
```

**注意事项**：
- `[\s\S]*?` 用于跨行匹配（`.` 不匹配换行符）
- 用非贪婪 `*?` 避免匹配到最后一个闭合标签
- LLM 输出可能格式不规范，建议加 `.trim()`
- 如果标签可能不存在，用 `?.[1]` 或默认值
