# 2026-05-13 AiToEarn 淘金广场与插件复刻开发方案

## 背景

用户希望参考 AiToEarn，复刻「淘金广场」完整功能和浏览器插件完整功能，并逐步开发到当前 Content Factory Web 项目中。当前项目已经具备部分基础：

- 小程序「变现广场」：`monetization_square_configs` JSON 配置、管理后台、`/api/miniapp/monetization-square`。
- 爆款数据中心：`viral_reference_items`、小红书链接采集、后台分类采集、插件导入接口。
- 浏览器扩展雏形：`workflows/nextide-extension-v0.1.2` 与 `public/extensions/*` 打包链路。
- Agent Runtime：`/api/agent/capabilities/*`、capability registry、积分预检与运行记录。

AiToEarn 的可借鉴点不是单一页面，而是「任务市场 + 本地浏览器执行器 + Agent action」三段式闭环。

## 目标

1. 将当前「变现广场」升级为「淘金广场」：既能展示赚钱路径，也能承载可接单任务。
2. 新增任务市场交易闭环：任务列表、详情、接单、素材领取、提交链接/截图、审核、奖励状态。
3. 新增浏览器插件能力层：本地登录态检测、平台采集、小红书/抖音发布、任务取证、与 Web/Agent 通信。
4. 打通 Agent：Agent 生成内容后输出结构化 action，由前端判断是否调用插件执行发布/采集/提交。
5. 所有付费/AI/采集/发布能力接入后台积分配置；纯导流入口不计费。

## 非目标

- 不照搬 AiToEarn 的服务端 Mongo/Nest/Electron 架构；本项目继续使用 Next.js App Router + Prisma + Supabase。
- 不将小红书私有接口作为唯一稳定主链路；插件链路作为用户授权后的增强能力。
- 首版不做真实现金钱包/提现清算，只保留奖励金额、审核状态与后续提现扩展位。
- 首版不做 Chrome Web Store 发布；先支持本地 zip 分发和手动加载。

## 对标结论

### AiToEarn 淘金广场核心模型

- `Task`：任务定义，含任务类型、描述、素材、奖励、截止时间、招募人数、平台要求。
- `UserTask`：用户接单记录，含账号、平台 UID、状态、提交链接、截图、审核备注、奖励。
- `TaskMaterial`：任务素材，按使用次数分发，避免所有用户拿到同一素材。
- 流程：任务列表 → 详情 → 选择平台账号接单 → 使用素材发布/互动 → 提交链接和截图 → 自动/人工审核 → 奖励。

### AiToEarn 插件/本地执行器核心模型

- Web 侧通过 `window.AIToEarnPlugin` 调插件。
- 能力包括 `checkPermission()`、`login(platform)`、`publish(params)`、`xhsRequest()`、`douyinRequest()`、互动和私信。
- Agent 不直接发小红书/抖音，而是输出 `navigateToPublish`；前端 ActionRegistry 再把小红书/抖音任务交给插件。

## 现有项目适配策略

### 方案 A：只扩展现有变现广场配置

优点：改动小，不新增复杂交易模型。
缺点：只能做「入口聚合」，无法支持接单、提交、审核、奖励，不等价于 AiToEarn 淘金广场。

### 方案 B：新增任务市场模型，复用现有变现广场作为入口（推荐）

优点：能完整承载任务闭环；现有小程序变现广场可以继续作为类目和运营入口。
缺点：需要新增 Prisma schema、后台审核页、用户任务页、插件协议，实施分阶段较多。

### 方案 C：单独建一套外部任务服务

优点：边界清晰，可独立扩容。
缺点：当前项目复杂度上升，鉴权、积分、素材、Agent 都要跨服务同步，首版不合适。

结论：采用方案 B。

## 信息架构

### Web 管理端

- `/admin/monetization-square`：继续维护广场展示配置，增加 task/action 类型。
- `/admin/earn/tasks`：任务管理，创建/编辑/上架/下架任务。
- `/admin/earn/submissions`：接单与提交审核，支持通过/拒绝/回退。
- `/admin/hot-square-data-center`：继续负责爆款数据与小红书搜索采集。

### Web 用户端

- `/earn`：淘金广场，展示类目、任务卡、推荐内容能力。
- `/earn/tasks/[id]`：任务详情，展示要求、素材、奖励、可用平台账号。
- `/earn/mine`：我的任务，按进行中/待审核/已通过/已拒绝/已取消筛选。
- `/earn/plugin`：插件安装、授权、诊断与日志。

