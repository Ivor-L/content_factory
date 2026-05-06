import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, createCreativeTask, jsonHeaders, login, randomThinkTime } from './helpers.js';

const targetVus = Number(__ENV.WRITE_TARGET_VUS || 100);
const failedRate = Number(__ENV.HTTP_REQ_FAILED_RATE || 0.01);
const writeP95 = Number(__ENV.WRITE_P95_MS || 2500);

export const options = {
  scenarios: {
    write_ramp: {
      executor: 'ramping-vus',
      stages: [
        { duration: '3m', target: 10 },
        { duration: '5m', target: 25 },
        { duration: '5m', target: 50 },
        { duration: '10m', target: targetVus },
        { duration: '10m', target: targetVus },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: [`rate<${failedRate}`],
    http_req_duration: [`p(95)<${writeP95}`, 'p(99)<5000'],
    'http_req_duration{type:write}': [`p(95)<${writeP95}`],
    'http_req_duration{type:read_after_write}': ['p(95)<1500'],
    loadtest_auth_failures: ['rate<0.01'],
  },
};

export function setup() {
  return { token: login() };
}

export default function writeScenario(data) {
  const token = data.token;

  group('create creative task', () => {
    const createRes = createCreativeTask(token);
    const created = check(createRes, {
      'create task status is 201': (r) => r.status === 201,
      'create task returns id': (r) => Boolean(r.json('data.id')),
    });

    if (!created) {
      return;
    }

    const taskId = createRes.json('data.id');
    randomThinkTime(0.5, 1.5);

    const detailRes = http.get(`${BASE_URL}/api/creative-tasks/${taskId}`, {
      headers: jsonHeaders(token),
      tags: { name: 'GET /api/creative-tasks/:taskId', type: 'read_after_write' },
      timeout: '30s',
    });
    check(detailRes, {
      'task detail status is 200': (r) => r.status === 200,
      'task detail id matches': (r) => r.json('data.id') === taskId,
    });

    randomThinkTime(0.5, 2);

    const listRes = http.get(`${BASE_URL}/api/creative-tasks?limit=20`, {
      headers: jsonHeaders(token),
      tags: { name: 'GET /api/creative-tasks', type: 'read_after_write' },
      timeout: '30s',
    });
    check(listRes, {
      'task list status is 200': (r) => r.status === 200,
    });
  });
}
