# 2026-05-04 小程序小红书采集同步 Web 端计划

## 目标
- 小程序端粘贴小红书链接采集成功后，笔记继续进入小程序「我的」分类。
- 同一条笔记同步出现在 Web 端「爆款内容」列表，复用现有 `/api/viral-references` 数据源。
- 避免个人采集覆盖后台共享爆款数据。

## 范围
- 后端 API：
  - `app/api/miniapp/hot-square/collect-xhs/route.ts`
- 文档索引：
  - `docs/README.md`

## 方案对比
1. Web 端同时读取 `image_text_replication_tasks`
- 优点：不需要额外写入。
- 缺点：Web 爆款列表已有筛选、详情、删除、复刻链路均基于 `viral_reference_items`，混读会让前端适配变复杂。

2. 小程序采集成功时同步写入 `viral_reference_items`（采用）
- 优点：复用 Web 现有爆款内容 API 和页面；小程序/Web 数据语义一致。
- 风险：`viral_reference_items` 存在 `platform + sourceId` 全局唯一约束，需避免与共享爆款冲突。

## 兼容性结论
- Next.js App Router：兼容，仅扩展现有 API Route。
- Prisma/Supabase：不新增字段和迁移，复用 `image_text_replication_tasks` 与 `viral_reference_items`。
- Web 端：兼容现有 `/api/viral-references` 查询和 Scripts 页展示。
- 小程序端：兼容现有采集接口响应，不改前端调用协议。

## 实施
- 在小程序采集 API 内使用同一事务：
  - upsert `image_text_replication_tasks`，保持「我的」分类能力。
  - upsert `viral_reference_items`，写入 Web 端爆款内容。
- Web 同步记录使用 `miniapp:{userId}:{xhsSourceId}` 作为 `sourceId`，原始小红书 ID 保存在 `rawPayload.originalSourceId`，避免覆盖后台共享数据。
- Web 同步记录的 `ingestedBy` 为当前用户，`category` 为「我的」，`collectorVersion` 为 `miniapp_xhs_collect_v1`。

## 风险与回滚
- 风险：小红书采集服务返回字段不稳定，可能导致媒体或作者信息缺失。
  - 处理：继续复用现有多路径字段兜底，Web 端至少展示标题、正文和来源链接。
- 风险：Web 同步写入失败会导致小程序采集整体失败。
  - 处理：事务保证两端状态一致；若需降级，可把 Web 同步改为 best-effort。
- 回滚：移除 Web 同步 upsert，保留原有「我的笔记」写入即可；无迁移需要回滚。

## 验收标准
- 小程序采集图文笔记后，「我的」分类出现该笔记。
- 同一用户登录 Web 后，Scripts 页「爆款内容」可看到该笔记。
- 重复采集同一小红书链接不会新增多条 Web 记录，而是更新原记录。
- 后台共享爆款记录不会因为个人采集被改写归属。