### 小程序端

- 现有 `/subpages/monetization-square/index` 继续展示运营入口。
- 后续扩展「任务」Tab：读取同一任务 API，支持查看/接单/提交基础材料。
- 插件能力不进入小程序端；小程序只做任务查看和轻量提交。

### 浏览器插件

- 目录建议：`extensions/content-factory-plugin/`。
- 分发产物：`public/extensions/content-factory-assistant.zip`，复用 `npm run build:extensions` 思路。
- 注入对象：`window.ContentFactoryPlugin`。

## 数据模型

需要新增 Prisma 模型，迁移同时补 Supabase SQL：

### EarnTask

- `id`
- `title`
- `description`
- `type`: `product | video | article | promotion | interaction | collect | publish`
- `status`: `draft | active | paused | archived`
- `platforms`: JSON 字符串数组，如 `["xhs","douyin"]`
- `coverUrl`
- `rewardAmount`: Decimal 或 Int 分
- `maxParticipants`
- `currentParticipants`
- `deadlineAt`
- `keepSeconds`
- `requiresPlugin`
- `requiresShoppingCart`
- `requirements`: JSON
- `actionConfig`: JSON，保存插件/Agent/路由动作
- `createdBy`
- `createdAt`
- `updatedAt`

### EarnTaskMaterial

- `id`
- `taskId`
- `title`
- `description`
- `type`: `image | video | article | mixed | link`
- `payload`: JSON，保存标题、正文、图片、视频、话题等
- `usedCount`
- `enabled`
- `createdAt`
- `updatedAt`

### EarnUserTask

- `id`
- `taskId`
- `userId`
- `platform`
- `platformUid`
- `platformAccountName`
- `taskMaterialId`
- `status`: `doing | pending | approved | rejected | cancelled | expired | rewarded`
- `submissionUrl`
- `screenshotUrls`: JSON
- `pluginEvidence`: JSON，保存插件采集到的 workId、shareLink、互动计数、截图等
- `qrCodeScanResult`
- `submissionTime`
- `reviewedBy`
- `reviewedAt`
- `reviewNote`
- `rewardAmount`
- `rewardedAt`
- `metadata`
- `createdAt`
- `updatedAt`

### EarnPluginAccount

- `id`
- `userId`
- `platform`
- `platformUid`
- `nickname`
- `avatarUrl`
- `status`: `usable | expired | revoked`
- `lastSeenAt`
- `metadata`
- `createdAt`
- `updatedAt`
- 唯一约束：`userId + platform + platformUid`

### EarnPluginEvent

- `id`
- `userId`
- `eventType`
- `platform`
- `requestId`
- `payload`
- `createdAt`

用于插件调试、发布进度、任务取证审计。日志需脱敏，不落 Cookie。

## API 设计

### 用户端任务 API

- `GET /api/earn/tasks`：任务列表，支持 `type/platform/status/query/page/pageSize`。
- `GET /api/earn/tasks/[id]`：任务详情。
- `POST /api/earn/tasks/[id]/apply`：接单；校验人数、账号、是否重复接单。
- `GET /api/earn/mine`：我的任务列表。
- `GET /api/earn/mine/[id]`：我的任务详情。
- `POST /api/earn/mine/[id]/submit`：提交任务；状态进入 `pending`。
- `POST /api/earn/mine/[id]/cancel`：取消进行中的任务。

### 管理端 API

- `GET/POST /api/admin/earn/tasks`
- `GET/PATCH/DELETE /api/admin/earn/tasks/[id]`
- `POST /api/admin/earn/tasks/[id]/materials`
- `GET /api/admin/earn/submissions`
- `POST /api/admin/earn/submissions/[id]/approve`
- `POST /api/admin/earn/submissions/[id]/reject`

### 插件 API

- `GET /api/plugin/bootstrap`：返回用户、插件配置、可用平台、当前 Web 版本。
- `POST /api/plugin/accounts/sync`：同步插件本地平台账号到 `EarnPluginAccount`。
- `POST /api/plugin/evidence`：上传发布/互动/采集证据。
- `POST /api/plugin/viral-references/import`：可复用现有 `/api/viral-references/import`，保留 API Key 鉴权。
- `POST /api/plugin/tasks/[id]/submit-evidence`：插件自动提交任务证据。

### Agent Action API

