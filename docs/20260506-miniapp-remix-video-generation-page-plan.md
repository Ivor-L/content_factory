# 小程序智能复刻视频生成页拆分计划

## 目标

- 智能复刻拆解完成后，继续复用现有分镜网格图编辑体验。
- 用户在编辑页选中/生成新的图片并返回后，将该图片同步为智能复刻当前分镜网格图。
- 智能复刻详情页底部按钮收敛为：删除、替换产品/角色、生成视频。
- 新增独立的智能复刻视频生成页，导入每段视频提示词和当前分镜网格图，支持批量生成、单条生成和编辑提示词。

## 范围

- 小程序 `storyboard-board`：智能复刻底部动作、编辑返回后同步网格图、跳转视频生成页。
- 小程序新增 `remix-video-generate` 页面：展示提示词列表、网格图、单条/批量生成视频。
- 小程序 API 工具：新增更新复刻网格图的调用。
- Next.js API：扩展 storyboard task PATCH，允许更新 `storyboardImageUrl`/`coverImage`。
- 文档索引：更新 `docs/README.md`。

## 最小调研结论

### 方案对比

1. 继续直接复用 `storyboard-board` 的分镜视频操作栏
   - 优点：改动最少。
   - 风险：用户会继续看到“一键生图 / 一键生成视频 / 一键剪辑”等普通分镜板心智。
   - 结论：不采用。

2. 保留现有网格图编辑页，新增复刻专用视频生成页
   - 优点：不打断已有图片编辑能力，同时把视频生成心智从分镜板中拆开。
   - 风险：仍暂时复用 `storyboard_segments` 存储提示词和视频结果，需要前端命名隔离。
   - 结论：采用。

### 兼容性

- Next.js：扩展现有 `/api/storyboard/[id]` PATCH，不新增数据库字段。
- Prisma/Supabase：继续使用 `storyboard_tasks.storyboard_image_url`、`cover_image` 与 `storyboard_segments`，不需要迁移。
- n8n：视频生成仍复用 `/api/storyboard/[id]/generate-videos`，保持现有 webhook 契约。
- 小程序 Taro：新增 subpackage 页面，复用当前请求工具和上传/预览交互模式。

### 风险与回滚

- 风险：编辑页生成图未完成时用户返回，无法同步新网格图。
  - 应对：仅在当前编辑素材已有图片 URL 时同步；生成中保持原网格图。
- 风险：智能复刻仍使用 `storyboard_segments` 存储视频提示词，命名容易回流到分镜板。
  - 应对：新页面文案统一使用“片段/视频提示词/分镜网格图”，不暴露普通分镜板操作栏。
- 回滚：移除新增页面和路由，恢复 `storyboard-board` 复刻底栏即可，不涉及迁移回滚。

## 分阶段里程碑

1. 新增计划文档并更新文档索引。
2. 扩展 task PATCH 和小程序 API，支持同步复刻网格图。
3. 调整 `storyboard-board` 智能复刻底栏与编辑返回同步逻辑。
4. 新增 `remix-video-generate` 页面与路由。
5. 执行 lint/typecheck/小程序构建，并使用 weapp-dev-mcp 验证关键页面。

## 验收标准

- 智能复刻详情页底部只出现删除、替换产品/角色、生成视频。
- 点击替换产品/角色进入现有图片编辑体验。
- 编辑页返回后，当前选中的图片成为智能复刻详情页展示的分镜网格图。
- 点击生成视频进入新页面，页面展示当前分镜网格图和每段视频提示词。
- 新页面支持一键批量生成所有未完成视频，也支持单条编辑提示词和单条生成。
- `npm run lint`、`npm run typecheck`、`cd digital_human_miniapp/taro && npm run build:weapp` 通过。
- 小程序使用 weapp-dev-mcp 完成页面截图、日志和关键交互验证。

## Tech Debt

- 智能复刻仍复用 `storyboard_tasks/storyboard_segments` 作为过渡存储。后续可以抽象 `remix_tasks/remix_clips` 或独立视图模型，彻底解除与普通分镜板命名和状态的耦合。
