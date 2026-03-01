# n8n Workflow Conventions

Engineering conventions for production n8n workflows: global parameters, documentation, naming, and credentials.

---

## Global Parameter Container

20/23 实战工作流使用此模式。工作流第一个有效节点（紧跟 Trigger）使用 Set 节点集中管理所有配置。

### Core Concept

**单一配置入口**：所有硬编码值（API Key、URL、业务参数、开关）集中在一个 Set 节点中管理。

```
[Trigger] → [设置参数-综合] → [业务节点1] → [业务节点2] → ...
```

**节点名称**：「设置参数-综合」或「Configure Parameters」

### Set Node Configuration

typeVersion: 3.4，mode: manual

```javascript
{
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  position: [460, 300],
  name: "设置参数-综合",
  parameters: {
    mode: "manual",
    duplicateItem: false,
    assignments: {
      assignments: [
        // === API 配置 ===
        { id: "uuid1", name: "api_key", value: "sk-xxx", type: "string" },
        { id: "uuid2", name: "base_url", value: "https://api.example.com", type: "string" },
        { id: "uuid3", name: "model_name", value: "gpt-4o", type: "string" },

        // === 业务参数 ===
        { id: "uuid4", name: "batch_size", value: 10, type: "number" },
        { id: "uuid5", name: "max_retries", value: 3, type: "number" },
        { id: "uuid6", name: "output_format", value: "json", type: "string" },

        // === 开关 ===
        { id: "uuid7", name: "enable_notification", value: true, type: "boolean" },
        { id: "uuid8", name: "debug_mode", value: false, type: "boolean" }
      ]
    },
    options: {}
  }
}
```

### Downstream Reference

三种引用方式，按优先级选择：

```javascript
// 1. 同一条线路（直连下游）— 最常用
{{ $json.api_key }}
{{ $json.batch_size }}

// 2. 跨节点引用（非直连下游）
{{ $node["设置参数-综合"].json.api_key }}
{{ $node["Configure Parameters"].json.base_url }}

// 3. 表达式拼接
{{ $node["设置参数-综合"].json.base_url + "/v1/chat/completions" }}
{{ $json.batch_size > 5 ? "large" : "small" }}
```

### Parameter Types

四种支持的参数类型：

| type | 用途 | 示例值 |
|------|------|--------|
| `string` | 文本配置 | `"gpt-4o"`、`"https://api.example.com"` |
| `number` | 数值配置 | `10`、`0.7`、`3` |
| `boolean` | 开关控制 | `true`、`false` |
| `object` | 复杂结构（少用） | `{ "key": "value" }` |

**注意**：尽量使用 string/number/boolean，避免 object 类型增加复杂度。

### Best Practices

参数容器的正确用法：

- ✅ 所有硬编码值放入参数容器
- ✅ 参数名用 snake_case（`api_key` 而非 `apiKey`）
- ✅ 分组注释：API 配置 / 业务参数 / 开关
- ✅ 参数值可用表达式引用环境变量：`{{ $env.API_KEY }}`
- ✅ 布尔参数用于功能开关，便于快速启停
- ❌ 不要在参数容器里放运行时动态数据（那是业务节点的事）
- ❌ 不要超过 20 个参数（太多需拆分为多个 Set 节点）
- ❌ 不要存储实际 API Key（测试除外，生产用凭据系统）
- ❌ 不要在参数名中使用空格或特殊字符

---

## StickyNote Documentation Standard

为工作流添加可视化文档，分区标注功能模块。复杂工作流至少 3 个 StickyNote。

### Color Semantics

6 色系统，每种颜色有明确语义：

| color 值 | 颜色 | 语义 | 典型用途 |
|-----------|------|------|----------|
| 0 | 黄色（默认） | 功能说明 | 一般注释、模块概述 |
| 1 | 蓝色 | 数据流 | 输入输出说明、数据转换 |
| 2 | 绿色 | 正常路径 | 成功流程、主干逻辑 |
| 3 | 红色 | 警告 | 错误处理、注意事项 |
| 4 | 紫色 | AI/LLM | AI 节点区域、Prompt 说明 |
| 5 | 灰色 | 临时 | 调试信息、TODO、待优化 |

### Node Configuration

```javascript
{
  type: "n8n-nodes-base.stickyNote",
  typeVersion: 1,
  position: [200, 100],   // 区域左上角
  parameters: {
    content: "## 数据获取区\n\n从 API 获取原始数据并解析\n\n**输入**: Webhook 触发\n**输出**: 结构化 JSON\n**关键配置**: 分页参数 page_size=50",
    height: 400,           // 覆盖区域高度
    width: 600,            // 覆盖区域宽度
    color: 1               // 蓝色 = 数据流
  }
}
```

### Content Template

每个 StickyNote 遵循统一模板：

```markdown
## {区域名称}

{一句话说明}

**输入**: {数据来源}
**输出**: {产出数据}
**关键配置**: {核心参数或注意点}
```

**实际示例**：

```markdown
## AI 内容生成区

调用 LLM 生成文章摘要并格式化

**输入**: 清洗后的文章正文
**输出**: JSON { title, summary, tags }
**关键配置**: model=gpt-4o, temperature=0.3
```

### Layout Rules

StickyNote 必须正确覆盖目标节点区域：

