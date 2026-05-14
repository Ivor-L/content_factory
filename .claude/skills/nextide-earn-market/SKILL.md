---
name: nextide-earn-market
description: 淘金任务匹配：按平台、类型、关键词列出当前可接的淘金广场任务，用于 Agent 帮用户挑选任务。；淘金任务接单：为当前用户接取淘金任务，并自动分配可用素材。；淘金任务提交证据：提交任务发布链接、截图或插件采集证据，进入后台审核。
allowed-tools: Read, Write, Bash
---

# 淘金任务匹配

Follow shared NexTide rules in:

- `nextide-shared`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 淘金任务匹配

- Capability: `earn.task.list`
- Version: `0.2.0`
- Category: `earn`
- Status: `available`
- Execution: `internal_api`
- Async: `false`
- Cost level: `low`
- Required auth: `nexTideApiKey`
- Required env: `none`
- Required plan: `none`
- Rate limit: `none`
- Estimated credits: 1
- Estimated duration: 3 seconds
- Tags: `earn`, `task-market`, `monetization`

Description:

按平台、类型、关键词列出当前可接的淘金广场任务，用于 Agent 帮用户挑选任务。

Examples:

- 匹配小红书发布任务

  ```json
  {
    "platform": "xhs",
    "type": "publish",
    "query": "护肤",
    "limit": 10
  }
  ```

Input fields:

- `platform` (string)：目标平台。为空时返回全部平台。
- `type` (string)：任务类型，如 publish、collect、promotion。
- `query` (string)：搜索关键词。
- `limit` (number)：返回任务数量，最多 20。 默认：`10`

Output fields:

- `tasks` (array)：匹配到的任务列表。
- `total` (number)：满足筛选条件的任务总数。

CLI:

```bash
nextide capability run earn.task.list \
  --input .nextide/input/earn.task.list.json \
  --output .nextide/output/earn.task.list-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/earn.task.list-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --download \
  --gallery \
  --datatable
```

Then read `summary.json` first, followed by `manifest.json`.

### 淘金任务接单

- Capability: `earn.task.apply`
- Version: `0.2.0`
- Category: `earn`
- Status: `available`
- Execution: `internal_api`
- Async: `false`
- Cost level: `low`
- Required auth: `nexTideApiKey`
- Required env: `none`
- Required plan: `none`
- Rate limit: `none`
- Estimated credits: 1
- Estimated duration: 3 seconds
- Tags: `earn`, `task-market`, `apply`

Description:

为当前用户接取淘金任务，并自动分配可用素材。

Examples:

- 接取小红书任务

  ```json
  {
    "taskId": "task_xxx",
    "platform": "xhs",
    "platformAccountName": "我的小红书账号"
  }
  ```

Input fields:

- `taskId` (string, required)：淘金任务 ID。
- `platform` (string, required)：接单平台。
- `platformUid` (string)：平台账号 UID；未知时可为空。
- `platformAccountName` (string)：平台账号昵称。
- `taskMaterialId` (string)：指定素材 ID；为空时系统自动分配。

Output fields:

- `userTaskId` (string)：接单记录 ID。
- `task` (object)：任务摘要。
- `material` (object)：分配到的素材。

CLI:

```bash
nextide capability run earn.task.apply \
  --input .nextide/input/earn.task.apply.json \
  --output .nextide/output/earn.task.apply-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/earn.task.apply-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --download \
  --gallery \
  --datatable
```

Then read `summary.json` first, followed by `manifest.json`.

### 淘金任务提交证据

- Capability: `earn.task.submit_evidence`
- Version: `0.2.0`
- Category: `earn`
- Status: `available`
- Execution: `internal_api`
- Async: `false`
- Cost level: `low`
- Required auth: `nexTideApiKey`
- Required env: `none`
- Required plan: `none`
- Rate limit: `none`
- Estimated credits: 1
- Estimated duration: 3 seconds
- Tags: `earn`, `task-market`, `evidence`

Description:

提交任务发布链接、截图或插件采集证据，进入后台审核。

Examples:

- 提交发布证据

  ```json
  {
    "userTaskId": "ut_xxx",
    "submissionUrl": "https://www.xiaohongshu.com/explore/xxx",
    "pluginEvidence": {
      "workId": "xxx"
    }
  }
  ```

Input fields:

- `userTaskId` (string, required)：用户接单记录 ID。
- `submissionUrl` (string)：发布后的作品链接。
- `screenshotUrls` (string[])：截图 URL 列表。
- `pluginEvidence` (object)：插件返回的 workId、shareLink、页面标题等结构化证据。

Output fields:

- `userTask` (object)：更新后的用户任务记录。

CLI:

```bash
nextide capability run earn.task.submit_evidence \
  --input .nextide/input/earn.task.submit_evidence.json \
  --output .nextide/output/earn.task.submit_evidence-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/earn.task.submit_evidence-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --download \
  --gallery \
  --datatable
```

Then read `summary.json` first, followed by `manifest.json`.

## General Rules

- Use NexTide capability IDs, not internal n8n webhook URLs.
- Do not expose API secrets or internal webhook URLs in prompts or output.
- If status is not `available`, fail fast and explain what is missing.
- For async tasks, prefer `--wait` when the user wants a finished result in the same turn.
- After a finished run, use `nextide run artifacts <run-id> --output-dir .nextide/output/<run-id> --download --gallery --datatable` and read `summary.json` then `manifest.json`.
- For long-running runs, prefer `nextide run follow <run-id> --output-dir .nextide/output/<run-id> --timeout 1800 --interval 5`.
- Prefer returning `summary.recommendedResponse.message`, `preview.html`, `datatable.json`, and local artifact paths over pasting huge raw JSON.
- If the CLI output includes `explanation`, convert it into a clear user-facing failure message with next actions.

<!-- END NEXTIDE AUTO-GENERATED -->
