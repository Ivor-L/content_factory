# 小程序素材库头部与卡片适配修复计划

## 目标

- 角色库、产品库、风格库头部高度、标题位置、返回按钮样式对齐图片生成页标准。
- 修复角色库两列卡片在小程序视口中横向溢出的问题。

## 范围

- `digital_human_miniapp/taro/src/subpages/warehouse/`
- `digital_human_miniapp/taro/src/subpages/product-library/`
- `digital_human_miniapp/taro/src/subpages/style-library/`
- `docs/README.md`

## 调研结论

- 方案 A：抽取共享库页 Header 组件与样式。优点是长期一致性更好；缺点是会改动更多文件，当前已有多处未提交小程序改动，冲突风险较高。
- 方案 B：在三个库页内按图片生成页现有 SASS 参数局部对齐。优点是改动小、风险低；缺点是未来仍可能重复维护。
- 本次采用方案 B，后续若继续统一小程序页面壳层，再抽共享组件。

## 兼容性

- 仅修改 Taro 页面结构与 SASS，兼容现有 Next.js/Prisma/Supabase/API。
- 不涉及 n8n、数据库 schema、迁移或环境变量。

## 风险与回滚

- 风险：不同机型胶囊区与安全区高度可能仍存在轻微视觉差异。
- 回滚：还原本计划涉及的三个页面样式和角色库标题结构即可。

## 验收标准

- 角色库、产品库、风格库标题位置与图片生成页一致。
- 三页返回按钮样式一致。
- 角色库两列卡片不超出屏幕宽度。
- Taro 小程序构建通过。

## Tech Debt

- 小程序二级页 Header 样式仍分散在各页面，建议后续抽为统一 PageHeader。
