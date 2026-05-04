# 2026-05-04 小程序一键复刻三阶段详情页计划

## 目标
- 将小程序首页进入的爆款复刻页中「15s内短视频」和「15s+长视频」合并为「一键复刻」。
- 参考视频上传中展示动画，上传完成展示缩略图；竖构图视频/缩略图完整展示，两侧留空。
- 角色支持「不使用角色」，产品/角色添加入口放在各自选择区右上角。
- 点击立即生成后立即在作品列表生成卡片，并进入可承载三阶段的爆款复刻详情页。

## 范围
- 小程序：`remix-generate` 页面上传、选择角色/产品、策略文案和提交元数据。
- 小程序：`storyboard-board` 页面按爆款复刻任务展示「爆款拆解 / 产品角色替换 / 视频生成」阶段。
- 后端：Storyboard 任务状态接口透出 `detailedBreakdown`；任务摘要标题与元数据识别一键复刻任务。

## 备选方案
- 方案 A：复用 `storyboard_tasks/storyboard_segments` 和现有 `viral_clone` 工作流。
  - 优点：不改 schema，作品列表和现有分镜编辑、生图、生视频能力可复用。
  - 缺点：三阶段状态需要由小程序根据任务/分镜状态推导，长期可再抽象专门详情模型。
- 方案 B：新增爆款复刻详情表和独立详情页 API。
  - 优点：阶段状态表达更清晰。
  - 缺点：需要 Prisma/Supabase 迁移、回调改造与历史兼容，当前范围过大。

## 选型
- 本次采用方案 A；不改数据库 schema。三阶段通过 `metadata.feature = viral_remix` 标记，并由详情页基于 segments、generatedImage、generatedVideo、finalVideoUrl 推导。

## 兼容性
- Next.js：沿用现有 Route Handler `/api/storyboard/jobs` 与 `/api/storyboard/[id]/status`。
- Prisma/Supabase：不新增字段，不需要迁移。
- n8n：复用 `viral_clone` 对应分镜拆解工作流；后续产品/角色替换和视频生成继续走现有分镜生图、生视频接口。
- Seedance 2.0：作为一键生成策略文案和任务元数据模型标记；详情页视频生成阶段可切换模型。

## 风险与回滚
- 风险：n8n 回调没有返回分镜图时，第二阶段只能显示待处理。
  - 应对：详情页保留一键生图、编辑、重新生成能力。
- 风险：作品列表标题依赖 `detailedBreakdown.metadata.title`，历史任务没有该字段。
  - 应对：无该字段时继续显示默认「分镜视频」。
- 回滚：还原本计划涉及的小程序页面和两个 API/摘要文件即可，不涉及迁移回滚。

## 验收标准
- 复刻页标题为「一键复刻」，不再出现「15s内短视频 / 15s+长视频」切换。
- 上传参考视频时有上传动画，上传完成展示缩略图/预览，竖构图完整显示。
- 角色第一个卡片为「不使用角色」，产品第一个卡片为「不使用产品」，添加按钮在各自标题右上角。
- 策略文案为「基于 seedance2.0 生成，效果好，但价格较高」和「基于 veo3.0 生成，操控性好，性价比高」。
- 点击立即生成后作品列表出现一键复刻卡片，并进入三阶段详情页。
- `npm run lint`、`npm run typecheck`、`cd digital_human_miniapp/taro && npm run build:weapp` 通过；UI 改动使用 weapp-dev-mcp 验证。

## Tech Debt
- 爆款复刻三阶段目前复用通用分镜详情页。后续若需要更强的阶段编排、计费与批量状态，可新增专门的 remix workflow detail API。
