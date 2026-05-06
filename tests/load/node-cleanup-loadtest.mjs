#!/usr/bin/env node

const BASE_URL = (process.env.BASE_URL || 'https://atomx.top').replace(/\/$/, '');
const LOGIN_EMAIL = process.env.LOGIN_EMAIL;
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;
const LOAD_TEST_ID = process.env.LOAD_TEST_ID || '20260506-content-factory';
const DRY_RUN = process.env.DRY_RUN !== '0';

if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
  console.error('Missing LOGIN_EMAIL / LOGIN_PASSWORD');
  process.exit(1);
}

function headers(token, json = false) {
  return {
    'User-Agent': `content-factory-load-test-cleanup/${LOAD_TEST_ID}`,
    'X-Load-Test': LOAD_TEST_ID,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/email/password-login`, {
    method: 'POST',
    headers: headers(null, true),
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.accessToken;
}

function isLoadTestTask(task) {
  const title = String(task?.title || '');
  const ideaText = String(task?.ideaText || '');
  const channel = String(task?.channel || '');
  return title.includes(`loadtest_${LOAD_TEST_ID}`) || ideaText.includes(LOAD_TEST_ID) || channel === 'loadtest';
}

async function fetchBatch(token) {
  const res = await fetch(`${BASE_URL}/api/creative-tasks?limit=100`, { headers: headers(token) });
  if (res.status !== 200) throw new Error(`list failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data.data) ? data.data.filter(isLoadTestTask) : [];
}

async function main() {
  const token = await login();
  const seen = new Set();
  let deleted = 0;
  let round = 0;

  while (round < 20) {
    round += 1;
    const tasks = (await fetchBatch(token)).filter((task) => !seen.has(task.id));
    if (tasks.length === 0) break;

    console.table(tasks.map((task) => ({ id: task.id, title: task.title, createdAt: task.createdAt })));
    for (const task of tasks) {
      seen.add(task.id);
      if (!DRY_RUN) {
        const res = await fetch(`${BASE_URL}/api/creative-tasks/${task.id}`, {
          method: 'DELETE',
          headers: headers(token),
        });
        if (res.status !== 200) {
          console.error(`delete failed: ${task.id} ${res.status} ${await res.text()}`);
        } else {
          deleted += 1;
        }
      }
    }

    if (DRY_RUN) break;
  }

  console.log(JSON.stringify({ loadTestId: LOAD_TEST_ID, dryRun: DRY_RUN, matched: seen.size, deleted }, null, 2));
  if (DRY_RUN) console.log('Dry run only. Set DRY_RUN=0 to delete via API.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
