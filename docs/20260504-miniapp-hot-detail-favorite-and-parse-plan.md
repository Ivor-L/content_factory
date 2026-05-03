# 2026-05-04 小程序爆款详情收藏与解析态修复计划

## 目标
- 统一「我的」分类语义：Web 端采集、小程序采集、用户在爆款详情页点击解析图文的笔记都进入「我的」。
- 「我的」里的笔记默认视为已收藏，详情页底部提供低强调的已收藏/取消收藏能力。
- 公共爆款详情页的一键同款创作在未解析前改为「解析图文」，点击后在原详情卡片内展示解析中状态，不新建列表卡片视图。
- 解析完成后按钮切换为「一键仿写」，复用现有仿写与作品生成链路。
- 详情页视觉调整：顶部导航贴近主页面高度，正文扁平展示，避免卡片底；清理「图 1/图 2」标签对正文/排版数据的污染。
- 补齐博主头像、名字、点赞、收藏、分享数据展示。

## 范围
- 服务端 API：
  - `app/api/image-text-replication/my-notes/route.ts`
  - `app/api/image-text-replication/[id]/route.ts`
  - 如有必要新增/扩展删除接口。
- 小程序前端：
  - `digital_human_miniapp/taro/src/utils/miniapp-api.ts`
  - `digital_human_miniapp/taro/src/pages/hot-square/index.tsx`
  - `digital_human_miniapp/taro/src/subpages/hot-detail/index.tsx`
  - `digital_human_miniapp/taro/src/subpages/hot-detail/index.sass`
- 文档索引：
  - `docs/README.md`

## 方案对比
1. 方案 A：新增收藏表，显式维护收藏关系。
- 优点：收藏/取消收藏语义最清晰，能区分用户自采集与公共收藏关系。
- 缺点：需要新增 schema 和迁移，影响面大；当前需求可通过现有任务表承载。

2. 方案 B：复用 `image_text_replication_tasks` 作为「我的」事实表（推荐）。
- 优点：无 schema 变更；Web/小程序采集与解析图文都已有任务记录；pending/completed 状态天然可持久化。
- 缺点：公共爆款取消收藏需要删除对应用户任务；若未来需要保留收藏历史，需要再拆表。

## 兼容性结论
- Next.js App Router：兼容，复用现有 route 和鉴权。
- Prisma/Supabase：不新增迁移；删除用户自己的 `image_text_replication_tasks` 不影响共享 `viral_reference_items`。
- Taro 小程序：兼容，详情页内状态驱动渲染，不改页面路由结构。

## 风险与回滚
- 风险：历史任务 `sourceId` 可能带 `ref-` 前缀或公共 ID，导致去重/匹配不完全。
  - 处理：服务端创建任务时保留传入 ID；前端合并时按 `sourceUrl + title` 兜底去重。
- 风险：删除用户任务会移除该条在「我的」里的解析结果。
  - 处理：只删除当前用户自己的任务；公共爆款源不删除，仍可在正常分类看到。
- 回滚：恢复 `my-notes` 列表过滤和详情页旧按钮即可；无数据库迁移需要回滚。

## 分阶段里程碑
1. M1：恢复「我的」列表包含 pending，并补齐删除接口。
2. M2：小程序 API 映射收藏态、解析态、博主与互动数据。
3. M3：详情页交互改造：解析图文、解析中、一键仿写、取消收藏。
4. M4：详情页 UI 扁平化与顶部导航上移。
5. M5：lint/typecheck/Taro weapp build 验证。

## 验收标准
- Web 与小程序采集的笔记均出现在「我的」。
- 「我的」详情底部默认显示低强调已收藏状态，并可取消收藏后从「我的」移除。
- 公共爆款点击「解析图文」后不跳新卡片，在原详情页显示解析中并轮询。
- 解析完成后按钮变为「一键仿写」。
- 仿写 payload 中不包含「图 1/图 2」标签污染正文。
- 详情页顶部导航不遮挡图片，正文无卡片底。
- 展示博主头像/名字，以及点赞、收藏、分享数据。

## Tech Debt
- 取消收藏目前等价于删除个人解析任务；未来如需保留历史解析结果，可新增收藏关系表。
- 分享/评论字段依赖上游采集字段质量，当前做多路径兜底。
