# 小程序爆款视频采集与复刻链路计划

## 目标
- 小程序采集到视频笔记后，在爆款详情/我的笔记详情里展示视频来源。
- 提供视频文案提取、下载视频、一键复刻入口。
- 一键复刻可选择复刻类型，并自动把采集视频带入复刻页的参考视频。

## 范围
- 后端采集接口：识别视频 URL，区分图片和视频，保存视频元数据。
- 后端文案提取：复用现有视频文案提取 webhook，并支持把结果写回我的笔记。
- 小程序 API：透出 videoUrl/sourceType，新增提取文案请求。
- 小程序爆款详情：视频态按钮、下载视频、复刻类型抽屉。
- 小程序复刻页：支持 URL 参数预填参考视频和复刻类型。

## 备选方案
- 方案 A：复用 ImageTextReplicationTask.generatedImages 存视频元数据，不改 schema。
  - 优点：不需要迁移，风险小，适合快速修复当前小程序链路。
  - 缺点：字段语义不够干净，后续应迁移到专门 metadata 字段。
- 方案 B：新增 my_notes metadata/videoUrl 字段或独立采集表。
  - 优点：长期模型清晰。
  - 缺点：涉及 Prisma/Supabase 迁移和回填，当前改动范围更大。

## 选型
- 本次采用方案 A，不改数据库 schema；视频 URL、作者、互动数据统一存入已有 raw metadata。

## 兼容性
- Next.js API：沿用现有 Route Handler。
- Prisma：不改 schema，仅更新现有 JSON 字段和 sourceText。
- Supabase：无迁移。
- n8n：复用 `/api/replication/copy/extract` 已接入的 `N8N_EXTRACT_VIDEO_TEXT_WEBHOOK`。
- 小程序 Taro：使用 `Taro.downloadFile` + `Taro.saveVideoToPhotosAlbum` 下载保存视频。

## 风险与回滚
- 风险：下载器返回字段名不同，视频 URL 可能仍识别不到。
  - 应对：增加多层字段和常见视频字段别名。
- 风险：异步文案提取只返回 pending，用户需要稍后刷新。
  - 应对：接口若同步返回则立即更新；若 pending 则提示后台提取中。
- 回滚：撤回本计划涉及的 API 和小程序页面改动即可，不涉及迁移回滚。

## 验收标准
- 视频笔记采集后，我的列表/详情能识别 `videoUrl`。
- 视频详情显示提取文案、下载视频、一键复刻。
- 点击提取文案后能触发后端提取，并在同步返回时更新正文。
- 点击一键复刻选择类型后进入复刻页，参考视频自动填入。
- `npm run lint`、`npm run typecheck`、`cd digital_human_miniapp/taro && npm run build:weapp` 通过。

## Tech Debt
- `ImageTextReplicationTask.generatedImages` 当前兼作 raw metadata 容器，后续建议新增正式 metadata 字段并回填历史数据。
