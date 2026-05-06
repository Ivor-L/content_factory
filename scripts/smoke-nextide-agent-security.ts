import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const cliConfigPath = path.join(os.homedir(), '.nextide', 'config.json');
const cliConfig = await loadCliConfig();
const apiBaseUrl = process.env.NEXTIDE_API_BASE_URL
  || process.argv.find((arg) => arg.startsWith('--api-base-url='))?.split('=')[1]
  || cliConfig.apiBaseUrl
  || 'https://atomx.top';
const userApiKey = process.env.NEXTIDE_USER_API_KEY
  || process.argv.find((arg) => arg.startsWith('--user-api-key='))?.split('=')[1]
  || cliConfig.userApiKey
  || '';
const outDir = path.join(root, '.nextide', 'output', 'smoke-agent-runtime');
const inputFile = path.join(root, '.nextide', 'input', 'xhs.card.layout.json');

type Check = { name: string; ok: boolean; details?: unknown };
type CliConfig = { apiBaseUrl?: string; userApiKey?: string; authToken?: string };
const checks: Check[] = [];

async function loadCliConfig(): Promise<CliConfig> {
  if (!existsSync(cliConfigPath)) return {};
  try {
    return JSON.parse(await readFile(cliConfigPath, 'utf8')) as CliConfig;
  } catch {
    return {};
  }
}

async function requestJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { res, data };
}

async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const details = await fn();
    checks.push({ name, ok: true, details });
    console.log(`✓ ${name}`);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    checks.push({ name, ok: false, details });
    console.error(`✗ ${name}: ${details}`);
  }
}

function headers(withKey = true): HeadersInit {
  return {
    'content-type': 'application/json',
    ...(withKey && userApiKey ? { 'x-user-api-key': userApiKey } : {}),
  };
}

