#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CONFIG_PATH = path.join(os.homedir(), '.nextide', 'config.json');
const DEFAULT_API_BASE_URL = 'http://localhost:3000';

function printHelp() {
  console.log(`NexTide CLI MVP

Usage:
  nextide status
  nextide capability list [--json]
  nextide capability run <capability-id> --input <file.json> --output <file.json> [--mode wait|submit]
  nextide run status <run-id>
  nextide run result <run-id> --output <file.json>

Common flags:
  --api-base-url <url>     Override NexTide API base URL
  --auth-token <token>     Forward as Authorization: Bearer <token>
  --user-api-key <key>     Forward as x-user-api-key
  --nexapi-key <key>       Forward as x-nexapi-key

Environment:
  NEXTIDE_API_BASE_URL     Default: ${DEFAULT_API_BASE_URL}
  NEXTIDE_AUTH_TOKEN       Bearer token forwarded as Authorization
  NEXTIDE_USER_API_KEY     Forwarded as x-user-api-key
  NEXTIDE_NEXAPI_KEY       Forwarded as x-nexapi-key

Config file:
  ${CONFIG_PATH}

Config shape:
  {
    "apiBaseUrl": "https://your-nextide-app.com",
    "authToken": "...",
    "userApiKey": "...",
    "nexApiKey": "..."
  }
`);
}

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to read config at ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) {
      positional.push(current);
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { positional, flags };
}

function resolveSettings(flags = {}) {
  const config = readConfig();
  const apiBaseUrl = String(
    flags['api-base-url'] ||
    process.env.NEXTIDE_API_BASE_URL ||
    config.apiBaseUrl ||
    DEFAULT_API_BASE_URL
  ).replace(/\/+$/, '');

  return {
    apiBaseUrl,
    authToken: String(flags['auth-token'] || process.env.NEXTIDE_AUTH_TOKEN || config.authToken || config.accessToken || ''),
    userApiKey: String(flags['user-api-key'] || process.env.NEXTIDE_USER_API_KEY || config.userApiKey || config.apiKey || ''),
    nexApiKey: String(flags['nexapi-key'] || flags['nex-api-key'] || process.env.NEXTIDE_NEXAPI_KEY || config.nexApiKey || ''),
  };
}

function buildHeaders(settings) {
  const headers = {
    accept: 'application/json',
  };
  if (settings.authToken) headers.authorization = `Bearer ${settings.authToken}`;
  if (settings.userApiKey) headers['x-user-api-key'] = settings.userApiKey;
  if (settings.nexApiKey) headers['x-nexapi-key'] = settings.nexApiKey;
  return headers;
}

function readJsonFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('--input <file.json> is required');
  }
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJsonFile(filePath, data) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('--output <file.json> is required');
  }
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return absolutePath;
}

async function requestJson(settings, requestPath, options = {}) {
  const url = `${settings.apiBaseUrl}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`;
  const headers = {
    ...buildHeaders(settings),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { text };
    }
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error || data?.message || `HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function commandStatus(settings) {
  console.log(JSON.stringify({
    ok: true,
    apiBaseUrl: settings.apiBaseUrl,
    hasAuthToken: Boolean(settings.authToken),
    hasUserApiKey: Boolean(settings.userApiKey),
    hasNexApiKey: Boolean(settings.nexApiKey),
    configPath: CONFIG_PATH,
  }, null, 2));
}

async function commandCapabilityList(settings, flags) {
  const data = await requestJson(settings, '/api/agent/capabilities');
  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const capabilities = Array.isArray(data?.capabilities) ? data.capabilities : [];
  for (const capability of capabilities) {
    const status = capability.status || 'unknown';
    const asyncLabel = capability.async ? 'async' : 'sync';
    console.log(`${capability.id}\t${status}\t${asyncLabel}\t${capability.title || ''}`);
  }
}

async function commandCapabilityRun(settings, args, flags) {
  const capabilityId = args[2];
  if (!capabilityId) throw new Error('capability id is required');

  const input = readJsonFile(flags.input);
  const mode = flags.mode === 'submit' ? 'submit' : flags.mode === 'wait' ? 'wait' : undefined;
  const data = await requestJson(settings, `/api/agent/capabilities/${encodeURIComponent(capabilityId)}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      input,
      mode,
      client: {
        agent: 'nextide-cli',
        version: '0.1.0-mvp',
      },
    }),
  });

  const outputPath = writeJsonFile(flags.output, data);
  console.log(`Saved capability run output to ${outputPath}`);
  if (data?.run?.status) console.log(`Status: ${data.run.status}`);
  if (data?.run?.runId) console.log(`Run ID: ${data.run.runId}`);
}

async function commandRunStatus(settings, args) {
  const runId = args[2];
  if (!runId) throw new Error('run id is required');
  const data = await requestJson(settings, `/api/agent/runs/${encodeURIComponent(runId)}`);
  console.log(JSON.stringify(data, null, 2));
}

async function commandRunResult(settings, args, flags) {
  const runId = args[2];
  if (!runId) throw new Error('run id is required');
  const data = await requestJson(settings, `/api/agent/runs/${encodeURIComponent(runId)}/result`);
  if (flags.output) {
    const outputPath = writeJsonFile(flags.output, data);
    console.log(`Saved run result to ${outputPath}`);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const { positional, flags } = parseArgs(rawArgs);
  const settings = resolveSettings(flags);

  if (positional.length === 0 || flags.help || positional[0] === 'help') {
    printHelp();
    return;
  }

  const [group, command] = positional;

  if (group === 'status') {
    await commandStatus(settings);
    return;
  }

  if (group === 'capability' && command === 'list') {
    await commandCapabilityList(settings, flags);
    return;
  }

  if (group === 'capability' && command === 'run') {
    await commandCapabilityRun(settings, positional, flags);
    return;
  }

  if (group === 'run' && command === 'status') {
    await commandRunStatus(settings, positional);
    return;
  }

  if (group === 'run' && command === 'result') {
    await commandRunResult(settings, positional, flags);
    return;
  }

  throw new Error(`Unknown command: ${rawArgs.join(' ')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (error?.data) {
    console.error(JSON.stringify(error.data, null, 2));
  }
  process.exitCode = 1;
});