- `POST /api/assistants/agent-actions/execute` 继续作为 Web action 执行入口。
- 新增 action 类型：
  - `plugin.publish`
  - `plugin.collectXhs`
  - `earn.applyTask`
  - `earn.submitTaskEvidence`
  - `earn.openTask`

## 插件能力协议

Web 注入对象：

```ts
interface ContentFactoryPluginAPI {
  version: string;
  checkPermission(): Promise<{ granted: boolean; permissions: string[] }>;
  getStatus(): Promise<{ installed: boolean; ready: boolean }>;
  login(platform: 'xhs' | 'douyin'): Promise<PluginAccount>;
  getAccounts(): Promise<Record<string, PluginAccount | null>>;
  publish(params: PluginPublishParams, onProgress?: (event: PluginProgress) => void): Promise<PluginPublishResult>;
  collectCurrentPage(params?: PluginCollectParams): Promise<PluginCollectResult>;
  xhsRequest<T = unknown>(params: PluginRequestParams): Promise<T>;
  douyinRequest<T = unknown>(params: PluginRequestParams): Promise<T>;
  captureEvidence(params: PluginEvidenceParams): Promise<PluginEvidenceResult>;
}
```

首版支持：

- 插件安装检测与版本检测。
- Options 页配置 API Base URL 与 API Key。
- 小红书当前页采集，写入现有爆款库。
- 小红书登录态检测与账号同步。
- 小红书发布辅助：优先半自动填充/跳转确认；私有接口发布作为实验开关。
- 任务证据采集：抓取当前 URL、标题、截图、workId/shareLink。

第二阶段支持：

- 抖音采集/发布辅助。
- 小红书搜索结果批量采集。
- Agent 生成内容后一键通过插件发布。
- 插件内任务面板：当前任务、素材、提交状态。

## 小红书数据与合规边界

AiToEarn 使用的是小红书 Web/创作者中心私有接口、登录 Cookie、签名参数。当前项目应采用分层策略：

1. 稳定采集：继续使用已配置的服务端 downloader/API，用于链接详情和后台搜索采集。
2. 插件采集：只在用户本地登录态下采集当前页面或用户明确选择的内容。
3. 私有接口发布：放在实验开关后，默认优先半自动发布，避免把逆向签名作为核心依赖。

插件不得上传用户 Cookie、`a1`、`web_session`、`access-token` 等敏感凭据。服务端只保存账号摘要、任务证据和用户明确提交的数据。

## Agent 集成

当前项目已有 Agent capability，可新增以下能力：

- `earn.task.list`
- `earn.task.apply`
- `earn.task.submit_evidence`
- `plugin.xhs.collect`
- `plugin.xhs.publish`
- `plugin.account.sync`

Agent 输出必须是结构化 action，而不是直接调用浏览器私有能力：

```json
{
  "type": "earnAction",
  "action": "plugin.publish",
  "platform": "xhs",
  "taskId": "task_xxx",
  "title": "标题",
  "description": "正文",
  "tags": ["话题"],
  "medias": []
}
```

前端 ActionRegistry 负责：

- 检测插件是否安装。
- 检查平台账号是否登录。
- 让用户确认发布/提交。
- 调用插件并显示进度。
- 将插件返回的证据写回服务端。

## 积分配置

按项目规则，所有新增付费、AI、采集、发布能力必须接入后台积分配置。

首批 featureKey：

- `earn_task_apply`：接单动作，默认 0，可配置。
- `earn_task_submit_evidence`：提交证据，默认 0。
- `plugin_xhs_collect`：插件小红书采集，默认 0 或低价。
- `plugin_xhs_publish`：插件小红书发布辅助，默认 0；若接入 AI 优化或私有发布则配置价格。
- `plugin_douyin_collect`
- `plugin_douyin_publish`
- `earn_agent_task_match`：Agent 帮用户匹配任务。
- `earn_agent_content_generate`：Agent 根据任务生成发布内容，可复用现有智能创作或独立配置。

纯导流的 `monetization_*` 入口继续不进入扣费链路，也不进入后台首页功能统计。

## 分阶段里程碑

### M0：方案与边界确认

- 完成本计划。
- 确认首版支持平台：建议只做小红书。
- 确认首版发布方式：建议半自动发布 + 证据采集。

验收：计划文档可评审，风险和回滚明确。

### M1：任务市场数据层与 API

