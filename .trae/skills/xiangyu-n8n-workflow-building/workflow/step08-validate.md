# Step 08: 验证修复

> **执行者**: 主Agent
> **输入**: `{run_dir}/state/progress.json`（读取 workflow_id）
> **输出**: 工作流（0 Error）
> **前置**: Step 06（构建完成）+ Step 07（凭据已配置或跳过）

---

## 目标

循环验证工作流配置，自动修复错误，最多 10 轮。支持内部知识 + 互联网搜索双重修复策略。

## 核心改进（vs 旧版）

| 维度 | 旧版 | 新版 |
|------|------|------|
| 循环上限 | 5 轮 | **10 轮** |
| 知识来源 | 仅 reference/ | reference/ **+ 互联网搜索** |
| 凭据错误 | 建议"绑定凭证" | **回退到 Step 07** |
| 终止处理 | 报告用户请求指导 | **终止报告 + 可行方案** |

---

## 执行流程

### 8.1 初始验证

```
Read {run_dir}/state/progress.json -> 获取 workflow_id
  |
  v
n8n_validate_workflow(workflowId)
  |
  +-- 0 Error -> 验证通过 -> 进入 Step 09
  |
  +-- N Error -> 进入修复循环
```

### 8.2 修复循环（最多 10 轮）

#### 阶段 1: 内部修复（轮次 1-2）

每个错误按类型查阅 reference/ 内部资料：

| 错误类型 | 处理方式 | 参考文档 |
|---------|---------|---------|
| 节点配置错误 | 修正参数 | `reference/rules/error-catalog.md` |
| 连接缺失 | 添加连接 | `reference/tools/workflow-guide.md` |
| 表达式错误 | 修正表达式 | `reference/specs/expression-mistakes.md` |
| 误报 | 记录并跳过 | `reference/rules/false-positives.md` |
| 通用修复 | 综合判断 | `reference/rules/validation-expert.md` |

修复操作：

```
n8n_update_partial_workflow(
    workflowId=workflow_id,
    nodes=[...修复后的节点配置...]
)
```

修复后立即重新验证。

#### 阶段 1.5: 社区节点问题检测（REST API 增强）

验证错误中出现 "unknown node type" 类错误时，通过 REST API 精确诊断：

**1.5a. 查询实际安装状态**：

```
GET /rest/community-packages
认证：Cookie: n8n-auth={N8N_SESSION}（从 credentials/n8n.md 读取）
```

**1.5b. 三种判定**：

```
验证错误包含 "unknown node type" / "unrecognized node" / 节点类型无法识别
  |
  v
GET /rest/community-packages → 获取已安装包列表
  |
  v 匹配 confirmed_plan.key_nodes 中对应节点
  |
  +-- 未安装（包名不在已安装列表中）
  |     → 检查 progress.json.community_packages 是否 Step 06 已尝试
  |     → 未尝试：自动安装 POST /rest/community-packages {"name":"{npm}"}
  |     → 已尝试失败/跳过：输出手动安装提示，暂停等待用户确认
  |
  +-- 已安装但 failedLoading: true
  |     → 建议卸载重装：DELETE → POST /rest/community-packages
  |     → 或建议降级到上一稳定版本
  |
  +-- 已安装但 type 不匹配（nodeType 与 workflowNodeType 不一致）
  |     → 检查 updateAvailable 字段
  |     → 有更新：建议 PATCH /rest/community-packages 升级
  |     → 无更新：可能是 nodeType 拼写错误，修正工作流中的 type 字段
  |
  +-- source: "core"（非社区节点）
  |     → 正常修复流程（nodeType 拼写错误）
  |
  +-- 未在 key_nodes 中找到
        → 正常修复流程
```

**1.5c. REST API 不可用时**（401/连接失败）：

保持原有手动安装提示行为：

```markdown
⚠️ 社区节点未安装

以下社区节点需要在 n8n 实例中安装才能使用：

| npm 包名 | 来源 | 安装方式 |
|---------|------|---------|
| {npm} | {source} | Settings → Community Nodes → Install |

**安装步骤**：
1. 打开 n8n 界面 → Settings → Community Nodes
2. 点击 "Install a community node"
3. 输入包名：`{npm}`
4. 点击 Install

安装完成后请告知，我将继续验证。

> 详细指南：`docs/community-nodes.md`
```

> **规则**：社区节点问题不计入 10 轮修复循环，属于环境问题而非配置错误。

#### 阶段 2: 互联网搜索增强（轮次 2+）

**触发条件**（满足任一）：

