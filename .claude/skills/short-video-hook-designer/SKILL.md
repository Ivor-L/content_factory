---
name: short-video-hook-designer
description: NexTide 短视频 Hook 设计器。把模糊短视频开头、产品卖点、脚本想法或参考账号打法，转成明确 Hook Brief：观众问题、开头机制、产品露出时机、风险和下游交付。适合“开头怎么写”“这个 hook 太弱”“前 3 秒怎么抓人”“产品别太早露出”“帮我设计短视频开头机制”。
allowed-tools: Read, Write
---

# Short Video Hook Designer

Use this skill before writing provider-ready video prompts or storyboards.

It is for:

- turning rough short-form ideas into a stable Hook Brief
- making the first 1-3 seconds mechanism explicit
- deciding product reveal timing
- avoiding ad-like product-first openings
- handing off to `reference-opening-decoder`, `visual-hook-optimizer`, or `video-prompt-preflight-qa`

It is not for:

- running NexTide generation capabilities directly
- writing final provider payloads
- replacing product analysis or benchmark collection

## Core Rule

A good opening creates a concrete viewer question before the content feels like an ad.

Do not treat hooks as swipe-file wording. Treat them as mechanism choices:

```text
what makes the viewer stop
why it fits this audience state
when the product is allowed to enter
what failure signal means the hook is weak
```

## Hook Mechanisms

Choose one primary mechanism:

1. `boldClaim` — challenges a stale belief.
2. `questionGap` — opens a real unanswered question.
3. `proofFirst` — trust barrier is solved with visible evidence.
4. `painRecognition` — viewer recognizes a specific lived problem.
5. `patternInterrupt` — feed sameness is broken by an unexpected first beat.
6. `socialOrIdentityStake` — the real pain is confidence, status, belonging, or presentation.

## Required Output

Always output this block first:

```text
Hook goal:
Audience state:
Specific pain or desire:
Viewer self-identification cue:
Hook mechanism:
Opening line or opening move:
Listener reaction:
Problem deepening:
Product reveal rule:
Why this mechanism fits:
Success metric:
Hook risks:
Next handoff:
```

## Workflow

1. Clarify audience state and desired viewer question.
2. Pick one dominant hook mechanism.
3. Decide whether product appears in the opening, after proof/problem, or not until later.
4. Write 3-5 opening variants only after the mechanism is locked.
5. Handoff:
   - reference exists → `reference-opening-decoder`
   - first frame is weak → `visual-hook-optimizer`
   - prompt/storyboard already exists → `video-prompt-preflight-qa`
   - ready to generate → relevant NexTide generation skill

## Failure Mode

Stop and ask for clarification if you cannot determine:

- who the viewer is
- what the viewer should recognize or ask
- which mechanism is carrying stop-scroll
- whether product reveal should be delayed

Do not polish vague taste words like “viral / premium / cinematic / scroll-stopping” without mechanism.

## References

- `references/hook-principles.md`
- `references/hook-examples.md`
- `references/NOTICE.md`

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## NexTide Capability Contract

### 短视频 Hook 设计

- Capability: `content.hook.design`
- Version: `0.2.0`
- Category: `writing`
- Status: `available`
- Execution: `local_agent`
- Async: `false`
- Cost level: `free`
- Required auth: `nexTideApiKey`
- Required env: `none`
- Required plan: `none`
- Rate limit: `none`
- Estimated credits: 0
- Estimated duration: 60 seconds
- Tags: `hook`, `short-video`, `local-agent`, `pre-generation`

Description:

把模糊短视频开头、产品卖点或脚本想法转成明确 Hook Brief：观众问题、开头机制、产品露出时机、风险和下游交付。

Examples:

- 短视频 Hook Brief

  ```json
  {
    "brief": "便携榨汁杯，目标用户是上班族，想做 15 秒 TikTok 种草视频",
    "audience": "久坐上班族",
    "productRevealPreference": "delayed"
  }
  ```

Input fields:

- `brief` (string, required)：短视频开头想法、产品卖点或脚本需求。
- `audience` (string)：目标观众。
- `productRevealPreference` (string)：产品露出偏好：early / delayed / hidden-until-proof。

Output fields:

- `hookBrief` (object)：Hook goal、viewer question、mechanism、product reveal rule 等。

CLI:

```bash
nextide capability run content.hook.design \
  --input .nextide/input/content.hook.design.json \
  --output .nextide/output/content.hook.design-result.json \
  --mode wait
```

If the result contains artifacts, export them:

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/content.hook.design-result.json'); console.log(r.run && r.run.runId)")
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