- 新增 Prisma schema 与 Supabase 迁移。
- 实现用户端任务列表/详情/接单/我的任务/提交。
- 实现后台任务与提交审核 API。
- 接入 `earn_*` 积分配置，默认 0。

验收：

- `npx prisma migrate status`
- 最小读写回归：创建任务、接单、提交、审核。
- `npm run lint`
- `npm run typecheck`
- 涉及 schema 与 API，需 `npm run build`。

### M2：Web 淘金广场 UI

- 新增 `/earn`、`/earn/tasks/[id]`、`/earn/mine`。
- 复用现有 dashboard/后台 UI 风格，做任务卡、筛选、详情、状态流。
- 管理后台新增任务管理与审核页。
- 现有 `/admin/monetization-square` 增加 `task` action 类型，可跳转任务。

验收：

- `npm run lint`
- `npm run typecheck`
- `PORT=3001 npm run dev`
- CDP 验证桌面与移动端：列表、详情、接单、提交、后台审核。

### M3：插件 MVP

- 新建扩展目录与 Manifest V3。
- 实现 background、content script、options、side panel/popup。
- 实现 API Key 配置、插件检测、账号同步、当前页采集、证据截图。
- 打包到 `public/extensions/content-factory-assistant.zip`。

验收：

- 插件本地加载成功。
- Options 能保存 API Base URL/API Key。
- 当前小红书页面采集能写入 `viral_reference_items`。
- Web 页面能检测 `window.ContentFactoryPlugin`。
- Console 无报错。

### M4：插件发布/任务证据闭环

- Web 任务详情中增加「用插件执行」。
- 插件返回 `shareLink/workId/screenshotUrls/evidence`。
- `EarnUserTask` 自动提交进入 `pending`。
- 后台审核可看到证据。

验收：

- 从接单到插件采证再提交完成一条任务。
- 失败场景可重试，不重复提交。
- 插件事件日志不含 Cookie。

### M5：Agent Action 打通

- 新增 Agent action schema 与前端 ActionRegistry。
- Agent 可基于任务生成小红书标题/正文/标签。
- 用户确认后调用插件发布或保存为任务草稿。

验收：

- Agent 输出 action 卡。
- 插件未安装时显示安装引导。
- 插件安装后可执行并回写任务证据。

### M6：小程序补齐

- 小程序变现广场增加任务入口/Tab。
- 支持任务详情、接单、提交链接/截图。
- 不做插件能力，只展示 Web/插件引导。

验收：

- weapp-dev-mcp 验证页面、截图、日志、关键交互。
- `npm run lint`
- `npm run typecheck`

## 风险与回滚

- 平台私有接口不稳定：默认半自动发布，私有接口能力挂实验开关。
- 插件权限过大引发信任问题：权限按平台域名拆分，用户点击时才请求 optional permissions。
- 用户 Cookie 泄露风险：插件禁止上传 Cookie，服务端只收账号摘要和任务证据。
- 审核误判：首版以人工审核为主，自动审核只给建议。
- 重复接单/重复提交：数据库唯一约束和幂等 requestId。
- 当前 worktree 改动多：每个阶段开工前必须 `git status`，只碰本阶段文件。

回滚策略：

- UI 入口通过 feature flag 隐藏。
- 插件下载入口可回退到现有 `nextide-assistant.zip`。
- API 保持新增路由，不影响现有变现广场和爆款广场。
- 任务表新增迁移不删除现有数据；需要下线时将任务状态置为 `paused/archived`。

## 验收总清单

- 淘金广场可展示任务与运营入口。
- 用户可接单、领取素材、提交链接/截图。
- 管理员可创建任务、上架、审核提交。
- 插件可安装、配置、检测、同步账号、采集当前页、提交证据。
- Agent 可输出插件 action，前端可执行或引导安装。
- 积分配置存在且扣费日志可审计。
- Web UI 完成 CDP 桌面 + 移动端验证。
- 小程序改动完成 weapp-dev-mcp 验证。
- 数据库改动完成 migrate status 与最小读写回归。

## Tech Debt

- 奖励提现首版不接真实钱包，后续需设计结算账户、提现单、财务审核。
- 插件发布私有接口能力需要单独风险评审，不能默认开启。
- 任务自动审核后续可接入平台数据回查、截图 OCR、链接可访问性检测。
- 任务素材分配首版按 `usedCount` 最少优先，后续可增加随机、AB 组和防重复策略。
- 插件版本升级需要补自动更新策略；本地 zip 分发只适合早期内测。
