# Step 09: 部署激活

> **执行者**: 主Agent
> **输入**: `{run_dir}/state/progress.json`（读取 workflow_id）
> **输出**: 已激活的工作流

---

## 执行说明

从 progress.json 读取 workflow_id，将验证通过的工作流激活并执行首次运行检查。

### 读取 workflow_id

```
Read {run_dir}/state/progress.json -> 获取 workflow_id
```

### 激活流程

**第一步：激活工作流**

```
n8n_activate_workflow(workflowId=workflow_id)
```

**第二步：首次执行检查（可选）**

对于非 Webhook / 非 Form Trigger 触发的工作流，执行一次测试运行：

```
n8n_execute_workflow(workflowId=workflow_id)
    -> 返回 execution_id

n8n_get_execution(executionId=execution_id)
    -> 检查执行状态
```

**第三步：执行结果判断**

| 状态 | 动作 |
|------|------|
| `success` | 部署成功，进入 Step 10 |
| `error` | 分析错误原因，回退到 Step 08 修复 |
| `waiting` | Webhook / Form Trigger 类型工作流正常，等待外部触发 |

### Webhook 类型特殊处理

Webhook 触发的工作流无法直接测试执行，激活后即为部署完成：

| 类型 | 测试方式 |
|------|---------|
| Form Trigger | 激活后获取 **webhookId** 并提供 Form URL（见下方获取方式） |
| Webhook | 激活后提供 Webhook URL，用户自行测试 |
| 定时任务 | 激活后等待首次调度，或手动执行一次 |
| 手动触发 | 执行一次测试运行 |

### Form URL 获取方式

Form Trigger v2.3 的 URL 路由使用 `webhookId`，**不是** `path` 参数。

**获取步骤**：

```
1. n8n_get_workflow(workflowId) → 获取完整工作流 JSON
2. 在 nodes 数组中找到 type="n8n-nodes-base.formTrigger" 的节点
3. 读取该节点的 "webhookId" 字段值
4. 拼接 URL：{N8N_URL}/form/{webhookId}
```

**示例**：

```
webhookId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
Form URL: {N8N_URL}/form/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

> **警告**：不要用 `path` 参数值拼接 URL。`path` 是 n8n 内部标识，v2.3 不用它做路由。

---

### 运行时验证（必须执行）

激活后必须进行运行时验证，确认工作流端到端可用。

**非 Webhook/Form 类型**（Manual、Schedule）：

```
n8n_test_workflow(workflowId)
  → n8n_executions(workflowId) → 检查最新 execution status
  → success = 部署完成
  → error = 回退 Step 08
```

**Webhook/Form Trigger 类型**：

```
1. 获取 Form URL（见上方步骤）
2. 向用户输出完整 URL
3. 提示用户在浏览器打开测试
4. 如已在 Step 08 动态验证中通过 test_workflow，则视为已验证
```

---

## 已知基础设施问题

### WEBHOOK_URL 缺失（常见于云端部署）

| 项目 | 说明 |
|------|------|
| **症状** | Form Trigger 激活后，URL 返回 404 或无法访问 |
| **根因** | 部署环境未设置 `WEBHOOK_URL` 环境变量，n8n 无法正确生成外部可访问的 Webhook URL |
| **修复** | 在部署平台环境变量中添加 `WEBHOOK_URL=https://{你的域名}/`（注意末尾斜杠） |
| **验证** | 重启 n8n 后，Form URL 应能正常访问 |

> 详见 `docs/setup.md` 关键环境变量参考中的 WEBHOOK_URL 说明。

### webhookId 缺失导致 Form 404

| 项目 | 说明 |
|------|------|
| 症状 | 工作流已激活但 `/form/{webhookId}` 返回 404 |
| 根因 | `n8n_create_workflow` MCP 不自动生成 webhookId |
| 修复 | REST API PUT 补充 webhookId → deactivate → reactivate |
| 验证 | GET `/form/{webhookId}` 返回 200 |

### 更新节点后路由未刷新

| 项目 | 说明 |
|------|------|
| 症状 | 更新了节点参数/webhookId 但 URL 仍 404 |
| 根因 | n8n 在 activate 时注册 webhook 路由，中途更新不触发重注册 |
| 修复 | 必须 deactivate → sleep 2s → reactivate |

---

## 更新进度

完成后更新 `{run_dir}/state/progress.json`：

```json
{
  "step": "step09-deploy",
  "step_status": { "step09-deploy": "completed" },
  "updated_at": "{当前时间}",
  "恢复提示": { "resume": "Step 09 完成，工作流已激活，进入 Step 10 输出" }
}
```

---

## 验证检查点

| 编号 | 检查项 | 通过标准 |
|------|--------|----------|
| 9a | 工作流已激活 | activate 返回成功 |
| 9b | 首次执行通过 | 执行状态为 success（或 Webhook 类型跳过） |
| 9c | progress.json 已更新 | step09 标记 completed |
| 9d | 运行时验证通过 | 执行状态为 success 或用户确认 Form 可访问 |
| 9e | Form URL 已验证 | 使用 webhookId 拼接的 URL 可正常打开 |

---

## 下一步

-> `Step 10: 输出导出`
