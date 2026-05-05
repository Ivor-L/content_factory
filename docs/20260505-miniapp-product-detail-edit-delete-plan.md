# 小程序产品详情页与编辑删除计划

## 目标

- 产品库点击产品卡片后进入新的产品详情页。
- 详情页上方展示产品照片，下方展示分析状态与分析结果。
- 详情页支持编辑产品名称、描述、图片，并支持删除产品。
- 产品上传弹窗的图片选择与预览改为竖构图，更贴近产品照片。

## 范围

- 小程序：`digital_human_miniapp/taro/src/subpages/product-library/` 列表与新增弹窗样式。
- 小程序：新增 `digital_human_miniapp/taro/src/subpages/product-detail/` 详情页。
- API 封装：扩展 `digital_human_miniapp/taro/src/utils/miniapp-api.ts` 的产品查询、更新、删除方法。
- 后端：补齐 `/api/products/[id]` 的用户权限校验、`PATCH` 与 `DELETE`。

## 方案对比

- 方案 A：新增小程序产品详情页，复用现有 Product 表与 `/api/products` 系列接口。
  - 优点：符合“打开新的产品页面”，列表职责清晰；Web/小程序共享数据结构。
  - 缺点：需要新增页面配置与详情页样式。
- 方案 B：继续在产品库列表内使用详情弹层，并在弹层中加入编辑删除。
  - 优点：改动更少。
  - 缺点：不符合新页面要求，弹层内容会变重，后续交互不易扩展。
- 结论：采用方案 A。

## 兼容性结论

- Next.js：使用现有 App Router API route，不新增路由模式。
- Prisma/Supabase：只读写现有 `Product` 字段，不改 schema 和迁移。
- 小程序/Taro：新增 subpackage 页面，沿用现有 `Taro.navigateTo`、`chooseImage`、`showModal`。
- n8n：编辑保存后沿用产品分析触发链路，删除不触发 n8n。

## 里程碑

1. 后端补 `GET/PATCH/DELETE /api/products/[id]` 的归属校验和更新删除。
2. 小程序 API 封装产品详情、更新、删除。
3. 列表页卡片跳转详情页，并删除旧详情弹层逻辑。
4. 新增详情页：照片、分析结果、刷新、编辑、删除。
5. 调整新增/编辑弹窗图片选择器为竖构图。

## 风险与回滚

- 风险：编辑保存后重新触发分析可能消耗积分；沿用当前“分析并保存”的产品创建语义，UI 明确显示为“分析并保存”。
- 风险：删除产品可能影响已关联任务的产品引用；Prisma 关系为 `SET NULL` 的链路可兼容，若实际数据库约束异常则 API 返回失败。
- 回滚：从 `app.config.ts` 移除详情页，列表卡片恢复弹层，删除 `PATCH/DELETE` 小程序入口即可。

## 验收标准

- 产品库卡片点击进入详情页。
- 详情页首屏上方可见产品照片，下方可见分析状态和结果。
- 编辑产品后列表与详情能看到新内容。
- 删除产品后返回产品库，列表不再显示该产品。
- 上传/编辑弹窗图片上传区域为竖构图。
- `npm run lint`、`npm run typecheck` 通过；小程序改动用 `weapp-dev-mcp` 验证页面、截图、日志。

## Tech Debt

- 产品分析结果解析逻辑目前在多个小程序页面内复制，后续可沉淀为共享 formatter。
