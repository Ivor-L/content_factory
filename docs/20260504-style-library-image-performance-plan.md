# 风格库图片加载性能优化计划

## 目标

- 降低风格库列表页首屏图片下载体积。
- Web 端和小程序端优先加载缩略图，详情和下游生成仍保留原图 URL。
- 避免引入数据库迁移，降低回滚成本。

## 最小调研结论

### 方案对比

- 方案 A：上传时生成缩略图，并把缩略图 URL 写入 `metadata.thumbnailUrl`。
  - 优点：列表接口可直接返回轻量图；Web 和小程序共用；不需要迁移。
  - 缺点：旧数据需要回填才会完全收益，否则先退回原图。
- 方案 A+：系统默认静态图生成本地 WebP 缩略图，并由接口从 `/system-style-previews/*.png` 映射到 `/system-style-previews/thumbs/*.webp`。
  - 优点：不依赖数据库 metadata，系统默认风格立即收益。
  - 缺点：默认图更新后需要重跑 `npm run styles:thumbs`。
- 方案 B：前端仅加懒加载。
  - 优点：改动小。
  - 缺点：首屏可见图片仍是原图，单张 1MB+ 的问题没有消失。
- 方案 C：新增 `thumbnail_url` 字段。
  - 优点：数据模型清晰。
  - 缺点：涉及 Prisma/Supabase 迁移和额外数据库门禁，本次优化成本更高。

本次选择方案 A + A+，并叠加前端懒加载。

## 兼容性

- Next.js：服务端 route 可使用项目已有 `sharp` 生成 WebP 缩略图。
- Prisma：不改 schema，使用现有 `StylePreset.metadata` JSON。
- Supabase/OSS：继续走现有 `uploadToStorage`，缩略图作为派生文件上传。
- 小程序：`Image` 支持 `lazyLoad`，新增 `thumbnailUrl` 字段后旧接口仍可退回 `previewUrl`。
- n8n：原图 `previewUrl` 不变，风格分析仍使用原图。

## 风险与回滚

- 风险：部分图片格式无法被 `sharp` 处理。
  - 策略：缩略图生成失败时记录 warning，继续保存原图，不阻断上传。
- 风险：旧数据没有 `thumbnailUrl`。
  - 策略：接口返回 `thumbnailUrl ?? previewUrl`，旧数据行为不变。
- 回滚：移除缩略图 helper 与前端字段使用即可；metadata 中多余字段不会影响现有逻辑。

## POC 结果

- 项目已有 `sharp` 依赖，无需新增依赖。
- 当前上传链路已经拿到上传文件 buffer，可直接生成 WebP 缩略图。
- 当前列表接口支持 summary 模式，可在不改变主要响应结构的前提下追加 `thumbnailUrl`。

## 验收标准

- 新上传风格生成 `metadata.thumbnailUrl`。
- 系统默认风格返回 `/system-style-previews/thumbs/*.webp`。
- `/api/assets/styles?summary=1` 返回 `thumbnailUrl`。
- Web 风格卡片和小程序风格列表优先使用 `thumbnailUrl`。
- Web 图片启用 `loading="lazy"`，小程序图片启用 `lazyLoad`。
- `npm run lint` 和 `npm run typecheck` 通过。
