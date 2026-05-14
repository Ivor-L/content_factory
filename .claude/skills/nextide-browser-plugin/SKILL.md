---
name: nextide-browser-plugin
description: 插件小红书当前页采集：生成浏览器插件采集当前小红书页面的结构化指令，由用户本地插件执行。；插件小红书发布辅助：生成小红书发布辅助指令，交由浏览器插件在用户本地登录态下半自动执行。；插件账号同步指令：生成浏览器插件账号检测和同步指令，用于把本地平台账号摘要同步到 Web。
allowed-tools: Read, Write, Bash
---

# 插件小红书当前页采集

Follow shared NexTide rules in:

- `nextide-shared`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 插件小红书当前页采集

- Capability: `plugin.xhs.collect`
- Version: `0.2.0`
- Category: `plugin`
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
- Tags: `plugin`, `xiaohongshu`, `collect`

Description:

生成浏览器插件采集当前小红书页面的结构化指令，由用户本地插件执行。

Examples:

- 采集当前小红书页面

  ```json
  {
    "saveToHotSquare": true
  }
  ```

Input fields:

- `url` (string)：要采集的小红书页面 URL；为空时由插件采集当前页。
- `saveToHotSquare` (boolean)：是否写入爆款广场/素材库。 默认：`true`
- `taskId` (string)：关联淘金任务 ID。
- `userTaskId` (string)：关联用户任务 ID。

Output fields:

- `pluginInstruction` (object)：前端/本地插件可执行的采集指令。

CLI:

```bash
nextide capability run plugin.xhs.collect \
  --input .nextide/input/plugin.xhs.collect.json \
  --output .nextide/output/plugin.xhs.collect-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/plugin.xhs.collect-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --download \
  --gallery \
  --datatable
```

Then read `summary.json` first, followed by `manifest.json`.

### 插件小红书发布辅助

- Capability: `plugin.xhs.publish`
- Version: `0.2.0`
- Category: `plugin`
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
- Tags: `plugin`, `xiaohongshu`, `publish`

Description:

生成小红书发布辅助指令，交由浏览器插件在用户本地登录态下半自动执行。

Examples:

- 生成小红书发布指令

  ```json
  {
    "title": "3 个护肤误区",
    "description": "正文内容...",
    "tags": [
      "护肤",
      "新手"
    ],
    "mediaUrls": []
  }
  ```

Input fields:

- `title` (string, required)：发布标题。
- `description` (string, required)：发布正文。
- `tags` (string[])：话题标签。
- `mediaUrls` (string[])：图片或视频 URL。
- `taskId` (string)：关联淘金任务 ID。
- `userTaskId` (string)：关联用户任务 ID。

Output fields:

- `pluginInstruction` (object)：前端/本地插件可执行的发布指令。

CLI:

```bash
nextide capability run plugin.xhs.publish \
  --input .nextide/input/plugin.xhs.publish.json \
  --output .nextide/output/plugin.xhs.publish-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/plugin.xhs.publish-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" \
  --output-dir .nextide/output/$RUN_ID \
  --download \
  --gallery \
  --datatable
```

Then read `summary.json` first, followed by `manifest.json`.

### 插件账号同步指令

- Capability: `plugin.account.sync`
- Version: `0.2.0`
- Category: `plugin`
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
- Tags: `plugin`, `account`, `sync`

Description:

生成浏览器插件账号检测和同步指令，用于把本地平台账号摘要同步到 Web。

Examples:

- 同步插件账号

  ```json
  {
    "platform": "xhs"
  }
  ```

Input fields:

- `platform` (string)：需要同步的平台。为空时同步全部支持平台。

Output fields:

- `pluginInstruction` (object)：前端/本地插件可执行的账号同步指令。

CLI:

```bash
nextide capability run plugin.account.sync \
  --input .nextide/input/plugin.account.sync.json \
  --output .nextide/output/plugin.account.sync-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/plugin.account.sync-result.json'); console.log(r.run && r.run.runId)")
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
