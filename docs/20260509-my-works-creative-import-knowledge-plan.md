# 我的作品智能创作导入知识库计划

## 目标

在 Web 端「我的作品」详情弹窗中，为智能创作作品增加「导入知识库」能力。用户选择目标知识库后，将当前作品的推荐标题、备选标题、正文与标签整理为 Markdown 文件写入该知识库。

## 范围

- 修改 `app/(main)/my-works/MyProjectsClient.tsx`，在智能创作详情页增加导入入口、知识库选择弹窗、导入状态与错误提示。
- 复用现有 `GET /api/knowledge/folders` 获取知识库列表。
- 复用现有 `POST /api/knowledge/folders/[id]/files` 写入知识文件并自动切块。
- 不新增数据库表、字段、迁移。
- 不接入积分配置。本功能仅保存已有生成结果，不触发新的 AI、采集、n8n 或第三方模型调用。

## 方案对比

### 方案 A：前端直接复用现有知识库文件 API

- 优点：改动小，复用鉴权、文件 upsert、切块与 metadata 逻辑。
- 缺点：前端需要组装 Markdown 内容与文件路径。
- 结论：采用。

### 方案 B：新增专用导入 API

- 优点：导入格式与来源 metadata 可由服务端统一约束。
- 缺点：增加 API 面与测试成本，当前没有新的服务端权限或业务规则需求。
- 结论：暂不采用，后续若多个入口共用同类导入流程再抽象。

## 兼容性

- Next.js：仅新增客户端组件状态与 fetch 调用，兼容现有 App Router。
- Prisma/Supabase：复用现有知识库模型与 API，不涉及 schema 变更。
- n8n/第三方 API：不涉及。
- 多租户路由：导入调用使用站内 API，相对路径不依赖租户 slug。

## 风险与回滚

- 风险：用户没有知识库时无法导入。
  - 处理：选择弹窗展示空态提示，引导先创建知识库。
- 风险：重复点击造成重复导入或覆盖。
  - 处理：导入中禁用按钮；文件路径包含作品任务标识，同一作品重复导入会更新同一知识文件。
- 风险：正文为空时写入无效内容。
  - 处理：导入前校验推荐标题或正文至少有一项。
- 回滚：移除 `MyProjectsClient.tsx` 中导入相关状态、按钮与弹窗；计划文档可保留或删除并同步 README 索引。

## POC 结论

- 已确认 `GET /api/knowledge/folders?limit=100` 返回用户知识库列表。
- 已确认 `POST /api/knowledge/folders/[id]/files` 支持 `path`、`title`、`content`、`sourceType`、`contentFactory`，并自动创建/更新 `KnowledgeFile` 与 `KnowledgeChunk`。
- 已确认智能创作详情弹窗已有 `titleMain`、`titleAlts`、`bodyText`、`draftHashtags`、`scriptTitle` 可直接组装导入内容。

## 验收标准

- 智能创作作品详情底部显示「导入知识库」按钮。
- 点击后可加载并选择用户知识库。
- 确认导入后，推荐标题与正文被写入目标知识库文件。
- 导入成功、失败、空知识库、未登录或内容为空均有清晰反馈。
- `npm run lint` 与 `npm run typecheck` 通过。
- UI 改动完成 CDP 验证；若本地浏览器自动化不可用，记录失败原因并补充可行的页面验证结果。
