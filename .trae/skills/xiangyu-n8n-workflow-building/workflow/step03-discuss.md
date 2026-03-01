# Step 03: 方案讨论 + 用户确认

> **执行者**: 主Agent
> **输入**: `{run_dir}/step02-research/research.md` + `{run_dir}/state/config.json`
> **输出**: `{run_dir}/state/config.json`（追加 confirmed_plan）+ 用户确认的方案

---

## 执行说明

向用户展示检索结果摘要，生成方案初稿，通过迭代讨论锁定最终方案。

### 读取输入

```
Read {run_dir}/step02-research/research.md → 获取检索报告
Read {run_dir}/state/config.json → 获取用户需求
```

### 生成方案初稿

基于检索结果，向用户展示推荐方案（直接输出）：

```markdown
## 推荐方案

**架构**：Form Trigger -> {Node A} -> {Node B} -> Form Ending

**第三方服务**：
- {服务 1}：{用途}
- {服务 2}：{用途}

**节点清单**：
| # | 节点 | nodeType | 来源 | 安装状态 | 职责 |
|---|------|----------|------|---------|------|

**数据流**：
{Trigger} -> {Process} -> {Output}

**来源**：基于 n8n 社区 {URL} 的实践
```

**来源标记规则**：

| 来源 | 安装状态 | 说明 |
|------|---------|------|
| 内置 | ✅ 可用 | `nodes-base.*` / `nodes-langchain.*` |
| 社区(已认证) | ⚠️ 需安装 | search_nodes 返回 `source: "verified"` |
| 社区 | ⚠️ 需安装 | search_nodes 返回 `source: "community"` |

> 社区节点的 `key_nodes` 条目必须包含 `npm` 字段（npm 包名），用于后续 Step 08 安装提示。

**社区节点示例**：

```json
{ "nodeType": "@xxx/n8n-nodes-notion.notion", "source": "community", "npm": "n8n-nodes-notion" }
```

### 询问用户意见

```python
# 基础选项
options = [
    {"label": "满意，继续", "description": "使用当前推荐方案，进入下一步"},
    {"label": "需要调整", "description": "我有修改意见，需要调整方案"},
    {"label": "重新检索", "description": "换个方向重新搜索"}
]

# 条件选项：仅当 research.md 包含「高匹配模板」（匹配度 = 高）时追加
# 读取 research.md → 检查「高匹配模板」表格中是否有匹配度为「高」的行
if research_md_has_high_match_template:
    options.append(
        {"label": "使用模板", "description": "直接部署模板 #{id}，在此基础上调整"}
    )

AskUserQuestion(
    questions=[
        {
            "question": "以下是基于互联网检索的推荐方案，是否满意？",
            "header": "方案确认",
            "multiSelect": False,
            "options": options
        }
    ]
)
```

### 迭代逻辑

| 用户选择 | 动作 | 限制 |
|---------|------|------|
| 满意，继续 | 锁定方案，更新 config.json，进入 Step 04 | - |
| 需要调整 | 用户输入修改意见 -> 更新方案 -> 再次询问 | 最多 3 轮 |
| 重新检索 | 用户输入新方向 -> 回到 Step 02 重新检索 | 最多 1 次 |
| 使用模板 | 模板快速部署路径（见下方） | 仅当高匹配模板存在 |

### 模板快速部署路径

当用户选择「使用模板」时，执行快速部署流程：

```
1. get_template({ templateId: {id}, mode: "full" })  → 获取完整 JSON
2. n8n_deploy_template({ templateId: {id} })          → 部署到 n8n 实例
3. 写入 workflow_id 到 progress.json
4. 跳过 Step 04/05/06，直接进入 Step 07（凭据配置）
```

> **跳过原因**：模板已包含完整节点拓扑和连接，无需知识库查询（04）、架构设计（05）、手动构建（06）。

### 锁定方案

用户确认后，更新 `{run_dir}/state/config.json`，追加 `confirmed_plan` 字段：

**常规方案（满意/调整）**：

```json
{
  "confirmed_plan": {
    "mode": "from_scratch",
    "architecture": "Form Trigger -> HTTP Request -> Code -> Form Ending",
    "services": ["fal.ai API"],
    "key_nodes": [
      { "nodeType": "nodes-base.formTrigger", "source": "core" },
      { "nodeType": "nodes-base.httpRequest", "source": "core" },
      { "nodeType": "nodes-base.code", "source": "core" },
      { "nodeType": "nodes-base.form", "source": "core" }
    ],
    "source_urls": ["https://community.n8n.io/..."],
    "confirmed_at": "2026-02-10T15:00:00+08:00"
  }
}
```

**key_nodes 校验规则**：

| 字段 | 必填条件 | 说明 |
|------|---------|------|
| nodeType | 全部 | search_nodes 返回的 workflowNodeType |
| source | 全部 | `"core"` / `"verified"` / `"community"` |
| npm | source != "core" | npm 包名，社区节点必填 |

> 锁定方案时遍历 key_nodes，社区节点缺少 npm 时回查 search_nodes 结果补全。

**含社区节点的 key_nodes 示例**：

```json
{
  "confirmed_plan": {
    "mode": "from_scratch",
    "architecture": "Form Trigger -> Notion -> Form Ending",
    "services": ["Notion API"],
    "key_nodes": [
      { "nodeType": "nodes-base.formTrigger", "source": "core" },
      { "nodeType": "@xxx/n8n-nodes-notion.notion", "source": "community", "npm": "n8n-nodes-notion" },
      { "nodeType": "nodes-base.form", "source": "core" }
    ],
    "source_urls": ["https://community.n8n.io/..."],
    "confirmed_at": "2026-02-10T15:00:00+08:00"
  }
}
```

**模板部署方案（使用模板）**：

```json
{
  "confirmed_plan": {
    "mode": "template_deploy",
    "template_id": 2947,
    "template_name": "Slack + OpenAI Agent",
    "services": ["Slack", "OpenAI"],
    "source_urls": ["https://n8n.io/workflows/2947"],
    "confirmed_at": "2026-02-10T15:00:00+08:00"
  }
}
```

---

## 更新进度

完成后更新 `{run_dir}/state/progress.json`：

```json
{
  "step": "step03-discuss",
  "step_status": { "step03-discuss": "completed" },
  "updated_at": "{当前时间}",
  "恢复提示": { "resume": "Step 03 完成，方案已确认。mode=from_scratch → Step 04；mode=template_deploy → Step 07" }
}
```

---

## 验证检查点

| 编号 | 检查项 | 通过标准 |
|------|--------|----------|
| 3a | 方案初稿已展示 | 用户看到了推荐方案 |
| 3b | 用户已确认 | 用户选择「满意，继续」或「使用模板」 |
| 3c | confirmed_plan 已写入 | config.json 包含 confirmed_plan 字段（含 mode） |
| 3d | 模板部署（条件） | 若 mode=template_deploy，workflow_id 已写入 progress.json |
| 3e | progress.json 已更新 | step03-discuss 标记 completed |

---

## 下一步

- `mode=from_scratch` -> `Step 04: 知识库查询`
- `mode=template_deploy` -> `Step 07: 凭据配置`（跳过 04/05/06）