function assertStatus(actual: number, expected: number, data: unknown, options?: { allowPreDeployUnauthorized400?: boolean }) {
  if (actual === expected) return;
  if (options?.allowPreDeployUnauthorized400 && expected === 401 && actual === 400) {
    const code = (data as { run?: { error?: { code?: string } }; error?: { code?: string } })?.error?.code
      || (data as { run?: { error?: { code?: string } } })?.run?.error?.code;
    if (code === 'unauthorized') return;
  }
  throw new Error(`Expected HTTP ${expected}, got ${actual}: ${JSON.stringify(data)}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  await check('capability_list', async () => {
    const { res, data } = await requestJson(`${apiBaseUrl}/api/agent/capabilities`);
    assertStatus(res.status, 200, data);
    const capabilities = (data as { capabilities?: unknown[] }).capabilities || [];
    if (!Array.isArray(capabilities) || capabilities.length < 1) throw new Error('No capabilities returned');
    return { count: capabilities.length };
  });

  await check('credit_config_audit', async () => {
    const { res, data } = await requestJson(`${apiBaseUrl}/api/agent/capabilities?includeCreditAudit=1`, { headers: headers(Boolean(userApiKey)) });
    assertStatus(res.status, 200, data);
    const audit = (data as { creditAudit?: { ok?: boolean; missingFeatureKey?: unknown[]; missingCreditConfig?: unknown[]; disabledCreditConfig?: unknown[] } }).creditAudit;
    if (!audit) return { skipped: 'server_does_not_expose_creditAudit_yet' };
    if (!audit.ok) throw new Error(JSON.stringify(audit));
    return audit;
  });

  await check('anonymous_run_401', async () => {
    const { res, data } = await requestJson(`${apiBaseUrl}/api/agent/capabilities/xhs.card.layout/run`, {
      method: 'POST',
      headers: headers(false),
      body: JSON.stringify({ input: { markdown: '# anonymous smoke' }, mode: 'wait' }),
    });
    assertStatus(res.status, 401, data, { allowPreDeployUnauthorized400: true });
    return { ...(typeof data === 'object' && data ? data : { data }), acceptedPreDeploy400: res.status === 400 };
  });

  await check('invalid_key_run_401', async () => {
    const { res, data } = await requestJson(`${apiBaseUrl}/api/agent/capabilities/xhs.card.layout/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-api-key': 'invalid-nextide-api-key' },
      body: JSON.stringify({ input: { markdown: '# invalid key smoke' }, mode: 'wait' }),
    });
    assertStatus(res.status, 401, data, { allowPreDeployUnauthorized400: true });
    return { ...(typeof data === 'object' && data ? data : { data }), acceptedPreDeploy400: res.status === 400 };
  });

  if (!userApiKey) {
    checks.push({ name: 'authorized_low_cost_run', ok: true, details: { skipped: 'NEXTIDE_USER_API_KEY not set' } });
    console.log('→ authorized_low_cost_run skipped: NEXTIDE_USER_API_KEY not set');
  } else {
    await check('authorized_low_cost_run', async () => {
      const input = JSON.parse(await readFile(inputFile, 'utf8'));
      const { res, data } = await requestJson(`${apiBaseUrl}/api/agent/capabilities/xhs.card.layout/run`, {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ input, mode: 'wait', client: { agent: 'smoke-nextide-agent-security' } }),
      });
      assertStatus(res.status, 200, data);
      const run = (data as { run?: { runId?: string; status?: string } }).run;
      if (!run?.runId) throw new Error(`Missing runId: ${JSON.stringify(data)}`);
      if (run.status !== 'succeeded') throw new Error(`Expected succeeded, got ${run.status}`);
      await writeFile(path.join(outDir, 'authorized-low-cost-run.json'), JSON.stringify(data, null, 2));
      return { runId: run.runId, status: run.status };
    });

    const runCheck = checks.find((item) => item.name === 'authorized_low_cost_run');
    const runId = (runCheck?.details as { runId?: string } | undefined)?.runId;
    if (runId) {
      await check('run_status_owner_read', async () => {
        const { res, data } = await requestJson(`${apiBaseUrl}/api/agent/runs/${encodeURIComponent(runId)}`, { headers: headers(true) });
        assertStatus(res.status, 200, data);
        await writeFile(path.join(outDir, 'run-status.json'), JSON.stringify(data, null, 2));
        return { status: (data as { run?: { status?: string } }).run?.status };
      });

      await check('run_result_owner_read', async () => {
        const { res, data } = await requestJson(`${apiBaseUrl}/api/agent/runs/${encodeURIComponent(runId)}/result`, { headers: headers(true) });
        assertStatus(res.status, 200, data);
        await writeFile(path.join(outDir, 'run-result.json'), JSON.stringify(data, null, 2));
        return { artifactCount: ((data as { artifacts?: unknown[] }).artifacts || []).length };
      });

      await check('cancel_completed_run_409', async () => {
        const { res, data } = await requestJson(`${apiBaseUrl}/api/agent/runs/${encodeURIComponent(runId)}/cancel`, {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify({}),
        });
        if (res.status === 404) return { skipped: 'server_does_not_expose_run_cancel_yet' };
        assertStatus(res.status, 409, data);
        const code = (data as { error?: { code?: string } }).error?.code;
        if (code !== 'run_not_cancellable') throw new Error(`Expected run_not_cancellable, got ${JSON.stringify(data)}`);
        return data;
      });
    }
  }

  await check('cancel_missing_run_404', async () => {
    const { res, data } = await requestJson(`${apiBaseUrl}/api/agent/runs/run_missing_smoke/cancel`, {
      method: 'POST',
      headers: headers(Boolean(userApiKey)),
      body: JSON.stringify({}),
    });
    if (res.status === 404) return data;
    if (res.status === 401 && !userApiKey) return { skipped: 'requires_user_api_key_after_cancel_endpoint_is_deployed' };
    throw new Error(`Expected HTTP 404, got ${res.status}: ${JSON.stringify(data)}`);
  });

  const report = {
    ok: checks.every((item) => item.ok),
    apiBaseUrl,
    hasUserApiKey: Boolean(userApiKey),
    userApiKeySource: process.env.NEXTIDE_USER_API_KEY
      ? 'env'
      : process.argv.some((arg) => arg.startsWith('--user-api-key='))
        ? 'flag'
        : cliConfig.userApiKey
          ? cliConfigPath
          : 'none',
    createdAt: new Date().toISOString(),
    checks,
  };
  await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
