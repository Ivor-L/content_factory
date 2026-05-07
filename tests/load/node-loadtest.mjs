#!/usr/bin/env node

const BASE_URL = (process.env.BASE_URL || 'https://atomx.top').replace(/\/$/, '');
const LOGIN_EMAIL = process.env.LOGIN_EMAIL;
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;
const LOAD_TEST_ID = process.env.LOAD_TEST_ID || '20260506-content-factory';
const MODE = process.env.LOADTEST_MODE || process.argv[2] || 'readonly';
const TARGET_VUS = Number(process.env.TARGET_VUS || process.env.READONLY_TARGET_VUS || 10);
const DURATION_SECONDS = Number(process.env.DURATION_SECONDS || 120);
const RAMP_SECONDS = Number(process.env.RAMP_SECONDS || Math.min(60, Math.floor(DURATION_SECONDS / 3)));
const ENABLE_AI = process.env.ENABLE_AI === '1';

if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
  console.error('Missing LOGIN_EMAIL / LOGIN_PASSWORD');
  process.exit(1);
}

const stats = [];
let failures = 0;
let requests = 0;
let stop = false;

function headers(token, json = false) {
  return {
    'User-Agent': `content-factory-load-test/${LOAD_TEST_ID}`,
    'X-Load-Test': LOAD_TEST_ID,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function timed(name, fn) {
  const start = performance.now();
  let status = 0;
  try {
    const res = await fn();
    status = res.status;
    const duration = performance.now() - start;
    requests += 1;
    stats.push({ name, status, duration });
    if (status >= 500 || status === 0) failures += 1;
    return res;
  } catch (error) {
    const duration = performance.now() - start;
    requests += 1;
    failures += 1;
    stats.push({ name, status: 0, duration, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function login() {
  const res = await timed('POST /api/auth/email/password-login', () => fetch(`${BASE_URL}/api/auth/email/password-login`, {
    method: 'POST',
    headers: headers(null, true),
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  }));
  if (!res || res.status !== 200) {
    const body = res ? await res.text().catch(() => '') : '';
    throw new Error(`login failed: ${res?.status} ${body}`);
  }
  const data = await res.json();
  if (!data.accessToken) throw new Error('login response missing accessToken');
  return data.accessToken;
}

async function getPath(token, path, name = `GET ${path.split('?')[0]}`) {
  return timed(name, () => fetch(`${BASE_URL}${path}`, { headers: headers(token) }));
}

async function createTask(token, suffix) {
  const payload = {
    title: `loadtest_${LOAD_TEST_ID}_${suffix}`,
    ideaText: `线上压力测试任务 ${LOAD_TEST_ID} ${suffix}。用于验证 100 并发用户下任务创建、列表查询、AI阶段生成链路是否稳定。`,
    channel: 'loadtest',
    targetOutput: 'short_article',
    language: 'zh-CN',
    goal: { loadTest: true, loadTestId: LOAD_TEST_ID, createdBy: 'node-loadtest' },
  };
  const res = await timed('POST /api/creative-tasks', () => fetch(`${BASE_URL}/api/creative-tasks`, {
    method: 'POST',
    headers: headers(token, true),
    body: JSON.stringify(payload),
  }));
  if (!res || res.status !== 201) return null;
  const data = await res.json().catch(() => null);
  return data?.data?.id || null;
}

async function generateDiagnosis(token, taskId) {
  return timed('POST /api/creative-tasks/:taskId/generate', () => fetch(`${BASE_URL}/api/creative-tasks/${taskId}/generate`, {
    method: 'POST',
    headers: headers(token, true),
    body: JSON.stringify({ stage: 'diagnosis' }),
  }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SINGLE_ENDPOINT_MODES = {
  profile: { path: '/api/user/profile', name: 'GET /api/user/profile' },
  tasks: { path: '/api/tasks?limit=20', name: 'GET /api/tasks' },
  'creative-tasks': { path: '/api/creative-tasks?limit=20', name: 'GET /api/creative-tasks' },
};

async function readonlyFlow(token, vu, iter) {
  for (const path of ['/', '/dashboard', '/api/user/profile', '/api/creative-tasks?limit=20', '/api/tasks?limit=20']) {
    if (stop) return;
    await getPath(token, path);
    await sleep(100 + Math.random() * 400);
  }
}

async function singleEndpointFlow(token, vu, iter) {
  const endpoint = SINGLE_ENDPOINT_MODES[MODE];
  await getPath(token, endpoint.path, endpoint.name);
  await sleep(100 + Math.random() * 400);
}

async function writeFlow(token, vu, iter) {
  const taskId = await createTask(token, `${vu}-${iter}-${Date.now()}`);
  await sleep(300 + Math.random() * 1000);
  if (taskId) await getPath(token, `/api/creative-tasks/${taskId}`, 'GET /api/creative-tasks/:taskId');
  await sleep(300 + Math.random() * 1000);
  await getPath(token, '/api/creative-tasks?limit=20');
}

async function aiFlow(token, vu, iter) {
  if (!ENABLE_AI) throw new Error('AI disabled. Set ENABLE_AI=1');
  const taskId = await createTask(token, `ai-${vu}-${iter}-${Date.now()}`);
  if (!taskId) return;
  await sleep(1000 + Math.random() * 2000);
  await generateDiagnosis(token, taskId);
  await sleep(1000);
  await getPath(token, `/api/creative-tasks/${taskId}`, 'GET /api/creative-tasks/:taskId');
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function printSummary() {
  const durations = stats.map((s) => s.duration);
  const byStatus = new Map();
  for (const s of stats) byStatus.set(s.status, (byStatus.get(s.status) || 0) + 1);
  console.log('\n=== Load Test Summary ===');
  console.log(JSON.stringify({ mode: MODE, baseUrl: BASE_URL, targetVus: TARGET_VUS, durationSeconds: DURATION_SECONDS, requests, failures, failureRate: requests ? failures / requests : 0 }, null, 2));
  console.log('status:', Object.fromEntries([...byStatus.entries()].sort((a, b) => a[0] - b[0])));
  console.log('latency_ms:', {
    p50: Math.round(percentile(durations, 50)),
    p95: Math.round(percentile(durations, 95)),
    p99: Math.round(percentile(durations, 99)),
    max: Math.round(Math.max(0, ...durations)),
  });
  const slow = [...stats].sort((a, b) => b.duration - a.duration).slice(0, 10).map((s) => ({ name: s.name, status: s.status, ms: Math.round(s.duration), error: s.error }));
  console.table(slow);
}

async function worker(token, vu, flow) {
  let iter = 0;
  while (!stop) {
    iter += 1;
    await flow(token, vu, iter).catch((error) => {
      failures += 1;
      console.error(`[VU ${vu}]`, error.message);
    });
  }
}

async function main() {
  console.log(`Starting node load test: mode=${MODE}, targetVus=${TARGET_VUS}, duration=${DURATION_SECONDS}s, base=${BASE_URL}`);
  const token = await login();
  const flow = MODE === 'write' ? writeFlow : MODE === 'ai' ? aiFlow : SINGLE_ENDPOINT_MODES[MODE] ? singleEndpointFlow : readonlyFlow;
  const workers = [];
  for (let vu = 1; vu <= TARGET_VUS; vu += 1) {
    const delay = RAMP_SECONDS > 0 ? Math.floor((vu - 1) * (RAMP_SECONDS * 1000 / TARGET_VUS)) : 0;
    workers.push((async () => {
      await sleep(delay);
      if (!stop) await worker(token, vu, flow);
    })());
  }
  const printer = setInterval(() => {
    const recent = stats.slice(-200).map((s) => s.duration);
    console.log(`[progress] requests=${requests} failures=${failures} recent_p95=${Math.round(percentile(recent, 95))}ms`);
  }, 10000);
  await sleep(DURATION_SECONDS * 1000);
  stop = true;
  clearInterval(printer);
  await Promise.allSettled(workers);
  printSummary();
  if (requests > 0 && failures / requests > 0.02) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
