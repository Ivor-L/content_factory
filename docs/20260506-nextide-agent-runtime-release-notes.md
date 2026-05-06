# NexTide Agent Runtime Phase 2 Release Notes

> Date: 2026-05-06
> Product: NexTide Agent Runtime / Skills Runtime
> App: `content-factory-web 3.2`
> Online base URL: `https://atomx.top`

## 1. Overview

Phase 2 turns NexTide's closed-source SaaS, miniapp, n8n, and server workflows into a production-oriented Agent Skills Runtime.

The runtime now provides:

```text
Stable capability IDs
NexTide CLI
Device Login
Agent Run Store
Long-running callback status loop
Capability metadata / exports
Generated skills
Release bundle
Unified API key auth
Run owner checks
Unified credit config integration
Credit hold + capture/release
Admin visibility and repair actions
Smoke scripts
Deploy safety checklist
```

## 2. Capability surface

Current capability count:

```text
14
```

Capabilities:

```text
xhs.note.collect
xhs.card.layout
xhs.infographic.style.extract
xhs.infographic.generate
product.selling_point.analysis
digital-human.video.generate
motion.replication.image_to_video
viral.midform.video.generate
social.tiktok.collect
social.instagram.collect
social.facebook.collect
social.comments.collect
viral.breakdown.video_prompts
content.wechat.longform.write
```

Capability registry is split by domain:

```text
lib/agent-capabilities/registry.ts
lib/agent-capabilities/registry/xhs.ts
lib/agent-capabilities/registry/video.ts
lib/agent-capabilities/registry/social.ts
lib/agent-capabilities/registry/product.ts
lib/agent-capabilities/registry/writing.ts
lib/agent-capabilities/registry/enrich.ts
```

## 3. Public Agent APIs

### Capability list

```http
GET /api/agent/capabilities
GET /api/agent/capabilities?includeCreditAudit=1
```

### Capability run

```http
POST /api/agent/capabilities/[id]/run
```

Requires NexTide API Key.

### Run status/result

```http
GET /api/agent/runs/[id]
GET /api/agent/runs/[id]/result
```

Requires NexTide API Key and owner/admin permission.

### Device Login

```http
POST /api/agent/auth/device/code
POST /api/agent/auth/device/token
POST /api/agent/auth/device/approve
POST /api/agent/auth/device/manual-token
```

Device Login returns the user's registration API key from:

```text
public.profiles.api_key
```

This is called **NexTide API Key**.

## 4. Security changes

### Unified API Key auth

Agent write/read APIs now use:

```text
x-user-api-key: <profiles.api_key>
x-nextide-api-key: <profiles.api_key>
Authorization: Bearer <profiles.api_key>
```

Protected endpoints:

```text
POST /api/agent/capabilities/[id]/run
GET /api/agent/runs/[id]
GET /api/agent/runs/[id]/result
```

Rules:

```text
Missing/invalid key → 401 unauthorized
Banned user → 403 forbidden
Run owner mismatch → 403 forbidden
Admin user → may read all runs
Historical run.userId=null → temporarily readable for backward compatibility
```

Security helpers:

```text
lib/agent-auth/api-key.ts
```

## 5. Agent Run Store

Run store table:

```text
public.agent_capability_runs
```

Prisma model:

```text
AgentCapabilityRun
```

Core services:

```text
lib/agent-runs/store.ts
lib/agent-runs/business-status.ts
lib/agent-runs/callback-updates.ts
lib/agent-runs/normalize.ts
```

Run status supports:

```text
queued
running
waiting_callback
succeeded
failed
cancelled
timeout
```

Long-running tasks return `waiting_callback` and later update through webhooks/business status resolution.

## 6. Result normalization and artifacts

`GET /api/agent/runs/[id]/result` returns normalized structure:

```json
{
  "run": {},
  "result": {},
  "artifacts": [],
  "business": {},
  "error": null
}
```

Artifact normalization covers:

```text
viral.midform.video.generate       → storyboard-shots.json / storyboard-task.json / video artifact
viral.breakdown.video_prompts      → video-prompts.json
xhs.card.layout                    → xhs-card-pages.json
xhs.infographic.generate           → image artifacts
digital-human.video.generate       → digital-human.mp4
motion.replication.image_to_video  → motion-replication.mp4
social.*                           → social-items.json
product.selling_point.analysis     → product-selling-points.json
content.wechat.longform.write      → wechat-article.md
```