1. 相同错误连续 2 轮未解决
2. round >= 2 且错误类型为 `invalid_value` 或 `missing_required`
3. round >= 5 时兜底搜索（任何未解决错误）

**搜索策略**（按优先级尝试）：

```
策略 0: 查 nodes-catalog.md 获取该节点的官方文档链接，直接 WebFetch 官方文档
策略 1: "n8n {node_type} {error_message} fix" site:docs.n8n.io
策略 2: "n8n {node_type} {operation} configuration 2026"
策略 3: "n8n workflow validation {error_type} solution"
```

**搜索规则**：

- **策略 0 优先**：从 `reference/catalog/nodes-catalog.md` 查找节点的 `[docs]` 链接，优先直接获取官方文档
- 使用 brave_web_search（串行调用，间隔 >= 2 秒）
- 优先域名：docs.n8n.io、community.n8n.io
- 每个 unique error 最多 2 次搜索
- 分析搜索结果 -> 提取修复方案 -> 应用 -> 重新验证

#### 阶段 3: 凭据缺失回退

检测到凭据相关错误时的处理：

```
错误信息包含 credentials / 凭证 / authentication
  |
  v
回退到 Step 07 执行凭据配置
  |（回退不计入 10 轮循环轮次）
  v
Step 07 完成后回到 Step 08 继续验证
```

### 8.3 循环终止条件

| 条件 | 动作 |
|------|------|
| 0 Error（静态验证通过） | 进入动态运行验证（阶段 4） |
| 全部已确认误报 | 视为通过 -> Step 09 |
| 凭证缺失 | 回退 Step 07（不计入轮次） |
| 10 轮仍有 Error | 终止，输出报告 |

### 8.3.5 阶段 4: 动态运行验证

**触发条件**：静态验证（`n8n_validate_workflow`）返回 0 Error 时自动进入。

静态验证只检查配置有效性，无法发现运行时错误（如 API 地址错误、表达式求值失败、节点执行异常）。动态验证通过实际执行工作流来发现这些问题。

#### 按触发类型分策略

| 触发类型 | 测试方法 | 说明 |
|---------|---------|------|
| Manual Trigger | `n8n_test_workflow(workflowId)` | 直接执行，无需 payload |
| Webhook | `n8n_test_workflow(workflowId, payload={...})` | 构造符合预期的 JSON payload |
| Form Trigger | curl POST multipart/form-data 到 Form URL + 查 executions | field-0/1/2... 按 formFields 顺序，必填填测试值，dropdown 取首项 |
| Chat Trigger | 跳过动态验证 | 需要 WebSocket 交互，MCP 不支持 |
| Schedule | `n8n_test_workflow(workflowId)` | 直接执行，模拟定时触发 |

#### 前置条件：webhookId 检查

动态验证前，必须确认 Form Trigger 和 Form Ending 节点已分配 `webhookId`：

```
n8n_get_workflow(workflowId, mode="full")
  → 检查 Form Trigger 节点是否有 webhookId 字段
  → 检查 Form Ending 节点是否有 webhookId 字段
  → 若缺失：通过 REST API PUT 补充 UUID v4 → deactivate → reactivate
```

**curl 测试 URL 规则**：
- URL 格式：`/form/{webhookId}`（**非** `/form/{workflowId}`）
- webhookId 从 `n8n_get_workflow` 返回的节点 JSON 中获取
- Form Trigger 的 `webhookId` 用于表单访问 URL
- Form Ending 的 `webhookId` 用于内部路由（n8n 自动管理）

#### Form Trigger 测试数据构造

n8n Form Trigger 的 production URL 接受 `multipart/form-data` POST，字段名按 `formFields.values` 数组顺序编号为 `field-0`、`field-1`、`field-2`...

```bash
# 从设计稿 formFields.values 按顺序构造
# field-0 = 第 1 个字段，field-1 = 第 2 个字段 ...

curl -X POST '{N8N_URL}/form/{webhookId}' \
  --form 'field-0="{必填字段测试值}"' \
  --form 'field-1="{dropdown 首项}"' \
  ...
```

> **规则**：必填字段全部填充测试值，dropdown 取第一个 option，password 填 `"test-key-xxx"`。Content-Type **必须**为 `multipart/form-data`（不接受 JSON）。

#### 执行验证流程

