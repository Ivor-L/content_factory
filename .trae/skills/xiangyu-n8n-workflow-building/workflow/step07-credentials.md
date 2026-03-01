# Step 07: 凭据配置

> **执行者**: 主Agent
> **输入**: `{run_dir}/state/progress.json`（含 workflow_id）
> **输出**: 工作流节点凭据已绑定，凭据状态写入 progress.json

---

## 执行说明

扫描工作流节点的凭据需求，通过 n8n REST API 查询/创建/绑定凭据。

### 前置条件

- Step 06 已完成，`workflow_id` 已写入 `progress.json`
- **凭据读取**：从 Skill 内置凭据文件 `credentials/n8n.md` 读取 `{N8N_URL}` 和 `{N8N_API_KEY}`。文件不存在时提示用户参考 `docs/setup.md` 第四步配置

---

## 执行流程

### 7.1 扫描节点凭据需求

```
n8n_get_workflow(workflowId) -> 遍历 nodes[]
每个节点检查 credentials 属性 -> 收集 required_credentials[]
```

**无凭据需求**：直接标记 `step07-credentials: "completed"`，跳过后续步骤。

### 7.2 查询 n8n 现有凭据

```bash
curl -s -X GET "{N8N_URL}/api/v1/credentials" \
  -H "X-N8N-API-KEY: {N8N_API_KEY}"
```

解析返回的 `existing_credentials[]`。

### 7.3 匹配凭据

对比 `required_credentials[]` vs `existing_credentials[]`：

- **matched[]**：类型匹配，可直接绑定
- **missing[]**：需要创建

### 7.4 处理缺失凭据

对每个 missing 凭据，使用 `AskUserQuestion` 询问用户：

- 选项 1：提供 API Key 创建凭据
- 选项 2：跳过，稍后在 n8n 界面手动配置

### 7.5 创建凭据

用户选择创建时：

**查询凭据 schema**：

```bash
curl -s -X GET "{N8N_URL}/api/v1/credentials/schema/{credentialType}" \
  -H "X-N8N-API-KEY: {N8N_API_KEY}"
```

**创建凭据**：

```bash
curl -s -X POST "{N8N_URL}/api/v1/credentials" \
  -H "X-N8N-API-KEY: {N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"name":"{名称}","type":"{类型}","data":{字段对象}}'
```

### 7.6 绑定凭据到节点

```
n8n_update_partial_workflow(
    workflowId,
    nodes: [{
        name, type,
        credentials: {
            "{credType}": { id: "{credId}", name: "{credName}" }
        }
    }]
)
```

### 7.7 更新 progress.json

```json
{
  "credentials": {
    "required": ["openAiApi", "slackApi"],
    "bound": [
      {"node": "OpenAI", "type": "openAiApi", "credential_id": "cred-123", "source": "existing"}
    ],
    "skipped": ["slackApi"]
  }
}
```

---

## 验证检查点

| 编号 | 检查项 | 通过标准 |
|------|--------|----------|
| 7a | 凭据需求已扫描 | required 列表完整 |
| 7b | 现有凭据已查询 | API 返回 200 |
| 7c | 匹配完成 | 每个 required 有 matched/missing 状态 |
| 7d | 缺失凭据已处理 | 用户选择创建或跳过 |
| 7e | 凭据已绑定 | updateNode 设置 credentials 字段 |
| 7f | progress.json 已更新 | credentials 对象完整 |

---

## 注意事项

| 注意 | 说明 |
|------|------|
| API 方式 | n8n-mcp 不支持凭据操作，所有凭据 API 调用必须通过 Bash curl |
| 安全红线 | **绝对禁止**在工作流 JSON 中硬编码 API Key |
| 加密存储 | 凭据创建后 n8n 会自动加密存储 |
| 命名规范 | 凭据名称格式：`{服务名} - {用途}`（如 "OpenAI - Video Gen"） |

---

## 更新进度

凭据配置完成后，更新 `{run_dir}/state/progress.json`：

```json
{
  "step": "step07-credentials",
  "step_status": { "step07-credentials": "completed" },
  "updated_at": "{当前时间}",
  "恢复提示": { "resume": "Step 07 完成，凭据已绑定，进入 Step 08 验证修复" }
}
```

---

## 下一步

-> `Step 08: 验证修复`
