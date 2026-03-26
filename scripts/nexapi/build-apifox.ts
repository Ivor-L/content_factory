import path from 'node:path';
import fs from 'node:fs/promises';
import { mkdirSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';

const SOURCE_JSON = path.resolve('docs/云雾API 接口对接3.17 .apifox.json');
const OUTPUT_DIR = path.resolve('artifacts');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'nexapi-apifox.json');
const IMAGE_DIR = path.resolve('public/nexapi-apifox');

const BRAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/云雾API/g, 'NexAPI'],
  [/云雾/g, 'NexTide'],
  [/Yunwu/g, 'NexTide'],
];

const ROUTE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/https:\/\/yunwu\.ai\/v1\/chat\/completions/g, 'https://aiapi.atomx.top/v1/chat/completions'],
  [/https:\/\/yunwu\.ai\/v1/g, 'https://aiapi.atomx.top/v1'],
  [/https:\/\/yunwu\.ai/g, 'https://aiapi.atomx.top'],
  [/https:\/\/yunwu\.zeabur\.app/g, 'https://aiapi.nextide.top'],
  [/https:\/\/api\.apiplus\.org/g, 'https://aiapi.atomx.top'],
  [/https:\/\/api\.wlai\.vip/g, 'https://aiapi.atomx.top'],
  [/https:\/\/api3\.wlai\.vip/g, 'https://aiapi.nextide.top'],
];

const IMAGE_URL_REGEX = /https:\/\/api\.apifox\.com\/api\/v1\/[^\s")'<>]+/g;

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

async function loadJson() {
  const raw = await fs.readFile(SOURCE_JSON, 'utf-8');
  return JSON.parse(raw);
}

function transformValue(value: unknown, replacer: (input: string) => Promise<string>): Promise<unknown> | unknown {
  if (typeof value === 'string') {
    return replacer(value);
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((v) => transformValue(v, replacer)));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return Promise.all(
      entries.map(async ([key, val]) => [key, await transformValue(val, replacer)] as const)
    ).then((pairs) => Object.fromEntries(pairs));
  }
  return value;
}

const imageCache = new Map<string, string>();

async function downloadImage(url: string): Promise<string> {
  if (imageCache.has(url)) {
    return imageCache.get(url)!;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const ext = path.extname(new URL(url).pathname) || '.png';
  const filename = `${hash}${ext}`;
  const filePath = path.join(IMAGE_DIR, filename);
  await fs.writeFile(filePath, buffer);
  const publicPath = `/nexapi-apifox/${filename}`;
  imageCache.set(url, publicPath);
  return publicPath;
}

async function replaceImages(input: string): Promise<string> {
  const matches = input.match(IMAGE_URL_REGEX);
  if (!matches) return input;
  let output = input;
  for (const original of matches) {
    const localPath = await downloadImage(original);
    output = output.split(original).join(localPath);
  }
  return output;
}

async function replaceTokens(input: string): Promise<string> {
  let output = input;
  BRAND_REPLACEMENTS.forEach(([regex, replacement]) => {
    output = output.replace(regex, replacement);
  });
  ROUTE_REPLACEMENTS.forEach(([regex, replacement]) => {
    output = output.replace(regex, replacement);
  });
  output = await replaceImages(output);
  return output;
}

async function main() {
  await ensureDir(OUTPUT_DIR);
  await ensureDir(IMAGE_DIR);

  const data = await loadJson();
  const transformed = await transformValue(data, replaceTokens);
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(transformed, null, 2), 'utf-8');

  console.log('NexAPI Apifox file generated at', OUTPUT_JSON);
}

main().catch((error) => {
  console.error('[nexapi/build-apifox] Failed:', error);
  process.exit(1);
});
