# 小程序数字人生成功能扩展计划（图片/视频双入口）

## 目标

在小程序「创建数字人」页增加顶部类型切换：
- 图片数字人
- 视频数字人

并将视频数字人创建请求接入新的视频对口型工作流发起链路。

## 范围

- 小程序前端（Taro）：`digital_human_miniapp/taro/src/pages/generate/index.tsx` + 样式
- 小程序 API 客户端：`digital_human_miniapp/taro/src/utils/api.ts`
- 服务端任务创建 API：`app/api/digital-human/videos/route.ts`
- 服务端数字人任务调度：`lib/digitalHumanJob.ts`

## 备选方案对比

### 方案 A（推荐）：单接口扩展 + sourceType 分流
- 做法：保留 `POST /api/digital-human/videos`，新增 `sourceType=IMAGE|VIDEO` 与 `videoUrl` 参数，服务端按 sourceType 分流 payload（`image_url` / `video_url`）与 webhook。
- 优点：改动集中、兼容旧调用、前后端最少重复。
- 风险：`digital_human_videos` 表无显式 sourceType 字段，历史记录层无法精确区分来源类型。

### 方案 B：新增独立接口（如 `/api/digital-human/video-lipsync`）
- 做法：视频数字人完全独立接口和逻辑。
- 优点：语义清晰。
- 风险：重复逻辑增加，维护成本高，短期交付慢。

## 兼容性结论

- Next.js API Route：兼容，属常规 JSON 参数扩展。
- Prisma/Supabase：本次不改 schema，兼容现有表结构。
- n8n：视频数字人使用新 webhook（固定 RH workflowId 的流程），图片数字人继续走原 webhook。
- 小程序端：仅新增 UI 切换与上传字段，不影响既有登录、上传、记录页。

## 风险与回滚

### 风险
- 视频模式上传或参数校验不完整导致任务创建失败。
- 旧图片数字人路径被误改，造成回归问题。

### 回滚
- 前端可快速回退到仅图片入口（隐藏类型切换）。
- 服务端可回退 `sourceType` 分流逻辑，默认使用旧图片链路。
- 不涉及数据库迁移，无数据层回滚负担。

## 分阶段里程碑

1. 前端入口改造
- 顶部增加「图片数字人/视频数字人」切换
- 根据类型动态展示图片形象选择或视频上传区

2. API 参数与调用扩展
- miniapp API 客户端支持 `sourceType` 与 `videoUrl`
- 提交逻辑按类型组装 payload

3. 服务端任务分流
- `POST /api/digital-human/videos` 增加 sourceType 参数处理
- `lib/digitalHumanJob.ts` 增加视频模式 webhook/payload 分流

4. 自测验证
- 图片数字人 VOICE_CLONE / LIP_SYNC 两路径不回归
- 视频数字人 VOICE_CLONE / LIP_SYNC 可成功创建任务

## 验收标准

- 生成页顶部可在「图片数字人 / 视频数字人」间切换。
- 图片数字人模式行为与原先一致。
- 视频数字人模式可上传视频并提交任务。
- 服务端正确将视频数字人任务转发到视频 webhook。
- 返回记录可正常展示状态与结果。

## Tech Debt

- `digital_human_videos` 当前缺少显式 `sourceType` 字段；后续建议补充，便于记录筛选、统计和 UI 展示精确区分。
