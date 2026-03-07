# 爆款复刻功能后端 n8n 对接计划

根据用户需求和文档（`docs/WORKFLOWS.md`, `ENV_CONFIG.md`），本计划旨在完成爆款复刻功能的后端 n8n 对接。主要涉及前端参数透传、后端 API 改造、n8n 调用封装更新以及回调接口的创建。

## 目标
1.  **完善参数传递**：确保前端选择的 `targetCountry`, `targetLanguage`, `duration`, `quantity` 等参数能够传递给后端并最终发送给 n8n。
2.  **实现异步对接**：改造后端 API 为异步触发模式，不等待 n8n 生成结果，而是立即返回任务 ID。
3.  **实现回调接收**：创建 Webhook 接口接收 n8n 的异步回调，并更新数据库状态。
4.  **用户身份与积分**：在调用 n8n 时传递 `api_key`，以支持积分扣除（需从 Supabase 获取）。

## 实施步骤

### 1. 修改 `lib/n8n.ts`
更新 `generateReplication` 函数，使其支持更多参数并适应异步模式。

*   **修改函数签名**：增加 `ReplicationOptions` 接口，包含 `targetCountry`, `targetLanguage`, `duration`, `quantity`, `apiKey`, `callbackUrl` 等字段。
*   **构造 Payload**：将所有参数映射到 n8n 期望的 JSON 结构。
*   **移除同步等待**：调用 fetch 后，仅检查 HTTP 200 状态，不再等待返回完整的生成结果（因为是异步的）。
*   **环境变量**：确保使用 `N8N_REPLICATION_WEBHOOK`（对应 `Getway_web`）。

### 2. 改造 `app/api/replication/generate/route.ts`
修改触发接口，处理参数并触发异步任务。

*   **参数解析**：从 Request Body 解析所有前端传递的参数。
*   **获取 API Key**：
    *   尝试从请求头 `Authorization` 获取 Token。
    *   通过 Supabase Auth 获取当前用户 User ID。
    *   查询 `profiles` 表获取用户的 `api_key`。
    *   若获取失败，返回 401 或 400 错误（根据实际情况，若为演示环境可做降级处理）。
*   **创建记录**：在 `Replication` 表中创建记录，状态设为 `pending`。
*   **触发 n8n**：调用 `generateReplication`，传入参数和 `callbackUrl`（指向本系统的回调接口）。
*   **响应**：立即返回 `{ id: replication.id, status: 'pending' }`。

### 3. 创建回调接口 `app/api/webhook/replication/route.ts`
新建 API Route 用于接收 n8n 的回调。

*   **路径**：`app/api/webhook/replication/route.ts`
*   **方法**：`POST`
*   **逻辑**：
    *   解析 Body，预期包含 `task_id` (对应 `replication.id`), `status`, `result` (包含视频 URL 等), `error`。
    *   根据 `task_id` 查找 `Replication` 记录。
    *   更新记录状态（`completed` 或 `failed`）和结果内容。
    *   返回 200 OK。

### 4. 验证与测试
*   **单元测试/手动测试**：
    *   模拟前端请求 `generate` 接口，验证数据库是否创建 `pending` 记录。
    *   模拟 n8n 回调 `webhook` 接口，验证数据库记录是否更新为 `completed`。

## 注意事项
*   **回调地址**：本地开发环境无法直接接收 n8n 回调。代码中将配置 `NEXT_PUBLIC_APP_URL`，但在本地测试回调逻辑时，需通过 Postman 或类似工具手动触发 Webhook 接口。
*   **API Key**：文档强调 `api_key` 是必须的。如果当前开发环境未完全配置 Auth，可能需要手动在数据库 `profiles` 表中设置一个测试 key，或者在代码中暂时硬编码一个 fallback（仅供调试）。我们将优先尝试从 Auth 获取。
