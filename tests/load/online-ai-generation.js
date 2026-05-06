import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { BASE_URL, createCreativeTask, jsonHeaders, login, randomThinkTime } from './helpers.js';

const targetVus = Number(__ENV.AI_TARGET_VUS || 10);
const failedRate = Number(__ENV.HTTP_REQ_FAILED_RATE || 0.02);
const aiP95 = Number(__ENV.AI_P95_MS || 30000);
const enableAi = __ENV.ENABLE_AI === '1';

export const options = {
  scenarios: {
    ai_generation_ramp: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: 1 },
        { duration: '5m', target: Math.min(5, targetVus) },
        { duration: '10m', target: targetVus },
        { duration: '5m', target: targetVus },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '60s',
    },
  },
  thresholds: {
    http_req_failed: [`rate<${failedRate}`],
    'http_req_duration{type:ai}': [`p(95)<${aiP95}`],
    loadtest_auth_failures: ['rate<0.01'],
  },
};

export function setup() {
  if (!enableAi) {
    throw new Error('AI/n8n generation is disabled. Set ENABLE_AI=1 only inside the approved load-test window and budget.');
  }
  return { token: login() };
}

export default function aiGenerationScenario(data) {
  const token = data.token;

  group('create task and generate diagnosis stage', () => {
    const createRes = createCreativeTask(token, `ai-${__VU}-${__ITER}-${Date.now()}`);
    const created = check(createRes, {
      'create task status is 201': (r) => r.status === 201,
      'create task returns id': (r) => Boolean(r.json('data.id')),
    });
    if (!created) return;

    const taskId = createRes.json('data.id');
    randomThinkTime(1, 3);

    const generateRes = http.post(
      `${BASE_URL}/api/creative-tasks/${taskId}/generate`,
      JSON.stringify({ stage: 'diagnosis' }),
      {
        headers: jsonHeaders(token),
        tags: { name: 'POST /api/creative-tasks/:taskId/generate', type: 'ai' },
        timeout: '120s',
      },
    );

    check(generateRes, {
      'generate returns 200': (r) => r.status === 200,
      'generate has data': (r) => Boolean(r.json('data')),
      'generate not insufficient credits': (r) => r.status !== 402,
    });

    sleep(2);

    const detailRes = http.get(`${BASE_URL}/api/creative-tasks/${taskId}`, {
      headers: jsonHeaders(token),
      tags: { name: 'GET /api/creative-tasks/:taskId', type: 'read_after_ai' },
      timeout: '30s',
    });
    check(detailRes, {
      'task detail after AI is 200': (r) => r.status === 200,
    });
  });
}
