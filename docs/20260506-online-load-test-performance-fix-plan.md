# 线上压测后性能修复计划

> 日期：2026-05-06
> 背景：线上即时压测显示 25-50 并发只读链路已出现 P95 8-11s、P99 50s+，瓶颈集中在 `/api/tasks`、`/api/creative-tasks`、`/dashboard`。

## 目标

在不改变核心业务语义的前提下，先完成低风险性能止血：让任务列表只读接口恢复为纯读、减少并发下的数据库写放大，并补齐列表查询索引。

## 范围

1. `/api/tasks`：默认关闭 enrichment，避免列表接口触发额外查询与只读路径里的数据修复写入。
2. `lib/taskSummaryQueries.ts`：将任务汇总列表排序调整为 `updatedAt desc`，对齐已有/新增索引。
3. `/api/creative-tasks`：补齐 `creative_tasks(user_id, updated_at desc)` 索引。
4. 数据库迁移：Prisma + Supabase 均补充索引迁移，确保生产可应用。
5. 压测脚本保留，用于修复后复验。

## 非目标

- 不改 AI/n8n/视频生成链路。
- 不做连接池/实例扩容配置调整。
- 不重构 Dashboard UI。
- 不删除历史任务数据。

## 风险

- `/api/tasks` 默认不 enrichment 后，列表里的部分 replication/poster 衍生 metadata 可能不会实时补齐；详情页或后续专项再做异步补偿。
- 新建索引会占用数据库资源；生产执行建议在低峰窗口应用。

## 回滚

- 代码回滚：恢复 `/api/tasks` 的 `includeEnrichment: true`。
- DB 回滚：可保留索引；如必须回滚，执行 `DROP INDEX CONCURRENTLY IF EXISTS ...`。

## 验收标准

- `npm run lint` 通过（允许既有 warning）。
- `npm run typecheck` 通过。
- 修复后压测：50 并发只读 P95 显著低于修复前 10s+，无 120s 超时。
