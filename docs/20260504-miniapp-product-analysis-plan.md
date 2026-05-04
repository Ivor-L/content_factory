# 小程序产品上传分析与产品库结果查看计划

## 目标

- 小程序产品库上传产品后，自动触发现有产品分析接口。
- 产品库点击产品卡片后，可以查看分析状态、纯文本分析、结构化卖点与原始分析内容。
- 复用 Web 端现有 Product 表与 `/api/products/analyze` 链路，不新增数据库字段。

## 范围

- 后端：`/api/products` 列表/创建返回分析所需字段；`/api/products/analyze` 校验产品归属并在同步返回结果时回写 Product。
- 小程序 API：扩展 `ProductSummary`，创建产品后调用产品分析接口。
- 小程序 UI：产品库卡片展示分析状态，点击卡片打开详情弹层查看分析结果。
- 文档：更新文档索引。

## 最小调研结论

### 方案 A：复用 `/api/products` + `/api/products/analyze`

- 优点：沿用现有 Next.js API、Prisma `Product` 模型与 n8n 产品分析工作流；小程序和 Web 端共享同一套状态字段。
- 缺点：需要补齐 `/api/products` 返回字段，并增强 `/api/products/analyze` 在同步返回完整结果时的回写逻辑。
- 结论：采用。改动面小，兼容已有 Web 页面。

### 方案 B：新增 `/api/miniapp/products`

- 优点：可以为小程序单独设计响应结构。
- 缺点：会复制产品列表、创建和分析触发逻辑，后续 Web/小程序状态容易分叉。
- 结论：暂不采用。只有当小程序产品库出现明显独立分页/权限/上传协议时再拆分。

## 兼容性

- Next.js：沿用 App Router Route Handler，无需新增依赖。
- Prisma：只读写现有 `Product` 字段，不涉及 schema 或迁移。
- Supabase：仍通过现有用户上下文/API Key 解析用户，不改变认证表。
- n8n：继续调用 `N8N_PRODUCT_ANALYSIS_WEBHOOK`，保留异步 `started` 响应模式；若同步返回完整分析结果，后端会回写 `sellingPoints`、`sellingPointsText`、`analysisResult`。

## 风险与回滚

- 风险：n8n 若返回 `started` 后由工作流异步写库，小程序详情需刷新后才能看到结果。
- 风险：用户未绑定 API Key 时，产品会创建成功但分析触发失败。
- 回滚：移除小程序 `createProduct` 中的分析调用，保留产品创建；后端新增字段返回对旧客户端兼容。

## POC 结果

- 已确认 `Product` 模型包含 `sellingPoints`、`sellingPointsText`、`analysisResult`、`status`、`progress` 字段。
- 已确认 Web 端存在 `/api/products/analyze` 与 n8n `analyzeProduct` 调用。
- 已确认小程序产品库当前只调用 `/api/products` 创建/列表，未触发分析，也未展示结果。

## 验收标准

- 小程序添加产品成功后触发产品分析接口。
- 产品卡片能显示分析状态：未分析、分析中、分析完成、分析失败。
- 点击产品卡片能查看分析纯文本、结构化卖点或原始 JSON。
- `npm run lint`、`npm run typecheck` 通过。
- UI 改动完成后执行本地页面验证；若当前环境无 CDP 工具，需在交付说明中标明未能完成 CDP 验证。
