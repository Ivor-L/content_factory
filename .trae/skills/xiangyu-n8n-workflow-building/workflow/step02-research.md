# Step 02: 互联网最佳实践检索

> **执行者**: 主Agent
> **输入**: `{run_dir}/state/config.json`
> **输出**: `{run_dir}/step02-research/research.md`

---

## 执行说明

基于用户需求检索互联网上的 n8n 社区最佳实践，为后续方案讨论提供数据支撑。

### 读取配置

```
Read {run_dir}/state/config.json → 获取 business_logic、external_services、workflow_type
```

### 构建搜索查询

构建 3 轮搜索查询（串行执行，间隔 >= 2 秒）：

| 轮次 | 查询模板 | 目标 |
|------|---------|------|
| 1 | `"n8n workflow {business_logic} best practice 2025 OR 2026"` | 核心业务场景 |
| 2 | `"n8n {external_service_1} {external_service_2} integration template 2025 OR 2026"` | 服务集成模式 |
| 3 | `"n8n community {具体场景} workflow example 2026"` | 社区最新实践 |

> **规则**：查询模板中的 `{business_logic}`、`{external_service}` 直接从 config.json 填充，天然按需求差异化。所有查询追加 `2025 OR 2026` 确保时效性。

### 搜索规则

| 规则 | 说明 |
|------|------|
| 工具 | brave_web_search（串行调用，间隔 >= 2 秒） |
| 优先域名 | community.n8n.io、docs.n8n.io、n8n.io/workflows |
| 每轮分析 | top 5 结果 |
| 深度抓取 | 每轮 top 1-2 高相关度结果执行 WebFetch 抓取原文（优先 community.n8n.io、docs.n8n.io） |
| 时效性 | 优先近 12 个月结果；2023 年及以前结果降低权重，仅在无近期结果时参考 |
| 最大轮数 | 3 轮 |

### 深度抓取

对每轮 brave_web_search 结果中 top 1-2 高相关度结果执行 WebFetch 获取原文：

| 规则 | 说明 |
|------|------|
| 触发条件 | 结果 URL 域名为 community.n8n.io 或 docs.n8n.io |
| 抓取上限 | 每轮最多 2 个 URL，3 轮共最多 6 个 |
| 提取重点 | 具体参数值、配置代码片段、已知坑（含版本号）、API 变更说明 |
| 跳过条件 | URL 为模板展示页（n8n.io/workflows/）— 摘要已足够 |
| 工具 | WebFetch（URL, prompt="提取 n8n 节点配置参数、具体代码示例、已知问题和版本兼容性信息"） |

> **注意**：WebFetch 与 brave_web_search 不共享速率限制，可在搜索间隔内执行。每轮顺序：brave_search → 分析 top 5 → WebFetch top 1-2 → 下一轮。

### 信息提取

从搜索结果和深度抓取中提取：

| 信息 | 说明 |
|------|------|
| 节点组合 | 业界推荐的节点搭配 |
| 数据流架构 | 典型的数据处理流程 |
| 第三方服务 | 推荐的 API / 服务（具体到接口） |
| 关键配置 | 从原文抓取的具体参数、代码片段、版本要求 |
| 常见坑 | 社区反馈的问题和解决方案（含版本号） |

### 创建输出目录

```
mkdir -p {run_dir}/step02-research/
```

### 写入 research.md

将检索结果整理为 `{run_dir}/step02-research/research.md`，结构如下：

```markdown
# 互联网最佳实践检索报告

## 检索关键词
- {query_1}
- {query_2}
- {query_3}

## 业界推荐方案

### 方案 A：{名称}
- 架构：{节点流程}
- 第三方服务：{具体 API}
- 关键配置：{从原文抓取的具体参数、代码片段、已知坑}
- 优点：{...}
- 缺点：{...}
- 来源：{URL}
- 发布日期：{YYYY-MM 或 "未知"}

### 方案 B：{名称}
- 架构：{节点流程}
- 第三方服务：{具体 API}
- 关键配置：{从原文抓取的具体参数、代码片段、已知坑}
- 优点：{...}
- 缺点：{...}
- 来源：{URL}
- 发布日期：{YYYY-MM 或 "未知"}

## 推荐的第三方服务
| 服务 | 用途 | 替代方案 |
|------|------|---------|

## 常见坑和最佳实践
- {来自社区的经验}

## 检索总结
{综合分析，推荐最适合用户场景的方案}
```

### MCP 节点探索

在 brave_web_search 3 轮完成后，通过 n8n-mcp 直接探索可用节点：

**Step 02b：MCP 节点发现**

1. 从 02a 搜索结果中提取核心服务关键词（如 "notion"、"airtable"、"deepseek"）
2. 对每个关键词执行 `search_nodes({ query: "关键词", source: "all" })`
3. 标记返回节点的来源类型：
   - `nodes-base.*` / `nodes-langchain.*` → `[内置]`
   - `source: "verified"` → `[社区(已认证)]`
   - `source: "community"` → `[社区]`
4. 结果追加到 research.md 的「MCP 节点探索」章节

**追加到 research.md 的章节模板**：

```markdown
## MCP 节点探索

### 搜索关键词
- {keyword_1} → {N} 个节点
- {keyword_2} → {N} 个节点

### 发现的节点
| 节点名称 | nodeType | 来源 | npm 包名 | 说明 |
|---------|----------|------|---------|------|
| Notion | nodes-base.notion | 内置 | - | 官方内置 |
| Notion Enhanced | n8n-nodes-notion.notion | 社区(已认证) | n8n-nodes-notion | 增强功能 |
```

