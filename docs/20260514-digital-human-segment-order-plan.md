# 数字人分段顺序修复计划

## 目标

- Web 端数字人长文案分段生成后，作品列表按第 1 段、第 2 段、第 3 段的顺序展示。
- 小程序数字人长文案提交后，后端创建所有分段任务，并让小程序拿到完整分段任务信息。

## 范围

- `lib/digitalHumanJob.ts`：为同批分段任务写入稳定顺序信息，并保证创建时间可用于倒序列表保序。
- `app/api/digital-human/videos/route.ts` 与详情接口：返回完整分段任务、分段序号与批次信息。
- `app/actions/digital-human.ts`：Web 表单提交返回完整任务元信息。
- `digital_human_miniapp/taro/src/utils/api.ts` 与生成页：识别完整分段返回，提交成功提示按实际任务数展示。
- `digital_human_miniapp/taro/src/utils/miniapp-api.ts`：作品列表对同批数字人分段按分段序号稳定排序。
- `docs/README.md`：更新计划索引。

## 分阶段里程碑

1. 共享创建逻辑补齐分段批次、序号、总数和稳定排序时间。
2. Web API/Action 返回完整 `jobs`，保留兼容字段 `videoIds`、`jobCount`、`split`。
3. 小程序类型与作品列表支持多分段结果和顺序展示。
4. 运行 `npm run lint`、`npm run typecheck` 验证。

## 风险

- 不新增数据库字段，分段信息先写入 `scriptContent` 前缀和 `TaskSummary.metadata`，历史任务无法自动恢复批次序号。
- 依赖 `createdAt` 毫秒级偏移让倒序列表保序，数据库若截断毫秒精度，前端仍需用返回的 `segmentIndex` 做兜底排序。

## 回滚

- 回滚本次涉及文件即可恢复原来的单任务返回与创建时间行为。
- 已创建任务本身仍是普通数字人任务，不会影响 webhook 回调更新。

## 验收标准

- 长文案拆成多段时，后端返回 `jobs.length === jobCount`。
- Web 与小程序作品列表中，同批分段按 `第 1 段` 到 `第 N 段` 展示。
- `npm run lint`、`npm run typecheck` 通过。
