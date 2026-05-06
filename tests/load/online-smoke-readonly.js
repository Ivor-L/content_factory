import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, commonHeaders, jsonHeaders, login, randomThinkTime } from './helpers.js';

const targetVus = Number(__ENV.READONLY_TARGET_VUS || 100);
const failedRate = Number(__ENV.HTTP_REQ_FAILED_RATE || 0.01);
const readonlyP95 = Number(__ENV.READONLY_P95_MS || 1200);

export const options = {
  scenarios: {
    readonly_ramp: {
      executor: 'ramping-vus',
      stages: [
        { duration: '3m', target: 10 },
        { duration: '5m', target: 25 },
        { duration: '5m', target: 50 },
        { duration: '5m', target: targetVus },
        { duration: '7m', target: targetVus },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: [`rate<${failedRate}`],
    http_req_duration: [`p(95)<${readonlyP95}`, 'p(99)<3000'],
    'http_req_duration{type:page}': ['p(95)<1500'],
    'http_req_duration{type:api}': [`p(95)<${readonlyP95}`],
    loadtest_auth_failures: ['rate<0.01'],
  },
};

export function setup() {
  return { token: login() };
}

export default function readonlyScenario(data) {
  const token = data.token;

  group('public and main pages', () => {
    const pages = ['/', '/dashboard', '/assets', '/canvas', '/storyboard', '/usage'];
    for (const path of pages) {
      const res = http.get(`${BASE_URL}${path}`, {
        headers: commonHeaders(),
        tags: { name: `GET ${path}`, type: 'page' },
        timeout: '30s',
      });
      check(res, {
        [`${path} is not 5xx`]: (r) => r.status < 500,
      });
      randomThinkTime(0.2, 0.8);
    }
  });

  group('authenticated readonly APIs', () => {
    const apis = [
      '/api/user/profile',
      '/api/creative-tasks?limit=20',
      '/api/tasks?limit=20',
      '/api/products',
      '/api/storyboard/jobs',
      '/api/integration/usage',
    ];

    for (const path of apis) {
      const res = http.get(`${BASE_URL}${path}`, {
        headers: jsonHeaders(token),
        tags: { name: `GET ${path.split('?')[0]}`, type: 'api' },
        timeout: '30s',
      });
      check(res, {
        [`${path} status ok`]: (r) => [200, 204, 304].includes(r.status),
      });
      randomThinkTime(0.2, 1);
    }
  });
}
