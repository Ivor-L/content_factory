# NexTide Agent Runtime Deploy Safety Checklist

> Date: 2026-05-06
> Scope: Agent Capability Runtime, unified auth, owner checks, credit config, credit hold/capture/release, CLI, Skills release.

## 0. Release artifacts

Before deployment, regenerate all release artifacts:

```bash
npm run typecheck
npx prisma generate
npm run capabilities:export
npm run skills:generate
npm run build:nextide-cli
npm run nextide:pack
npm run skills:package
npm run release:agent-runtime
```

Expected outputs:

```text
artifacts/capabilities/capabilities.json
artifacts/skills/nextide-skills.zip
artifacts/cli/nextide-cli-0.2.0.tgz
artifacts/release/nextide-agent-runtime-0.2.0.zip
```

## 1. Database migrations

Deploy migrations before routing traffic to the new app code:

```bash
npx prisma migrate deploy
```

Required Agent runtime migrations:

```text
20260506090000_add_agent_capability_runs
20260506091000_add_agent_cli_device_logins
20260506100000_add_agent_capability_credit_holds
```

Verify tables:

```sql
select to_regclass('public.agent_capability_runs');
select to_regclass('public.agent_cli_device_logins');
select to_regclass('public.agent_capability_credit_holds');
```

All must return non-null table names.

## 2. Required environment variables

Run:

```bash
nextide doctor --api-base-url https://atomx.top
```

Then check capability env hints from:

```bash
curl https://atomx.top/api/agent/capabilities | jq '.capabilities[] | select(.requiredEnv | length > 0) | {id, requiredEnv}'
```

Typical env groups:

```text
N8N_*_WEBHOOK
SOCIAL_SCRAPER_APIFY_TOKEN / APIFY_API_TOKEN
NEXT_PUBLIC_APP_URL / APP_BASE_URL equivalent callback base
DATABASE_URL / direct DB URL for migrations
```

## 3. Unified credit config audit

Agent capability pricing must reuse existing feature keys in `public.credit_configs`.

Check via API:

```bash
curl 'https://atomx.top/api/agent/capabilities?includeCreditAudit=1' \
  -H 'x-user-api-key: <NexTide API Key>' | jq '.creditAudit'
```

Expected:

```json
{
  "ok": true,
  "missingFeatureKey": [],
  "missingCreditConfig": [],
  "disabledCreditConfig": []
}
```

If not ok, fix in admin:

```text
/admin/credits → Agent 功能积分检查 → 一键修复
```

## 4. API auth security checks

### 4.1 Anonymous run must be blocked

```bash
curl -i -X POST 'https://atomx.top/api/agent/capabilities/xhs.card.layout/run' \
  -H 'content-type: application/json' \
  --data '{"input":{"markdown":"# test"},"mode":"wait"}'
```

Expected:

```text
HTTP 401
error.code = unauthorized
```

### 4.2 Invalid key must be blocked

```bash
curl -i -X POST 'https://atomx.top/api/agent/capabilities/xhs.card.layout/run' \
  -H 'content-type: application/json' \
  -H 'x-user-api-key: invalid' \
  --data '{"input":{"markdown":"# test"},"mode":"wait"}'
```

Expected:

```text
HTTP 401
error.code = unauthorized
```

### 4.3 Valid key should work

```bash
nextide capability run xhs.card.layout \
  --api-base-url https://atomx.top \
  --input .nextide/input/xhs.card.layout.json \
  --output .nextide/output/deploy-xhs-card-result.json \
  --mode wait
```

Expected:

```text
run.status = succeeded
```

## 5. Run owner checks

### 5.1 Missing key on run status/result

```bash
curl -i 'https://atomx.top/api/agent/runs/<run-id>'
curl -i 'https://atomx.top/api/agent/runs/<run-id>/result'
```

Expected:

```text
HTTP 401
```

### 5.2 Wrong user's key on run status/result

Use a run created by user A and key from user B:

```bash
curl -i 'https://atomx.top/api/agent/runs/<run-id>' -H 'x-user-api-key: <user-b-key>'
```

Expected:

```text
HTTP 403
error.code = forbidden
```

Admin keys may read all runs.

## 6. Cost / plan / rate-limit checks

### 6.1 Free user high-cost capability

Use a free-plan account and run a high-cost capability:

```bash
nextide capability run viral.midform.video.generate \
  --api-base-url https://atomx.top \
  --user-api-key <free-user-key> \
  --input .nextide/input/viral.midform.video.generate.json \
  --mode submit
```

