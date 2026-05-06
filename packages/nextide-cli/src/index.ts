#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const CONFIG_DIR = path.join(os.homedir(), '.nextide');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

type Config = {
  apiBaseUrl?: string;
  userApiKey?: string;
  authToken?: string;
  nexApiKey?: string;
};

type Parsed = { args: string[]; flags: Record<string, string | boolean> };

function parse(argv: string[]): Parsed {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (item.startsWith('--')) {
      const key = item.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(item);
    }
  }
  return { args, flags };
}

async function loadConfig(): Promise<Config> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf8')) as Config;
  } catch {
    return {};
  }
}

async function saveConfig(config: Config) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function valueFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
  return typeof flags[key] === 'string' ? flags[key] as string : undefined;
}

async function resolveRuntime(flags: Record<string, string | boolean>) {
  const config = await loadConfig();
  return {
    config,
    apiBaseUrl: valueFlag(flags, 'api-base-url') || process.env.NEXTIDE_API_BASE_URL || config.apiBaseUrl || DEFAULT_API_BASE_URL,
    authToken: valueFlag(flags, 'auth-token') || process.env.NEXTIDE_AUTH_TOKEN || config.authToken || '',
    userApiKey: valueFlag(flags, 'user-api-key') || process.env.NEXTIDE_USER_API_KEY || config.userApiKey || '',
    nexApiKey: valueFlag(flags, 'nexapi-key') || valueFlag(flags, 'nex-api-key') || process.env.NEXTIDE_NEXAPI_KEY || config.nexApiKey || '',
  };
}

async function requestJson(url: string, init: RequestInit = {}, runtime?: Awaited<ReturnType<typeof resolveRuntime>>) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
  if (runtime?.authToken) headers.set('authorization', `Bearer ${runtime.authToken}`);
  if (runtime?.userApiKey) headers.set('x-user-api-key', runtime.userApiKey);
  if (runtime?.nexApiKey) headers.set('x-nexapi-key', runtime.nexApiKey);
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return data;
}

function print(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

async function authLogin(flags: Record<string, string | boolean>) {
  const runtime = await resolveRuntime(flags);
  const code = await requestJson(`${runtime.apiBaseUrl}/api/agent/auth/device/code`, {
    method: 'POST',
    body: JSON.stringify({
      label: valueFlag(flags, 'label') || 'NexTide CLI',
      verificationBaseUrl: valueFlag(flags, 'verification-base-url') || valueFlag(flags, 'web-base-url') || 'https://atomx.top',
      client: { name: '@nextide/cli', platform: process.platform, hostname: os.hostname() },
    }),
  }) as Record<string, any>;

  console.log('Open this URL to authorize NexTide CLI:');
  console.log(code.verification_uri_complete || code.verification_uri);
  console.log('');
  console.log(`Code: ${code.user_code}`);
  console.log('Waiting for approval...');

  const interval = Math.max(Number(code.interval || 3), 1) * 1000;
  const expiresAt = Date.now() + Number(code.expires_in || 600) * 1000;
  while (Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    try {
      const token = await requestJson(`${runtime.apiBaseUrl}/api/agent/auth/device/token`, {
        method: 'POST',
        body: JSON.stringify({ device_code: code.device_code }),
      }) as Record<string, any>;
      if (token.access_token) {
        await saveConfig({
          ...runtime.config,
          apiBaseUrl: runtime.apiBaseUrl,
          userApiKey: token.access_token,
        });
        console.log('Authorized. Config saved to ' + CONFIG_PATH);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('authorization_pending') || message.includes('HTTP 428')) continue;
      throw error;
    }
  }
  throw new Error('Device login expired. Run nextide auth login again.');
}

async function capabilityList(flags: Record<string, string | boolean>) {
  const runtime = await resolveRuntime(flags);
  const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/capabilities`, {}, runtime);
  print(data);
}

async function capabilityRun(args: string[], flags: Record<string, string | boolean>) {
  const id = args[2];
  if (!id) throw new Error('capability id is required');
  const inputPath = valueFlag(flags, 'input');
  if (!inputPath) throw new Error('--input file is required');
  const outputPath = valueFlag(flags, 'output');
  const mode = valueFlag(flags, 'mode') || 'submit';
  const runtime = await resolveRuntime(flags);
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/capabilities/${encodeURIComponent(id)}/run`, {
    method: 'POST',
    body: JSON.stringify({ input, mode }),
  }, runtime);
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(data, null, 2));
  }
  print(data);
}

async function runStatus(args: string[], flags: Record<string, string | boolean>) {
  const id = args[2];
  if (!id) throw new Error('run id is required');
  const runtime = await resolveRuntime(flags);
  print(await requestJson(`${runtime.apiBaseUrl}/api/agent/runs/${encodeURIComponent(id)}`, {}, runtime));
}

async function runResult(args: string[], flags: Record<string, string | boolean>) {
  const id = args[2];
  if (!id) throw new Error('run id is required');
  const runtime = await resolveRuntime(flags);
  const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/runs/${encodeURIComponent(id)}/result`, {}, runtime);
  const outputPath = valueFlag(flags, 'output');
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(data, null, 2));
  }
  print(data);
}

async function main() {
  const parsed = parse(process.argv.slice(2));
  const [cmd, sub] = parsed.args;
  if (!cmd || cmd === 'help' || parsed.flags.help) {
    console.log(`NexTide CLI\n\nCommands:\n  nextide auth login\n  nextide status\n  nextide capability list\n  nextide capability run <id> --input input.json --output out.json --mode submit\n  nextide run status <run-id>\n  nextide run result <run-id> --output result.json`);
    return;
  }
  if (cmd === 'auth' && sub === 'login') return authLogin(parsed.flags);
  if (cmd === 'status') {
    const runtime = await resolveRuntime(parsed.flags);
    print({ ok: true, apiBaseUrl: runtime.apiBaseUrl, hasUserApiKey: Boolean(runtime.userApiKey), hasAuthToken: Boolean(runtime.authToken), configPath: CONFIG_PATH });
    return;
  }
  if (cmd === 'capability' && sub === 'list') return capabilityList(parsed.flags);
  if (cmd === 'capability' && sub === 'run') return capabilityRun(parsed.args, parsed.flags);
  if (cmd === 'run' && sub === 'status') return runStatus(parsed.args, parsed.flags);
  if (cmd === 'run' && sub === 'result') return runResult(parsed.args, parsed.flags);
  throw new Error(`Unknown command: ${parsed.args.join(' ')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
