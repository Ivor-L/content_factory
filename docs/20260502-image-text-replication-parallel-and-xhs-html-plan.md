# 2026-05-02 图文复刻并行识别与小红书卡片 HTML 渲染改造计划

## 目标
- 将图文复刻的图片识别从串行改为并行，提升识别速度。
- 在并行情况下保持输出顺序与原图顺序一致。
- 识别完成后自动生成标准化 Markdown 文档，包含标题层级、重点标注、表格与可渲染 HTML 片段。
- 保存到知识库时同时落盘原标题、原正文、标签与标准化正文。
- 小红书卡片弹窗支持 HTML 标签渲染。
- 二创文案/标题生成链路强制带上原标题与原正文作为改写基底。

## 范围
- 前端：
  - `app/(main)/scripts/ImageTextReplicationPanel.tsx`
  - `app/(main)/dashboard/components/MarkdownXhsLayoutModal.tsx`
  - `app/(main)/replication/CopyRemixPanel.tsx`
- 后端：
  - `app/api/replication/copy/route.ts`
  - `lib/n8n.ts`
- 文档：
  - `docs/README.md`

## 方案对比
1. 方案 A：全量 `Promise.all` 并发
- 优点：实现最简单，速度最快。
- 风险：大批量图片时上游模型/网络抖动会放大失败率。

2. 方案 B：有限并发（推荐）
- 优点：兼顾吞吐和稳定性，可控并发下依然显著快于串行。
- 风险：实现稍复杂，需要并发调度与进度统计。

## 兼容性结论
- Next.js：纯 TS/React 逻辑调整，无框架冲突。
- Prisma/Supabase：不改 schema，不引入迁移风险。
- n8n：通过向既有 webhook payload 增加可选字段（`source_title/source_text`）实现向后兼容。
- 第三方 API：识别仍走既有 `/api/canvas/image-understanding`，仅调用策略变化。

## 分阶段里程碑
1. 阶段 1：并行识别与顺序稳定
- 增加有限并发调度器。
- 保证结果数组按原图 index 回填。

2. 阶段 2：标准化 Markdown 生成与入库
- 识别结果结构化为标准 Markdown（H1/H2/H3、重点、表格、HTML block）。
- 保存时同步写入原标题、原正文、标签、标准化正文。

3. 阶段 3：小红书弹窗 HTML 渲染
- 打开 Markdown 解析器 HTML 支持。
- 对 HTML token 做解析，渲染为可展示文本样式（而不是原始标签文本）。

4. 阶段 4：二创改写基底强化
- 前端触发二创请求时增加 `sourceTitle/sourceText`。
- 后端和 n8n payload 透传 `source_title/source_text`。

## 风险与回滚
- 风险：
  - 并行请求导致单次失败概率上升。
  - HTML 渲染开启后若输入不规范，排版可能异常。
- 回滚策略：
  - 并行可快速退回串行 `for-await`。
  - HTML 支持可退回 `html: false` 与纯文本策略。
  - 二创字段为可选透传，去掉字段即可回退。

## 验收标准
- 并行识别完成时间明显优于串行，且输出顺序严格对应原图顺序。
- 识别结果自动形成标准化 Markdown，包含标题层级、重点、表格、HTML 标签片段。
- 知识库文件可见原标题、原正文、标签、标准化正文。
- 小红书卡片弹窗中 HTML 标签内容可正确渲染，不显示原始标签字符。
- 二创链路请求体与 webhook payload 中可见 `source_title/source_text`，生成内容基于原文语义改写。

## Tech Debt
- 当前标签抽取以启发式规则为主，后续可接入更稳定的关键词抽取模型。
- HTML token 到排版 token 的映射只覆盖常见标签，后续可补齐更多标签语义映射与样式策略。