Expected:

```text
HTTP 403
error.code = plan_required
```

### 6.2 Rate limit

For medium/high capabilities, repeated calls should eventually return:

```text
HTTP 429
error.code = rate_limited
```

Current skeleton limits:

```text
medium: 10/minute, 60/hour
high/variable: 5/minute, 20/hour
```

## 7. Wallet / credit checks

### 7.1 Insufficient credits

Use a paid-plan account with insufficient wallet balance.

Expected:

```text
HTTP 402
error.code = insufficient_credits
```

### 7.2 Successful run captures hold

For a low-cost successful run:

```sql
select * from public.agent_capability_credit_holds where run_id = '<run-id>';
select * from public.transactions where ref_id = '<run-id>';
select * from public.credit_usage_logs where feature_key = '<feature-key>' order by created_at desc limit 5;
```

Expected:

```text
agent_capability_credit_holds.status = captured
transactions.type = agent_capability_capture
transactions.amount_credits < 0
credit_usage_logs.success = true
```

### 7.3 Failed run releases hold

Force or observe a failed run, then check:

```sql
select status, reason from public.agent_capability_credit_holds where run_id = '<run-id>';
```

Expected:

```text
status = released
```

## 8. Long-running callback checks

Run an async capability with `--wait`:

```bash
nextide capability run viral.midform.video.generate \
  --api-base-url https://atomx.top \
  --input .nextide/input/viral.midform.video.generate.json \
  --output .nextide/output/deploy-viral-midform-result.json \
  --mode submit \
  --wait \
  --timeout 1800 \
  --interval 5
```

Expected:

```text
run.status = succeeded or waiting_callback until webhook arrives
callback updates Agent Run Store
credit hold is captured only after succeeded
```

## 9. Run cancel / cleanup checks

### 9.1 Cancel completed run

Use a succeeded run:

```bash
nextide run cancel <succeeded-run-id> --api-base-url https://atomx.top
```

Expected after cancel API is deployed:

```text
HTTP 409
error.code = run_not_cancellable
```

### 9.2 Cancel missing run

```bash
nextide run cancel run_missing_smoke --api-base-url https://atomx.top
```

Expected:

```text
HTTP 404
error.code = run_not_found
```

### 9.3 Cleanup dry-run

```bash
npm run cleanup:agent-runs -- --older-than-minutes=120 --dry-run
```

Expected:

```text
ok = true
No DB env locally → skipped=true
With DB env → matched/processed report, processed=0 in dry-run
```

### 9.4 Cleanup execute

Only run with production DB access after reviewing dry-run output:

```bash
npm run cleanup:agent-runs -- --older-than-minutes=120 --limit=50
```

Expected:

```text
stale queued/running/waiting_callback runs → timeout
related held credit holds → released
```

## 10. Artifact export checks

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/deploy-viral-midform-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" \
  --api-base-url https://atomx.top \
  --output-dir .nextide/output/$RUN_ID
cat .nextide/output/$RUN_ID/manifest.json
```

Expected:

```text
manifest.json exists
json/text artifacts written locally
remote URL artifacts recorded in manifest
```

## 11. Device Login checks

```bash
nextide auth login --api-base-url https://atomx.top
nextide status --api-base-url https://atomx.top
nextide doctor --api-base-url https://atomx.top
```

Expected:

```text
hasUserApiKey = true
doctor.ok = true
```

## 11. Rollback notes

If production issues occur:

1. Disable high-cost Agent capabilities by setting their registry status to `disabled` and redeploy.
2. Disable corresponding `credit_configs.enabled=false` for affected feature keys.
3. Temporarily block `POST /api/agent/capabilities/[id]/run` at edge/proxy if abuse is active.
4. Do not drop `agent_capability_credit_holds`; keep audit trail.

## 12. Post-deploy monitoring

Monitor:

```sql
select capability_id, status, count(*)
from public.agent_capability_runs
group by capability_id, status
order by count(*) desc;

select capability_id, status, count(*)
from public.agent_capability_credit_holds
group by capability_id, status
order by count(*) desc;

select type, count(*), sum(amount_credits)
from public.transactions
where type = 'agent_capability_capture'
group by type;
```

Watch for:

```text
capture_failed spikes
rate_limited spikes
insufficient_credits spikes
waiting_callback runs older than expected maxWaitSeconds
```
