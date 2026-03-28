---
description: 后端 API 路由、业务逻辑层与数据库操作规范
paths: "app/api/**,lib/**,workers/**,prisma/**"
---

# 后端业务规范

## API 路由规范
- 每个路由文件导出 `GET` / `POST` 等具名函数，不使用默认导出
- 所有入参必须用 `zod` 做 Schema 校验，不信任任何 `request.json()` 原始值
- 错误响应统一格式：`{ error: string, code?: string }`
- 成功响应统一格式：`{ data: T }` 或直接返回资源对象

## 云雾 API 调用规范
- Base URL 从环境变量读取，禁止硬编码
- LLM 调用通过 `lib/cloudLLM.ts` 封装
- 图片生成通过 `lib/cloudImage.ts` 封装
- 禁止在路由层直接调用 `fetch('https://yunwu...')`

## 视频异步任务规范
- 提交 Veo/Sora/Grok 视频任务后，必须调用轮询注册接口：
  `POST https://api.atomx.top/tools/veo/poll/async`
  Body: `{ task_id, api_key, webhook_url, context }`
- **webhook_url 必须用 `CANVAS_VIDEO_POLL_CALLBACK_BASE_URL` 环境变量构建**，不能用 `request.nextUrl.origin`（容器内返回内网地址，轮询服务无法回调）
  ```ts
  const callbackBase = (process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL || "").replace(/\/+$/, "") || request.nextUrl.origin;
  const webhookUrl = `${callbackBase}/api/canvas/videos/webhook`;
  ```
- Webhook 回调处理逻辑须区分 `status: "success"` 和 `status: "error"`
- 回调成功后需更新 Prisma 数据库记录并通知前端（通过 Supabase Realtime）

## 云雾 API 错误处理规范
- 云雾 API 失败响应格式为 `{ success: false, msg: "...", code: 500 }`，不是标准 HTTP 4xx
- `postJson` / `getJson` 等请求封装必须检测 `success === false`、`ok === false`、`code >= 400`，将 `msg` 字段透传给用户
- 禁止只检测 `response.ok`，云雾失败时 HTTP 状态码可能仍为 200

## 线上环境变量规范（新增功能必须核查）
每次新增涉及外部回调的功能，必须确认以下变量在线上 `.env` 中已配置：
- `CANVAS_VIDEO_POLL_CALLBACK_BASE_URL=https://atomx.top`（视频轮询回调地址）
- `N8N_CALLBACK_BASE_URL=https://atomx.top`（n8n 回调地址）
- `CANVAS_UPSTREAM_DEFAULT_API_KEY`（画布系统级 API Key）
完整变量清单见 `DEPLOY_GUIDE.md` 第 1 节。

## n8n 工作流规范
- 通过 `lib/n8n.ts` 触发工作流，禁止在路由中裸写 n8n Webhook URL
- 工作流 JSON 存放于 `workflows/`，变更需手动在 n8n 控制台导入
- `workflows/exports/` 仅作备份用，不直接引用

## 数据库规范
- ORM 统一使用 Prisma Client，禁止拼接裸 SQL
- 迁移文件在 `prisma/migrations/`，执行前必须告知用户
- 禁止在 API 路由中使用 `prisma.$executeRaw`，除非有充分理由并注释说明