> **规则**：search_nodes 的 `source` 参数支持 `"all"`（默认）、`"core"`、`"community"`、`"verified"`。优先用 `"all"` 全量搜索，再按返回结果分类标记。

### 交叉验证（02a vs 02b）

Step 02a（brave 搜索）提到的服务/节点与 Step 02b（search_nodes）结果交叉比对：

| 场景 | 动作 |
|------|------|
| 02a 提到的服务在 02b 中找到对应节点 | 标记为 **已确认**，可直接进入方案 |
| 02a 提到的服务在 02b 中未找到（0 结果） | 执行 FUZZY 搜索：`search_nodes({ query: "{服务名}", mode: "FUZZY" })` |
| FUZZY 仍无结果 | 标记为 **需 HTTP Request 替代**，方案中使用通用 HTTP Request 节点 |
| 02b 发现但 02a 未提及的高相关度节点 | 标记为 **额外发现**，补充到方案候选 |

**追加到 research.md**：

```markdown
## 交叉验证

| 服务/节点 | 02a 来源 | 02b 结果 | 状态 |
|-----------|---------|---------|------|
| {service} | brave top N | {nodeType} | 已确认 / FUZZY 匹配 / 需 HTTP Request |
```

> **目的**：避免 brave 搜索推荐的方案使用了 n8n 不存在的节点，提前发现需要用 HTTP Request 手写 API 调用的场景。

### MCP 模板检索（必做）

**Step 02c：三轮模板搜索**

在 Step 02b 完成后，通过 n8n-mcp 搜索模板库，发现可复用的现成工作流：

| 轮次 | 调用方式 | 搜索策略 |
|------|---------|---------|
| 1 | `search_templates({ query: "{business_logic}", limit: 10 })` | 关键词匹配 |
| 2 | `search_templates({ searchMode: "by_task", task: "{匹配的任务类型}" })` | 按任务类型（10 种标准任务之一） |
| 3 | `search_templates({ searchMode: "by_nodes", nodeTypes: ["{02b 发现的节点}"] })` | 按节点组合（从 02b 的 search_nodes 结果中提取） |

> **任务类型**：search_templates 的 `by_task` 模式支持 10 种标准任务，根据 business_logic 选择最接近的一种。

**获取模板拓扑**：对搜索结果中匹配度最高的前 3 个模板，调用 `get_template({ templateId: {id}, mode: "structure" })` 获取节点 + 连接拓扑。

**结构化匹配度评估**：获取模板拓扑后，与 `config.json` 做节点级 diff：

| 维度 | 评估方法 | 权重 |
|------|---------|------|
| 触发节点 | 模板触发类型 vs `workflow_type` | 高 |
| 核心服务节点 | 模板节点列表 vs `external_services` 涉及的节点 | 高 |
| 数据处理节点 | 模板是否包含 Code/Set/IF 等转换节点 | 中 |
| 节点总数差异 | \|模板节点数 - 预估节点数\| | 低 |

**匹配度量化**：

```
高匹配 = 触发类型一致 + 核心服务节点覆盖 >= 80%
中匹配 = 触发类型一致 + 核心服务节点覆盖 >= 50%（或触发不一致但服务全覆盖）
低匹配 = 核心服务节点覆盖 < 50%（仅架构模式相似）
```

**追加到 research.md 的章节模板**：

```markdown
## MCP 模板检索

### 搜索策略
- 轮次 1（关键词）：`{query}` → {N} 个结果
- 轮次 2（任务类型）：`{task}` → {N} 个结果
- 轮次 3（节点组合）：`{nodeTypes}` → {N} 个结果

### 高匹配模板
| # | 模板 ID | 名称 | 节点数 | 匹配度 | diff 摘要 | 可直接部署 |
|---|---------|------|--------|--------|----------|-----------|
| 1 | {id} | {name} | {N} | 高/中/低 | {缺少/多余节点} | ✅ / ⚠️ 需修改 |

### 模板 #{id} 拓扑结构
{get_template(mode:"structure") 的节点和连接摘要}
```

> **匹配度判定**：基于结构化 diff 量化评估（见上方规则），不依赖直觉判断。

---

## 更新进度

完成后更新 `{run_dir}/state/progress.json`：

```json
{
  "step": "step02-research",
  "step_status": { "step02-research": "completed" },
  "updated_at": "{当前时间}",
  "恢复提示": { "resume": "Step 02 完成，检索报告在 step02-research/research.md，进入 Step 03 方案讨论" }
}
```

---

## 验证检查点

| 编号 | 检查项 | 通过标准 |
|------|--------|----------|
| 2a | 搜索查询已构建 | 3 轮查询与用户需求相关 |
| 2b | brave_web_search 已执行 | 3 轮串行调用，间隔 >= 2s |
| 2b+ | 深度抓取已执行 | 至少 1 个 community/docs URL 已 WebFetch |
| 2c | MCP 节点发现已执行 | search_nodes 至少执行 1 次 |
| 2c+ | 交叉验证已执行 | 02a 服务与 02b 节点已比对，不匹配项已标注 |
| 2d | MCP 模板检索已执行 | search_templates 3 轮完成，高匹配模板已获取拓扑 + diff |
| 2e | 方案已提取 | 至少提取 1 个业界推荐方案（含关键配置和发布日期） |
| 2f | research.md 已写入 | `{run_dir}/step02-research/research.md` 存在，含交叉验证和模板检索章节 |
| 2g | progress.json 已更新 | step02-research 标记 completed |

---

## 下一步

-> `Step 03: 方案讨论 + 用户确认`
