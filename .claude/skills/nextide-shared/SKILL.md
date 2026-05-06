---
name: nextide-shared
description: NexTide Skills 共享规则。其他 NexTide skill 提到 hosted capability、NexTide CLI、长任务、积分、临时文件或失败处理时先使用本 skill。
---

# NexTide Shared

NexTide Skills 是 NexTide SaaS / 小程序 / n8n / 云端工作流的 Agent-native 入口。

本 skill 是所有 NexTide skills 的共享规则源。

## Core Rule

本地 Agent 只调用稳定 capability contract，不直接调用内部 n8n webhook、云雾 API、Supabase service role、私有 prompt chain 或敏感供应商接口。

默认调用方式：

```bash
npm run nextide -- capability run <capability-id> \
  --input .nextide/input/<name>.json \
  --output .nextide/output/<name>-result.json
```

调试时可以显式传认证参数：

```bash
npm run nextide -- capability run <capability-id> \
  --input .nextide/input/<name>.json \
  --output .nextide/output/<name>-result.json \
  --user-api-key <NEX用户积分API_KEY>
```

可用认证 flags：

- `--auth-token <token>`：作为 `Authorization: Bearer <token>` 转发
- `--user-api-key <key>`：作为 `x-user-api-key` 转发
- `--nexapi-key <key>`：作为 `x-nexapi-key` 转发

## Work Folder Rule

临时文件统一放在当前项目工作目录：

```text
.nextide/
  input/
  output/
  raw/
  normalized/
  reports/
```

最终用户可读交付物可以放到 `.nextide/reports/` 或用户指定路径。

不要把运行时输出写入 installed skill 目录。

## Real File Rule

当 CLI 需要 `--input` 或 `--output` 时，必须先创建真实 JSON 文件，不要通过 shell inline JSON 传大对象。

## Hosted Capability Rule

- 使用 `nextide capability run` 作为闭源能力的唯一支持路径。
- 不要绕过 capability 直接调用 n8n webhook。
- 不要要求用户在聊天里粘贴密钥、cookie、service role key。
- 如果 capability 返回 `capability_unavailable`、`unauthorized`、`quota_exceeded`、`workflow_failed`，停止并如实报告。

## Cost Rule

默认 bounded first pass：

- 社媒采集先 10-30 条
- 评论默认不抓，除非用户明确需要
- 视频/数字人/动作复刻属于高成本长任务，提交前应说明耗时和可能消耗
- 不要一开始做大规模全量采集

新增或修改 NexTide hosted capability / skill 时，凡是会调用付费模型、n8n、RunningHub、云端生图、生视频、音频、LLM 分析或数据采集，都必须接入后台积分配置：

- capability registry 必须声明稳定 `featureKey`
- 同一能力如果不同模型/工作流价格不同，必须声明 `creditModelKey`
- 后端执行链路必须使用后台 `credit_configs`，优先走 `deductConfiguredCredits()` 或既有 Canvas 计费 helper
- 后台配置 key 规则：`featureKey:modelKey` 优先，找不到再回退 `featureKey`
- 扣费失败必须停止付费任务，不要继续触发上游工作流

## Multimodal Artifact Preview Rule

当 capability 返回 artifacts，优先用 artifact-first 工作流，不要只把远程链接粘给用户。

完成 run 后执行：

```bash
npm run nextide -- run artifacts <run-id> \
  --output-dir .nextide/output/<run-id> \
  --download \
  --gallery \
  --datatable
```

该命令会尽量生成：

```text
.nextide/output/<run-id>/
  manifest.json
  summary.json      # Agent 友好的任务摘要、推荐回复、下一步建议
  gallery.html      # 图片画廊
  preview.html      # 图片/视频/音频/JSON 通用多模态预览
  datatable.json    # 可排序/筛选的数据表，若结果可表格化
  <downloaded files>
```

回复用户时优先读取 `summary.json`，并按以下优先级返回：

1. `summary.recommendedResponse.message` 简短摘要；
2. `preview.html` / `gallery.html` 富媒体预览；
3. `datatable.json` 数据表；
4. 本地下载文件路径；
5. 远程 URL；
6. `summary.recommendedResponse.nextActions` 下一步建议。

如果当前 Agent 支持富媒体 block，直接输出：

````markdown
```html-preview
{"src":"/absolute/path/to/preview.html","title":"NexTide 结果预览"}
```
````

数据类结果可以用：

````markdown
```datatable
{"src":"/absolute/path/to/datatable.json","title":"NexTide 数据结果"}
```
````

统一回复模板：

````markdown
已完成：<任务标题>

预览：
```html-preview
{"src":"/absolute/path/to/preview.html","title":"NexTide 结果预览"}
```

数据表：
```datatable
{"src":"/absolute/path/to/datatable.json","title":"NexTide 数据结果"}
```

文件：
- /absolute/path/to/file.ext

下一步你可以：
1. <summary.json 中的 nextActions[0]>
2. <summary.json 中的 nextActions[1]>
```
````

多张图片也可以用：

````markdown
```image-preview
{"title":"生成图片","items":[{"src":"/absolute/path/1.png","title":"第 1 页"},{"src":"/absolute/path/2.png","title":"第 2 页"}]}
```
````

## Long-running Task Rule

数字人、动作复刻、中视频、批量图片生成等任务可能长达 60 分钟。

默认：

- 短任务使用 `--mode wait`
- 长任务使用 `--mode submit`
- 返回 runId 后告诉用户如何查询

查询命令：

```bash
npm run nextide -- run status <run-id>
npm run nextide -- run result <run-id> --output .nextide/output/<run-id>-result.json
```

更推荐使用 follow 命令自动轮询并在成功后导出 artifact bundle：

```bash
npm run nextide -- run follow <run-id> \
  --output-dir .nextide/output/<run-id> \
  --timeout 1800 \
  --interval 5
```

当前 MVP 阶段 run store 可能尚未完整实现。若返回 `run_store_not_implemented`，说明该 capability 已规划但长任务查询层还在实现中。

## Privacy / IP Rule

涉及参考图、参考视频、爆款复刻时：

- 可以学习结构、节奏、镜头、视觉语法、信息层级
- 不复制原作者身份、脸、商标、品牌资产、字幕原句、独特场景
- 需要生成 reference contract 时，明确 `learn` 与 `doNotCopy`

## Human-readable Error Rule

当 CLI 返回 `explanation` 字段，优先把它转成用户可执行的说明，不要只粘贴 raw JSON。

常见结构：

```json
{
  "explanation": {
    "code": "unauthorized",
    "title": "认证失败",
    "message": "缺少或无效的 NexTide 凭证。",
    "nextActions": ["运行 nextide auth login", "运行 nextide status 确认已登录"]
  }
}
```

回复模板：

```text
任务没有继续执行：认证失败。

原因：缺少或无效的 NexTide 凭证。

你可以：
1. 运行 nextide auth login
2. 运行 nextide status 确认已登录
```

## Fail-fast Rule

不要编造采集结果、分析结果、生成 URL 或任务状态。

如果 capability 尚未接通，直接说：

- 该 NexTide capability 已登记但尚未接入 production runner
- 当前可用的相邻能力是什么
- 下一步需要接哪个 API / n8n workflow