CLI artifact export:

```bash
nextide run artifacts <run-id> --output-dir .nextide/output/<run-id>
```

Writes:

```text
manifest.json
json/text artifacts as local files
remote URL artifacts into manifest
```

## 7. CLI

Package:

```text
packages/nextide-cli
@nextide/cli@0.2.0
```

Tarball:

```text
artifacts/cli/nextide-cli-0.2.0.tgz
```

Install:

```bash
npm install -g ./artifacts/cli/nextide-cli-0.2.0.tgz
```

Commands:

```bash
nextide auth login
nextide status
nextide doctor
nextide capability list
nextide capability list --examples
nextide capability example <id> --output input.json
nextide capability run <id> --input input.json --output result.json --mode submit --wait
nextide run status <run-id>
nextide run wait <run-id> --timeout 1800 --interval 5
nextide run result <run-id> --output result.json
nextide run artifacts <run-id> --output-dir .nextide/output/<run-id>
```

CLI config priority:

```text
CLI flags > environment variables > ~/.nextide/config.json > defaults
```

CLI config path:

```text
~/.nextide/config.json
```

## 8. Skills

Generated project skills:

```text
.claude/skills/nextide-shared
.claude/skills/nextide-skill-router-cn
.claude/skills/xiaohongshu-note-collector
.claude/skills/xiaohongshu-card-layout
.claude/skills/xiaohongshu-infographic-generator
.claude/skills/product-selling-point-analysis
.claude/skills/digital-human-generator
.claude/skills/motion-replication
.claude/skills/viral-midform-video-generator
.claude/skills/social-data-collector
.claude/skills/viral-breakdown-to-video-prompts
.claude/skills/wechat-longform-writer
```

Skills are generated from capability registry via:

```bash
npm run skills:generate
```

Release zip:

```text
artifacts/skills/nextide-skills.zip
```

Skills use artifact-first workflow:

```bash
nextide capability run <id> --mode submit --wait --output result.json
RUN_ID=$(node -e "const r=require('./result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" --output-dir .nextide/output/$RUN_ID
```

## 9. Release bundle

Command:

```bash
npm run release:agent-runtime
```

Output:

```text
artifacts/release/nextide-agent-runtime-0.2.0.zip
```

Contents:

```text
nextide-agent-runtime-0.2.0/
  cli/nextide-cli-0.2.0.tgz
  skills/nextide-skills.zip
  capabilities/capabilities.json
  capabilities/*.input.schema.json
  fixtures/*.json
  manifest.json
  INSTALL.md
```

## 10. Unified credit config and billing

Agent capabilities now reuse the existing credit system:

```text
public.credit_configs
lib/creditCosts.ts#getCreditCostForModel()
```

No separate Agent pricing table is used.

Current featureKey mapping:

```text
xhs.note.collect                    → smart_creation
xhs.card.layout                     → smart_creation
xhs.infographic.style.extract       → xhs_vision_style_web
xhs.infographic.generate            → smart_creation
digital-human.video.generate        → digital_human
motion.replication.image_to_video   → action_transfer
viral.midform.video.generate        → storyboard_video
viral.breakdown.video_prompts       → image_text_replication
social.tiktok.collect               → social_tiktok_collect
social.instagram.collect            → monetization_channels_video_share
social.facebook.collect             → monetization_channels_video_share
social.comments.collect             → monetization_channels_video_share
product.selling_point.analysis      → product_analysis
content.wechat.longform.write       → script_generation
```

Pricing lookup priority:

```text
featureKey:modelKey
featureKey
fallback default
```

## 11. Credit hold / capture / release

New table:

```text
public.agent_capability_credit_holds
```

Prisma model:

```text
AgentCapabilityCreditHold
```

Flow:

```text
quota preflight reads credit_configs.amount
  ↓
checks wallets.balance_credits
  ↓
creates AgentCapabilityRun
  ↓
creates AgentCapabilityCreditHold(status=held)
  ↓
run succeeded → capture
run failed/cancelled/timeout → release
```

Capture writes:

```text
wallets.balance_credits decrement
transactions type=agent_capability_capture
credit_usage_logs success=true
hold.status=captured
```

Failure release:

