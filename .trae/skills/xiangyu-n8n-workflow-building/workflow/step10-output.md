# Step 10: 输出导出

> **执行者**: 主Agent
> **输入**: `{run_dir}/state/progress.json` + `{run_dir}/state/config.json`
> **输出**: `{run_dir}/output/{workflow_name}.json` + `{run_dir}/output/report.md`

---

## 执行说明

双输出：导出工作流 JSON 到 runs 目录 + 生成部署确认报告。

### 读取输入

```
Read {run_dir}/state/progress.json -> 获取 workflow_id
Read {run_dir}/state/config.json -> 获取 workflow_name、keyword
```

### 导出工作流 JSON

```
n8n_get_workflow(workflowId=workflow_id)
    -> 获取完整工作流 JSON
```

将 JSON 写入：

```
{run_dir}/output/{workflow_name}.json
```

### 部署确认报告

将报告写入 `{run_dir}/output/report.md`，格式：

```markdown
# n8n 工作流部署确认

| 项目 | 值 |
|------|-----|
| 工作流名称 | {name} |
| 工作流 ID | {workflow_id} |
| 状态 | 已激活 |
| 节点数 | {node_count} |
| 触发方式 | {trigger_type} |
| Form URL | {url}（form_trigger 类型适用） |
| Webhook URL | {url}（webhook 类型适用） |
| JSON 导出 | {run_dir}/output/{name}.json |

## 节点清单

| 序号 | 节点名称 | 类型 |
|------|---------|------|
| 1 | ... | ... |

## 连接拓扑

{简要描述数据流}

## 注意事项

- {需要配置凭证的节点}
- {Webhook URL 等信息}
```

同时向用户输出报告内容。

---

## 更新进度

全部完成后，更新 `{run_dir}/state/progress.json`：

```json
{
  "step": "step10-output",
  "step_status": { "step10-output": "completed" },
  "updated_at": "{当前时间}",
  "恢复提示": { "resume": "全部完成，输出在 output/ 目录" }
}
```

---

## 验证检查点

| 编号 | 检查项 | 通过标准 |
|------|--------|----------|
| 10a | JSON 文件已导出 | `{run_dir}/output/{name}.json` 存在且 JSON 合法 |
| 10b | 报告已写入 | `{run_dir}/output/report.md` 存在 |
| 10c | 报告已输出给用户 | 包含工作流名称、ID、状态、节点清单 |
| 10d | progress.json 已更新 | 全部 step 标记 completed |

---

## 完成

工作流构建流水线完成。所有产物在 `{run_dir}/` 目录中。
