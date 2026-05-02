# 2026-05-02 小程序爆款广场新增小红书链接采集入口计划

## 目标
- 在小程序「爆款广场」页面右下角增加浮动 `+` 按钮。
- 用户点击后可粘贴小红书链接并发起采集。
- 服务端调用独立部署的 `xhs-downloader` 服务解析内容。
- 采集结果写入小程序「我的分类」所依赖的数据源（`image_text_replication_tasks`，`source_platform=miniapp-my`）。
- 采集成功后前端自动切换到「我的」分类并展示新笔记。

## 范围
- 小程序前端（Taro）：
  - `digital_human_miniapp/taro/src/pages/hot-square/index.tsx`
  - `digital_human_miniapp/taro/src/pages/hot-square/index.sass`
  - `digital_human_miniapp/taro/src/utils/miniapp-api.ts`
- 后端 API（Next.js App Router）：
  - `app/api/miniapp/hot-square/collect-xhs/route.ts`（新增）
- 环境变量示例：
  - `.env.example`
  - `.env.production.example`
- 文档索引：
  - `docs/README.md`

## 方案对比
1. 方案 A：前端直接调 `xhs-downloader`
- 优点：链路短。
- 风险：暴露内部服务地址；鉴权和风控难统一；无法复用现有用户上下文与“我的分类”落库逻辑。

2. 方案 B：前端调用本项目后端接口（推荐）
- 优点：统一鉴权（API Key / User）；可控超时与错误处理；可直接落库到现有“我的”数据模型；便于后续限流与审计。
- 风险：后端新增一层转换逻辑，需要维护字段映射。

## 兼容性结论
- Next.js：兼容，新增 API Route 不影响现有路由。
- Prisma/Supabase：不新增表结构，复用既有 `image_text_replication_tasks`，无需迁移。
- Taro 小程序：兼容，新增页面内弹层与按钮，不改导航结构。
- `xhs-downloader`：通过 HTTP API（`/xhs/detail`）对接，符合当前独立服务部署形态。

## 风险与回滚
- 风险：
  - 目标平台反爬导致单次采集失败。
  - 部分链接仅返回视频资源，不一定有可用图片列表。
  - 采集服务不可达或超时。
- 回滚策略：
  - 前端可快速隐藏浮动入口（feature flag / UI 开关）。
  - 后端接口为新增路由，回滚时可直接下线路由，不影响原有爆款列表与“我的分类”。

## 分阶段里程碑
1. M1：后端采集接口
- 新增 `/api/miniapp/hot-square/collect-xhs`。
- 完成鉴权、链接校验、调用 `xhs-downloader`、结果标准化、落库与异步解析触发。

2. M2：小程序入口与交互
- 增加右下角浮动 `+`。
- 增加粘贴弹层、剪贴板读取、提交与错误提示。
- 成功后自动切换到“我的”并刷新列表。

3. M3：联调与验收
- 完成 lint/typecheck/build。
- 完成最小链路手测：粘贴链接 -> 采集 -> 我的分类可见。

## 验收标准
- 在爆款广场可看到浮动 `+` 按钮。
- 点击后可粘贴小红书链接并发起采集。
- 调用成功后返回 taskId，并在「我的」分类出现该笔记。
- 接口异常时有明确错误提示，不影响页面其他功能。

## Tech Debt
- 当前仅支持单链接采集，后续可扩展为批量链接队列。
- 视频类笔记目前主要依赖平台返回的下载地址，后续可补充封面兜底策略。
- 后续可增加用户级限流和采集审计日志。