```text
hold.status=released
no wallet deduction
```

Capture is idempotent and only acts on:

```text
hold.status = held
```

If wallet balance is insufficient at capture time:

```text
hold.status = capture_failed
reason = insufficient_credits_at_capture
```

## 12. Cost guard / rate limit

Cost metadata:

```text
costLevel
requiredPlan
rateLimit
estimatedCredits
```

Current skeleton rules:

```text
free / low      no rate limit
medium          10/minute, 60/hour
high / variable 5/minute, 20/hour and requires paid plan
admin           bypasses guard
```

Paid plans:

```text
pro
plus
premium
team
enterprise
```

Errors:

```text
403 plan_required
429 rate_limited
402 insufficient_credits
```

## 13. Admin credits UI

Admin page:

```text
/admin/credits
app/(admin)/admin/credits/page.tsx
```

Agent visibility added:

```text
Agent ×N badge
Agent capability IDs under feature name
CSV column: agentCapabilities
```

Admin audit/fix:

```text
Agent 功能积分检查
一键修复
```

Fix API:

```http
POST /api/admin/credits/agent-audit/fix
```

Actions:

```text
fix_all
create_missing
enable_disabled
```

## 14. Smoke and deployment checks

Deploy checklist:

```text
docs/20260506-nextide-agent-runtime-deploy-checklist.md
```

Smoke script:

```bash
npm run smoke:agent-runtime -- --api-base-url=https://atomx.top
```

Smoke reads CLI config automatically:

```text
~/.nextide/config.json
```

Smoke checks:

```text
capability_list
credit_config_audit
anonymous_run_401
invalid_key_run_401
authorized_low_cost_run
run_status_owner_read
run_result_owner_read
```

Validated run:

```text
run_e74c3862-1c53-4587-81f1-7216d81c4885
```

## 15. Required migrations

Required migrations for this release:

```text
20260506090000_add_agent_capability_runs
20260506091000_add_agent_cli_device_logins
20260506100000_add_agent_capability_credit_holds
```

Before deploying app code:

```bash
npx prisma migrate deploy
```

Then:

```bash
npx prisma generate
```

## 16. Compatibility notes

### Historical run owner checks

Runs with:

```text
userId = null
```

are temporarily readable for backward compatibility.

### Pre-deploy auth behavior

Before unified auth guard is deployed, anonymous capability run may return:

```text
HTTP 400 + run.error.code=unauthorized
```

After deployment, expected response is:

```text
HTTP 401 + error.code=unauthorized
```

Smoke script accepts the pre-deploy 400 form and marks:

```text
acceptedPreDeploy400 = true
```

## 17. Deployment order

Recommended order:

```text
1. Deploy database migrations
2. Deploy app/server code
3. Run /admin/credits Agent 功能积分检查 → 一键修复 if needed
4. Run nextide doctor
5. Run npm run smoke:agent-runtime
6. Run authorized smoke with CLI config or NEXTIDE_USER_API_KEY
7. Test one async workflow with --wait
8. Test run artifacts
9. Monitor credit holds and run status
```

## 18. Rollback strategy

If issues occur:

```text
1. Disable high-cost capabilities in registry and redeploy
2. Disable affected credit_configs.enabled=false
3. Temporarily block POST /api/agent/capabilities/[id]/run at proxy/edge
4. Keep agent_capability_credit_holds for audit
5. Do not drop run store tables during rollback
```

## 19. Known follow-ups / Phase 3 candidates

```text
Per-user plan policy from product config rather than hardcoded paid plan set
Credit hold admin viewer
Run history UI for users
Run cancel endpoint
Bulk cleanup for stale waiting_callback runs
Provider-level cost reconciliation
More capabilities beyond first 14
More precise per-unit billing for storyboard/image/video counts
Agent capability marketplace / install UI
Skill package auto-install helpers
```

## 20. Final validation commands

```bash
npm run typecheck
npx prisma generate
npm run capabilities:export
npm run skills:generate
npm run build:nextide-cli
npm run nextide:pack
npm run skills:package
npm run release:agent-runtime
npm run smoke:agent-runtime -- --api-base-url=https://atomx.top
```

Current local validation status:

```text
typecheck: pass
build:nextide-cli: pass
capabilities:export: pass
skills:generate: pass
smoke:agent-runtime against https://atomx.top: pass
```