```
触发类型 == Form Trigger？
  |
  +-- 是 → curl POST multipart/form-data 到 Form URL
  |     字段名：field-0, field-1, ... (按 formFields 顺序)
  |     必填字段填测试值，dropdown 取第一个 option
  |     |
  |     +-- HTTP 200 → 等待 3 秒 → n8n_executions(workflowId) 查最近 execution
  |     |     +-- status=success, 所有节点有输出 → PASS
  |     |     +-- status=error → 提取错误节点和信息 → 进修复循环
  |     |
  |     +-- HTTP 非 200 → 记录为 warning，降级通过
  |
  +-- 否 → n8n_test_workflow(workflowId, payload)
        |
        +-- 返回 executionId
        |
        v
        n8n_executions(workflowId) → 找到该 execution
        |
        +-- status: "success" → 检查节点覆盖率
        |     |
        |     +-- 所有节点均有输出 → 动态验证通过 → Step 09
        |     +-- 部分节点无输出 → 分析跳过原因（条件分支正常 vs 配置错误）
        |
        +-- status: "error" → 提取错误节点和信息
        |     |
        |     v
        |     回到修复循环（计入 10 轮限制）
        |
        +-- status: "waiting" → Webhook 类型正常，视为通过
```

#### 动态验证结果判定

| 结果 | 判定 | 动作 |
|------|------|------|
| status=success，全节点有输出 | **通过** | 进入 Step 09 |
| status=success，部分节点跳过 | **条件通过** | 分析是否为条件分支正常行为，是则通过 |
| status=error | **失败** | 提取错误信息，回到修复循环 |
| status=waiting | **通过**（仅 Webhook 类型） | 进入 Step 09 |
| Form Trigger: curl 200 + execution success | **通过** | 进入 Step 09 |
| Form Trigger: curl 200 + execution error | **失败** | 提取错误信息，回修复循环 |
| Form Trigger: curl 非 200 | **降级** | 记录 warning，仍进入 Step 09 |
| test_workflow 调用失败 | **跳过** | 记录原因，仍进入 Step 09（降级处理） |

---

### 8.4 错误追踪

每轮维护错误追踪表：

```json
{
  "round": 3,
  "errors": [
    {
      "node": "OpenAI",
      "type": "invalid_value",
      "message": "...",
      "first_seen": 1,
      "attempts": 3,
      "search_count": 1,
      "status": "unresolved"
    }
  ]
}
```

### 8.5 10 轮终止报告

达到 10 轮仍有未解决错误时，输出以下格式的报告：

```markdown
## 验证修复终止报告

### 基本信息
| 项目 | 值 |
|------|------|
| 工作流 | {name} (ID: {id}) |
| 总轮次 | 10 |
| 已修复 | {N} 个 |
| 剩余 | {M} 个 |

### 剩余错误清单
| # | 节点 | 错误类型 | 错误信息 | 尝试次数 |
|---|------|---------|---------|---------|
| 1 | {node} | {type} | {message} | {count} |

### 可能原因分析
1. {基于修复历史和搜索结果的分析}

### 可行的下一步方案
1. **手动修复**: 在 n8n 界面 ({workflow_url}) 修改节点配置
2. **社区求助**: 在 community.n8n.io 发帖描述问题
3. **替代方案**: 使用替代节点/方法实现相同功能
4. **降级策略**: 移除问题节点，先部署核心功能
```

---

## 更新进度

完成后更新 `{run_dir}/state/progress.json`：

```json
{
  "step": "step08-validate",
  "step_status": { "step08-validate": "completed" },
  "validation_rounds": 3,
  "errors_fixed": 5,
  "errors_remaining": 0,
  "search_queries_used": 2,
  "updated_at": "{当前时间}",
  "恢复提示": { "resume": "Step 08 完成，验证通过（{rounds} 轮），进入 Step 09 部署" }
}
```

---

## 验证检查点

| 编号 | 检查项 | 通过标准 |
|------|--------|----------|
| 8a | validate 返回 0 Error（或全误报） | 所有错误已解决或确认误报 |
| 8b | 修复记录完整 | 每轮的修复操作和结果已记录 |
| 8c | 搜索已按规则触发 | 未跳过必要的互联网搜索 |
| 8d | 循环未超限 | <= 10 轮 |
| 8e | 终止报告完整（如适用） | 包含错误清单 + 原因 + 方案 |
| 8f | progress.json 已更新 | validation 状态完整 |
| 8g | 动态验证已执行 | 静态 0 Error 后触发 test_workflow |
| 8h | 动态验证结果正确 | execution status 为 success 或 waiting |

---

## 注意事项

- **搜索间隔**: brave_web_search 串行调用，间隔 >= 2 秒（Free 计划限制）
- **误报处理**: 参考 `reference/rules/false-positives.md` 判断
- **凭据回退**: 检测到 credentials 关键词的错误 -> Step 07
- **修复策略**: 先小范围修改，避免引入新错误

---

## 下一步

-> `Step 09: 部署激活`
