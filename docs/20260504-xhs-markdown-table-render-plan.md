# 小红书卡片 Markdown 表格渲染计划

## 目标

- Web 与小程序的小红书图文卡片都能渲染标准 Markdown 表格。
- 小程序预览与后端导出图片保持可接受的一致性。
- AI 排版在遇到键值型活动信息时，能保留或主动整理成 Markdown 表格。

## 范围

- 后端共享渲染：`lib/xhsLayoutEngine.ts`
- Web 辅助导出 HTML：`app/(main)/dashboard/components/markdownLayoutUtils.ts`
- Web AI 排版接口：`app/api/xhs-layout/normalize/route.ts`
- 小程序图文卡片预览：`digital_human_miniapp/taro/src/subpages/image-generate/index.tsx`

不涉及数据库 schema、迁移、积分、发布接口协议变更。

## 最小调研结论

方案 A：在后端 SVG 引擎内实现 Markdown table 解析与绘制。
- 优点：小程序与 Web 调用 `/api/xhs-layout/render` 时可共用；Sharp 转 PNG 稳定，不依赖浏览器截图。
- 缺点：需要维护简化版 Markdown 表格布局。

方案 B：改用前端 canvas/HTML 截图作为统一导出。
- 优点：Web 已有较完整 canvas table 逻辑。
- 缺点：小程序端截图能力、字体与画布差异大；后端发布任务难以复用；回归面更大。

采用方案 A，并给小程序 RichText 预览补轻量 table HTML。Web 现有 canvas 弹窗已支持 table，本次补齐简单 HTML 导出和 AI prompt。

## 兼容性

- Next.js API Route：继续返回相同 `images/taskId/title/templateId` 结构。
- Sharp：仍输入 SVG 字符串转 PNG，不新增依赖。
- Prisma/Supabase：无 schema 改动。
- Taro/微信小程序：RichText 使用基础 `table/tr/td` HTML 与内联样式，若宿主限制表格样式，最终导出图仍以后端 PNG 为准。

## 实施步骤

1. 在 `xhsLayoutEngine` 中增加表格块解析：
   - 识别标准 Markdown table header + separator + rows。
   - 兼容 `:---`、`---:`、`:---:` 对齐标记。
   - 保留单元格内基础 Markdown 样式清洗后的文本。
2. 在 SVG 内容页绘制表格：
   - 两列或多列表格自适应宽度。
   - 表头加粗和浅色底。
   - 单元格按字符宽度换行，行高随内容增长。
   - 超页时按行分页。
3. 小程序预览 `renderMiniMarkdown` 增加表格 HTML 输出和分页估算权重。
4. Web 简单 HTML 导出增加表格解析和样式，避免表格在 HTML 预览中退化为段落。
5. AI 规范化 prompt 增加表格规则：适合结构化键值信息时输出标准 Markdown 表格，已有表格必须保留。

## 风险

- 宽表超过 3 列时，小红书竖版卡片可读性下降。处理策略：最小列宽保护，单元格自动换行。
- 小程序 RichText 对 table CSS 支持不如浏览器。处理策略：预览做尽力渲染，导出图以后端 PNG 为准。
- AI 可能把长正文误整理成表格。处理策略：prompt 只要求“活动/参数/属性键值信息”使用表格，正文段落继续保留。

## 回滚

- 回滚 `xhsLayoutEngine` 中 table block 分支，恢复 `markdownToLayoutLines` 纯文本分页。
- 回滚小程序 `renderMiniMarkdown` table 分支后，预览恢复普通段落。
- 回滚 normalize prompt 文案，不影响 API 契约。

## 验收标准

- 输入包含 `| 项目 | 内容 |`、`|:---|:---|` 的标准表格时，后端导出 PNG 显示表格框线、表头、两列内容。
- 小程序图文卡片预览能显示表格结构，而不是裸 Markdown 管道符。
- AI 排版对“活动名称/参加时间/时长/活动地点”类信息能生成标准 Markdown 表格。
- `npm run lint` 与 `npm run typecheck` 通过。