- ✅ StickyNote 的 position 应比其覆盖的节点 position 小（向左上偏移 ~60px）
- ✅ height/width 要完整覆盖整个功能区所有节点
- ✅ 每个功能模块配一个 StickyNote
- ✅ 复杂工作流（>10 节点）至少 3 个 StickyNote
- ❌ 不要让 StickyNote 只覆盖部分节点
- ❌ 不要重叠多个 StickyNote

### Typical Workflow Layout

一个标准工作流的 StickyNote 分区示例：

```
[黄色 StickyNote: 触发与配置区]     [蓝色 StickyNote: 数据处理区]     [紫色 StickyNote: AI 生成区]
  ┌─────────────────────┐           ┌─────────────────────┐           ┌─────────────────────┐
  │ Webhook → 设置参数  │    →      │ HTTP → Parse → Filter│    →     │ LLM → Format → Output│
  └─────────────────────┘           └─────────────────────┘           └─────────────────────┘

                                                          [红色 StickyNote: 错误处理区]
                                                            ┌───────────────┐
                                                            │ Error Trigger │
                                                            └───────────────┘
```

---

## Set Node Naming Convention

解决多个 Set 节点无法区分的问题。所有 Set 节点必须重命名。

### Naming Pattern

格式：`{动词}-{对象}`

```
✅ Parse-API响应
✅ Transform-日期格式
✅ Prepare-LLM输入
❌ Set
❌ Set1
❌ Set2
```

### Standard Verb Prefixes

| 前缀 | 用途 | 示例 |
|------|------|------|
| Parse | 解析提取 | Parse-API响应、Parse-Webhook数据 |
| Transform | 格式转换 | Transform-日期格式、Transform-CSV行 |
| Prepare | 准备下游数据 | Prepare-LLM输入、Prepare-邮件内容 |
| Configure | 配置参数 | Configure-全局参数、Configure-API选项 |
| Filter | 字段过滤 | Filter-空值字段、Filter-无效记录 |
| Merge | 数据合并 | Merge-多源数据、Merge-API结果 |
| Format | 格式化输出 | Format-最终报告、Format-通知消息 |
| Map | 字段映射 | Map-数据库字段、Map-外部ID |

### Naming Rules

- ✅ 中英混合可接受（`Prepare-LLM输入`、`Parse-API响应`）
- ✅ 动词用英文，对象可用中文
- ✅ 保持团队内一致性
- ✅ 全局参数容器固定命名：「设置参数-综合」或「Configure Parameters」
- ❌ 不要用 Set、Set1、Set2...
- ❌ 不要用纯数字后缀
- ❌ 不要用过长名称（控制在 20 字符内）

---

## Credential Management Convention

凭据的命名、隔离和安全使用规范。

### Naming Pattern

格式：`{服务名}-{环境}-{用途}`

```
OpenAI-Prod-Main
Airtable-Dev-Testing
Notion-Prod-ContentDB
Slack-Prod-Alerts
```

### Environment Isolation

| 环境 | 后缀 | 用途 | 说明 |
|------|------|------|------|
| Prod | -Prod- | 生产工作流 | 正式数据，谨慎操作 |
| Dev | -Dev- | 开发测试 | 可随意测试，不影响生产 |
| Staging | -Staging- | 预发布验证 | 模拟生产环境 |

### Multi-Account Management

同一服务多个账号时的命名策略：

```
// 按账号区分
OpenAI-Prod-Account1
OpenAI-Prod-Account2

// 按项目/数据库区分
Notion-Prod-BlogDB
Notion-Prod-CRMDB

// 按计划区分
API-Free-Backup
API-Paid-Primary

// 按功能区分
Slack-Prod-Alerts
Slack-Prod-Reports
```

### Credential Reference in Workflows

凭据在工作流中的引用方式：

```javascript
// 节点中使用 predefinedCredentialType
{
  type: "n8n-nodes-base.httpRequest",
  credentials: {
    httpHeaderAuth: {
      id: "cred_id",
      name: "OpenAI-Prod-Main"    // 使用规范命名
    }
  }
}

// 全局参数容器中存储凭据名称引用（便于切换环境）
{
  name: "credential_name",
  value: "OpenAI-Prod-Main",       // 只存名称，不存实际 Key
  type: "string"
}
```

**优先级**：n8n 环境变量 > 全局参数容器引用 > 硬编码

### Security Rules

凭据安全是底线，无例外：

- ✅ 使用 n8n 凭据系统加密存储所有 API Key
- ✅ 全局参数容器中只存凭据名称引用，不存实际 Key
- ✅ 不同环境使用不同凭据，严格隔离
- ✅ 定期轮换凭据，特别是生产环境
- ❌ 禁止在 Set 节点明文存储 API Key（仅本地测试允许）
- ❌ 禁止在 StickyNote 中写入凭据信息
- ❌ 禁止跨环境共用同一凭据
- ❌ 禁止在代码节点中硬编码凭据
- ❌ 禁止通过 HTTP Request 明文传递凭据（使用 Header Auth 凭据类型）

### Credential Checklist

部署前检查清单：

```
[ ] 所有 API Key 已迁入 n8n 凭据系统
[ ] Set 节点中无明文密钥
[ ] StickyNote 中无敏感信息
[ ] 生产/开发环境使用不同凭据
[ ] 凭据命名符合 {服务名}-{环境}-{用途} 格式
[ ] 不再使用的凭据已删除
```
