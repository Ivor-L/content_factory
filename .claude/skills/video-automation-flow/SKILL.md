---
name: video-automation-flow
description: 当用户要求编写视频生成逻辑、克隆对标视频脚本结构、或调整 Sora/Veo/Grok/数字人相关 API 参数时触发
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# 视频自动化工作流技能包

## 项目视频生成架构概览

本项目有两条视频生成链路：

**链路 A：数字人视频（同步/短时任务）**
- API：`app/api/digital-human/`
- 业务逻辑：`lib/digitalHumanJob.ts`、`lib/digitalHumanLimits.ts`
- 任务队列：`lib/knowledgeVideoQueue.ts`

**链路 B：AI 视频生成（Veo / Sora / Grok，异步长时任务）**
- API：`app/api/ai/videos/`
- 提交生成任务 → 注册轮询服务 → Webhook 回调 → 更新数据库 → 通知前端

---

## 标准执行步骤

### 新增视频生成模型

1. 在云雾 API 文档（`docs/云雾API 接口对接3.17 .apifox.json`）中确认模型 ID 和端点
2. 在对应的 API 路由中添加模型映射（参考 `app/api/canvas/images/generations/route.ts` 的 MODEL_PATHS 模式）
3. 在 `lib/canvasCredits.ts` 的 aliases 数组中注册模型别名
4. 在 `app/(main)/canvas/hooks/useCanvasModels.ts` 中添加前端展示配置

### 实现异步视频任务（Veo/Sora/Grok）

1. **提交任务**：POST 到云雾 API 视频生成端点，获取 `task_id`
2. **注册轮询**：POST `https://api.atomx.top/tools/veo/poll/async`
   ```json
   {
     "task_id": "<来自步骤1>",
     "api_key": "<云雾API Key，从环境变量读取>",
     "webhook_url": "<本项目的 Webhook 回调 URL>",
     "context": { "user_id": "...", "record_id": "..." }
   }
   ```
3. **处理回调**：Webhook 端点接收 `{ status, task_id, video_url, context }`
   - `status: "success"` → 更新 Prisma 记录，写入 `video_url`，触发 Supabase 通知
   - `status: "error"` → 标记任务失败，记录 `message`，通知用户

### 调整数字人参数

1. 阅读 `lib/digitalHumanJob.ts` 了解当前参数结构
2. 确认云雾 API 文档中数字人端点的最新参数（`docs/` 目录）
3. 修改参数前检查 `lib/digitalHumanLimits.ts` 中的限制配置

---

## 踩坑记录

> 持续更新，遇到新坑在此补充

- **`gemini-3-pro-preview` 已下线**：2026-03-26 官方下线，现统一使用 `gemini-3.1-pro-preview`。别名映射在 `lib/canvasCredits.ts`，路由映射在 `app/api/canvas/images/generations/route.ts`。
- **轮询服务最长 60 分钟**：超时后不再回调，需在提交时设定合理的任务超时处理逻辑，避免用户界面永久 Loading。
- **Webhook 回调需幂等**：同一 `task_id` 可能重复回调，处理时检查 Prisma 记录状态，避免重复写入。
- **n8n 工作流触发**：必须通过 `lib/n8n.ts` 封装，不要在路由层直接 fetch n8n Webhook URL（URL 包含敏感 token）。

---

## 参考文件

- 云雾 API 文档：`docs/云雾API 接口对接3.17 .apifox.json`
- n8n 工作流配置：`workflows/` 目录
- 数字人工作流示例：`workflows/Content Factory Digital Human Gen.json`
