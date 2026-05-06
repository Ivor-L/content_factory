import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

export const loginTrend = new Trend('loadtest_login_duration');
export const authFailureRate = new Rate('loadtest_auth_failures');

export const BASE_URL = (__ENV.BASE_URL || 'https://atomx.top').replace(/\/$/, '');
export const LOAD_TEST_ID = __ENV.LOAD_TEST_ID || '20260506-content-factory';

export function commonHeaders(extra = {}) {
  return {
    'User-Agent': `content-factory-load-test/${LOAD_TEST_ID}`,
    'X-Load-Test': LOAD_TEST_ID,
    ...extra,
  };
}

export function jsonHeaders(token, extra = {}) {
  return commonHeaders({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  });
}

export function requireEnv(name) {
  const value = __ENV[name];
  if (!value) {
    fail(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function login() {
  const email = requireEnv('LOGIN_EMAIL');
  const password = requireEnv('LOGIN_PASSWORD');
  const res = http.post(
    `${BASE_URL}/api/auth/email/password-login`,
    JSON.stringify({ email, password }),
    {
      headers: jsonHeaders(null),
      tags: { name: 'POST /api/auth/email/password-login' },
      timeout: '30s',
    },
  );

  loginTrend.add(res.timings.duration);
  const ok = check(res, {
    'login status is 200': (r) => r.status === 200,
    'login has access token': (r) => Boolean(r.json('accessToken')),
  });
  authFailureRate.add(!ok);
  if (!ok) {
    fail(`Login failed: status=${res.status}, body=${res.body}`);
  }
  return res.json('accessToken');
}

export function createCreativeTask(token, suffix = `${__VU}-${__ITER}-${Date.now()}`) {
  const payload = {
    title: `loadtest_${LOAD_TEST_ID}_${suffix}`,
    ideaText: `线上压力测试任务 ${LOAD_TEST_ID} ${suffix}。用于验证 100 并发用户下任务创建、列表查询、AI阶段生成链路是否稳定。`,
    channel: 'loadtest',
    targetOutput: 'short_article',
    language: 'zh-CN',
    goal: {
      loadTest: true,
      loadTestId: LOAD_TEST_ID,
      createdBy: 'k6',
    },
  };

  return http.post(`${BASE_URL}/api/creative-tasks`, JSON.stringify(payload), {
    headers: jsonHeaders(token),
    tags: { name: 'POST /api/creative-tasks' },
    timeout: '30s',
  });
}

export function randomThinkTime(min = 0.5, max = 2) {
  sleep(min + Math.random() * (max - min));
}
