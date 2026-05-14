# Seedance 可信人像接入计划

## 目标

- Seedance 2.0 生视频链路不再依赖直接上传真人照片作为人像参考。
- 支持火山方舟虚拟人像库和真人授权入库后的 `asset://` 可信素材 URI。
- 小程序端引导用户录入/粘贴人像资产 ID，真人形象走方舟真人认证与授权流程。

## 范围

- 后端分镜生视频 API：参考素材 URI 解析与火山方舟请求透传。
- 小程序智能复刻视频详情页：参考素材录入入口与合规提示。
- 文档索引：记录本次执行计划。

## 方案对比

1. 继续上传真人照片并在失败时提示更换素材。
   - 优点：改动少。
   - 缺点：Seedance 2.0 隐私策略会拦截真人人脸，体验不可控且不合规。

2. 使用方舟可信素材 `asset://` URI。
   - 优点：兼容虚拟人像库与真人授权入库；API 可直接作为 `reference_image` 传入。
   - 缺点：用户需先在火山方舟体验中心复制资产 ID 或完成真人入库。

采用方案 2。

## 兼容性

- Next.js API：仅扩展参考素材 URI 清洗，不改变现有 HTTP 图片参考图行为。
- Prisma/Supabase：本次不新增字段，继续写入 `generationParams.reference_image_urls`。
- Seedance/火山方舟：按官方 API 使用 `image_url.url = "asset://<asset_id>"` 作为参考图。
- n8n：非 Seedance 路由不透传参考图数组，原行为不变。

## 风险与回滚

- 风险：用户粘贴非 `asset-` 资产 ID 或无权限资产，方舟会返回创建失败。
- 降级：前端保留非真人/产品参考图上传能力。
- 回滚：移除 `asset://` URI 支持和小程序录入入口，即可恢复旧上传行为。

## 验收标准

- `asset://asset-...` 能保存到片段 `generationParams.reference_image_urls`。
- Seedance 请求体中的 `content[].image_url.url` 能保留 `asset://` URI。
- 小程序详情页提示真人照片不可直接上传，并提供粘贴人像资产入口。
- `npm run lint`、`npm run typecheck` 通过；涉及小程序 UI 时完成 weapp-dev-mcp 联调。
