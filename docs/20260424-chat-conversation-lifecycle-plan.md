# 聊天会话生命周期改造执行计划（2026-04-24）

## 目标
- 支持删除历史对话。
- 修正“新增对话”行为：仅点击新增但未发送消息时，不创建会话记录。
- 保持 Chat 页面与 Dashboard 页面行为一致。

## 范围
- 前端：
  - `app/(main)/chat/ChatPageContent.tsx`
  - `app/(main)/dashboard/components/HomeContent.tsx`
- 后端：
  - 新增 `app/api/assistants/conversations/[id]/route.ts`（DELETE）

## 备选方案对比
1. 方案 A：前端懒创建（推荐）
- 做法：点击“新对话”仅进入空白态，不调创建接口；首次发送消息时由 `/api/assistants/chat` 自动创建会话。
- 优点：改动小、与现有 chat API 兼容、无需数据库变更。
- 缺点：前端需处理“临时会话态”。

2. 方案 B：后端创建后自动清理空会话
- 做法：保持点击即创建，同时加定时任务清理 0 消息会话。
- 优点：前端改动小。
- 缺点：会短暂产生脏数据，且增加清理逻辑复杂度。

结论：采用方案 A。

## 兼容性结论
- Next.js：仅页面组件和 Route Handler 改动，兼容。
- Prisma：仅调用现有模型删除，不涉及 schema 变更。
- Supabase：沿用现有鉴权上下文，无新增依赖。
- n8n/第三方 API：无耦合变更。

## 风险与回滚策略
- 风险：删除当前激活会话后前端状态残留。
- 处理：删除成功后若删除的是当前会话，回到空白态并清空消息区。
- 回滚：回滚前端懒创建逻辑与 DELETE 路由文件即可恢复旧行为。

## 不确定点与 POC
- 不确定点：`/api/assistants/chat` 是否在 `conversationId` 为空时会自动创建会话。
- POC 结果：代码确认 `resolveConversationHistory` 中 conversation 不存在会执行 `assistantConversation.create`，并返回新的 `conversationId`。

## 分阶段里程碑
1. 新增删除 API：`DELETE /api/assistants/conversations/[id]`。
2. Chat 页面改为懒创建 + 历史删除入口。
3. Dashboard 页面同步懒创建 + 历史删除入口。
4. 执行 lint/typecheck 与 UI 验证。

## 验收标准
- 点击“新增对话”后不产生新历史记录，直到发送首条消息。
- 历史列表可删除任意会话。
- 删除当前会话后界面回到“新对话”空态。
- `npm run lint` 与 `npm run typecheck` 通过。

## Tech Debt
- 两个页面存在重复的会话列表与操作逻辑，可后续抽离共享 hooks/components，减少重复维护成本。
