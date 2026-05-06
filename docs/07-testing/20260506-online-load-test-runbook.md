# 2026-05-07 线上压力测试 Runbook

> 目标域名：`https://atomx.top/dashboard`
> 实际 BASE_URL：`https://atomx.top`
> 压测窗口：01:00 起，最长 2 小时
> 目标：验证 100 并发用户下系统卡顿瓶颈
> 预算：最多 10000 积分
> 测试账号：由执行人写入 `.env.loadtest.local`，禁止提交仓库

## 1. 执行前检查

### 1.1 本地工具

```bash
brew install k6
k6 version
```

### 1.2 环境变量

```bash
cp tests/load/.env.loadtest.example .env.loadtest.local
```

填入：

```bash
BASE_URL=https://atomx.top
LOGIN_EMAIL=<测试账号邮箱>
LOGIN_PASSWORD=<测试账号密码>
LOAD_TEST_ID=20260506-content-factory
READONLY_TARGET_VUS=100
WRITE_TARGET_VUS=100
AI_TARGET_VUS=10
ENABLE_AI=0
```

> 注意：`.env.loadtest.local` 不提交；真实密码只保存在执行机器本地。

### 1.3 监控面板打开

执行前必须打开并可实时查看：

- Web 应用 CPU / Memory / 日志。
- Supabase Postgres：CPU、连接数、慢查询、锁等待。
- n8n：Webhook 响应、Workflow execution、失败队列。
- 积分后台：测试账号积分余额、`creative_stage_generation` 使用记录。
- 真实用户反馈渠道。

### 1.4 预算与终止阈值

- AI/n8n 阶段仅允许 `AI_TARGET_VUS=10` 起步。
- 积分消耗达到 8000 时暂停观察，达到 10000 前必须停止。
- 任何阶段若出现连续异常，立即 Ctrl+C 停止 k6。

## 2. 推荐执行时间线

### 01:00-01:10 Smoke：登录 + 只读小流量

```bash
set -a; source .env.loadtest.local; set +a
READONLY_TARGET_VUS=10 npm run loadtest:readonly
```

观察：

- 登录接口是否正常。
- `/dashboard` 是否 5xx。
- `/api/creative-tasks`、`/api/user/profile` 是否正常。
- DB 连接数是否平稳。

通过后进入下一阶段。

### 01:10-01:35 只读升压：100 并发

```bash
set -a; source .env.loadtest.local; set +a
READONLY_TARGET_VUS=100 npm run loadtest:readonly
```

重点判断：

- 如果 50 VU 左右开始卡顿，记录此时 P95/P99、DB 连接数、应用 CPU。
- 若只读也卡，优先怀疑页面 SSR、鉴权、数据库连接池或慢查询。

### 01:35-02:10 轻写升压：创建测试任务

```bash
set -a; source .env.loadtest.local; set +a
WRITE_TARGET_VUS=100 npm run loadtest:write
```

重点判断：

- `POST /api/creative-tasks` P95/P99。
- `syncTaskToSummary` 是否造成额外写入瓶颈。
- Prisma/Supabase Pooler 连接是否耗尽。
- 任务列表是否因数据量上升变慢。

### 02:10-02:35 AI/n8n 小流量阶段

先确认测试账号积分余额足够，然后显式打开 AI：

```bash
set -a; source .env.loadtest.local; set +a
ENABLE_AI=1 AI_TARGET_VUS=10 npm run loadtest:ai
```

若 10 VU 稳定，且积分消耗可控，可短时间提高到 20：

```bash
set -a; source .env.loadtest.local; set +a
ENABLE_AI=1 AI_TARGET_VUS=20 npm run loadtest:ai
```

重点判断：

- `POST /api/creative-tasks/:taskId/generate` 延迟和错误。
- 是否返回 402 或 API Key 未绑定。
- n8n/模型服务是否排队或限流。
- 积分扣费日志是否每次 1 条，无重复扣费。

### 02:35-03:00 恢复观察与数据清理

停止所有 k6 后观察 10-15 分钟：

- CPU/连接数是否恢复。
- n8n 是否仍有积压。
- 是否有失败任务持续重试。

先 dry run：

```bash
LOAD_TEST_ID=20260506-content-factory npm run loadtest:cleanup
```

确认只包含压测任务后删除：

```bash
LOAD_TEST_ID=20260506-content-factory DRY_RUN=0 npm run loadtest:cleanup
```

## 3. 终止条件

任一条件触发，立即停止：

- HTTP 5xx 连续 2 分钟 > 2%。
- P95 连续 3 分钟超过目标 2 倍。
- 线上真实用户明显卡顿或投诉。
- DB CPU/连接数接近上限并持续升高。
- n8n 任务大量失败或不可恢复积压。
- 积分消耗超过 8000 且无法确认剩余额度。
- 第三方 AI/视频服务出现限流、封禁或成本异常。

## 4. 结果记录模板

| 阶段 | VU | RPS | P95 | P99 | 失败率 | DB 连接 | CPU | n8n 状态 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Smoke | 10 |  |  |  |  |  |  |  |  |
| Readonly | 50 |  |  |  |  |  |  |  |  |
| Readonly | 100 |  |  |  |  |  |  |  |  |
| Write | 50 |  |  |  |  |  |  |  |  |
| Write | 100 |  |  |  |  |  |  |  |  |
| AI | 10 |  |  |  |  |  |  |  |  |

## 5. 初步瓶颈判断方法

- 只读阶段卡：优先查页面 SSR、鉴权调用、`getRequestUserContext`、DB 连接池、列表查询索引。
- 轻写阶段卡：优先查 `creative_tasks` 写入、`task_summaries` upsert、事务/锁等待。
- AI 阶段卡：优先查积分扣费接口、模型 API、n8n 排队、服务端超时。
- 50 人开始卡、100 人更明显：重点看连接池耗尽、单实例 CPU、n8n 同步等待、外部 API 串行调用。
