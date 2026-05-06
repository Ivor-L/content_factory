# 线上压力测试脚本

本目录用于 Content Factory Web 线上受控压力测试。默认目标：`https://atomx.top`，入口页面：`/dashboard`。

详细执行计划见：[`docs/07-testing/20260506-online-load-test-plan.md`](../../docs/07-testing/20260506-online-load-test-plan.md)。

## 安全约束

- 仅在已授权压测窗口执行：2026-05-07 01:00 起，最多 2 小时。
- 默认目标为 100 并发用户，但必须按阶段升压，不允许一开始直接 100 VU。
- 压测流量带固定标识：
  - `X-Load-Test: 20260506-content-factory`
  - `User-Agent: content-factory-load-test/20260506`
- 预算上限：10000 积分。涉及 AI/n8n/视频任务的脚本默认通过环境变量开关控制。
- 不要把真实账号密码或 token 提交到仓库。

## 本地准备

安装 k6：

```bash
brew install k6
```

复制环境变量模板：

```bash
cp tests/load/.env.loadtest.example .env.loadtest.local
```

编辑 `.env.loadtest.local`，填入测试账号密码。`.env*.local` 已被 `.gitignore` 忽略。

## 执行命令

只读基线：

```bash
set -a; source .env.loadtest.local; set +a; k6 run tests/load/online-smoke-readonly.js
```

轻写任务创建：

```bash
set -a; source .env.loadtest.local; set +a; k6 run tests/load/online-creative-task-write.js
```

AI 阶段生成/n8n 链路（会消耗积分）：

```bash
set -a; source .env.loadtest.local; set +a; ENABLE_AI=1 k6 run tests/load/online-ai-generation.js
```

如果本机没有 k6，可使用 Node 备用脚本：

```bash
set -a; source .env.loadtest.local; set +a; LOADTEST_MODE=readonly TARGET_VUS=50 DURATION_SECONDS=120 npm run loadtest:node
set -a; source .env.loadtest.local; set +a; LOADTEST_MODE=write TARGET_VUS=10 DURATION_SECONDS=120 npm run loadtest:node
set -a; source .env.loadtest.local; set +a; ENABLE_AI=1 LOADTEST_MODE=ai TARGET_VUS=10 DURATION_SECONDS=120 npm run loadtest:node
```

## 推荐 2 小时窗口安排

| 时间 | 阶段 | 脚本 | 并发 |
| --- | --- | --- | --- |
| 01:00-01:10 | Smoke | `online-smoke-readonly.js` | 1 → 10 |
| 01:10-01:35 | 只读升压 | `online-smoke-readonly.js` | 10 → 100 |
| 01:35-02:10 | 轻写升压 | `online-creative-task-write.js` | 10 → 100 |
| 02:10-02:35 | AI/n8n 小流量 | `online-ai-generation.js` | 1 → 10/20 |
| 02:35-02:50 | 观察恢复 | 停止压测 | 0 |
| 02:50-03:00 | 数据/日志检查 | 手工 | - |

## 数据清理

压测结束后先 dry-run 检查将被删除的数据：

```bash
LOAD_TEST_ID=20260506-content-factory npx tsx scripts/loadtest-cleanup.ts
```

确认无误后执行删除：

```bash
LOAD_TEST_ID=20260506-content-factory DRY_RUN=0 npx tsx scripts/loadtest-cleanup.ts
```

如无数据库凭据，也可以用测试账号通过 API 清理最近列表中的压测任务：

```bash
set -a; source .env.loadtest.local; set +a; DRY_RUN=0 npm run loadtest:node-cleanup
```

## 终止条件

出现任一情况立即停止：

- HTTP 5xx 连续 2 分钟 > 2%。
- P95 响应时间连续 3 分钟超过目标 2 倍。
- Supabase/DB 连接数或 CPU 接近上限。
- n8n 大面积失败或积压不可恢复。
- 积分消耗接近 10000。
- 真实用户投诉或线上业务异常。
