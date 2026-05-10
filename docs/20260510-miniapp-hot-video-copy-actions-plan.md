# 小程序爆款视频口播动作计划

## 目标

- 修复爆款广场视频笔记采集后的封面、标题、文案提取状态与下载体验。
- 在视频详情页提供口播文案快捷动作：复制、一键二创、数字人视频。
- 将“一键二创”复用 Web 端 `/api/replication/copy` 与写作风格体系，不新增独立二创链路。

## 范围

- 小程序爆款列表与详情页：`pages/hot-square`、`subpages/hot-detail`。
- 小程序 API 封装：`utils/miniapp-api.ts`。
- Web 采集与二创接口：`app/api/miniapp/hot-square/collect-xhs`、既有 `/api/replication/copy`。

## 方案对比

- 方案 A：在小程序新建独立视频二创接口。优点是小程序定制强；缺点是重复计费、重复 n8n 参数与回调维护。
- 方案 B：小程序直接复用 Web 端 `/api/replication/copy`。优点是沿用已有写作风格、计费与 n8n 二创逻辑；缺点是前端需要补写作风格选择。

结论：采用方案 B。

## 兼容性

- Next.js：复用现有 API route，无新增框架能力。
- Prisma/Supabase：不改 schema，不新增迁移。
- n8n：继续使用既有二创工作流与回调。
- 小程序：数字人视频通过已有 `generate/index?from=smart-copy&feature=digital-human` 预填口播文案。

## 风险与回滚

- 风险：用户未创建写作风格时无法二创。前端保留提示，引导先在 Web 端创建风格。
- 风险：视频下载源站防盗链。通过现有 `/api/proxy/download` 代理下载降低失败率。
- 回滚：移除详情页新增按钮与 `miniappApi.createVideoCopyRemix` 封装即可恢复旧行为。

## 验收标准

- 视频笔记卡片能显示标题与封面。
- 提取文案成功后状态显示“文案已提取”，不再显示“解析失败”。
- 口播文案可复制，可选择写作风格发起一键二创。
- 数字人视频入口能把口播文案预填到数字人页面。
- 小程序详情页无运行日志异常。

