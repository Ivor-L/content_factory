#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const outDir = path.join(root, 'artifacts', 'capabilities');
const tmpDir = path.join(root, '.nextide', 'tmp');
await mkdir(outDir, { recursive: true });
await mkdir(tmpDir, { recursive: true });

const tmpFile = path.join(tmpDir, 'capabilities-export.mjs');
execFileSync('npx', [
  'esbuild',
  'lib/agent-capabilities/registry.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${tmpFile}`,
  '--packages=external',
], { stdio: 'inherit' });

const mod = await import(pathToFileURL(tmpFile).href + `?t=${Date.now()}`);
const capabilities = mod.NEXTIDE_CAPABILITIES || mod.listAgentCapabilities?.() || [];

const exported = {
  schemaVersion: '2026-05-06',
  brand: 'NexTide',
  generatedAt: new Date().toISOString(),
  count: capabilities.length,
  capabilities,
};

await writeFile(path.join(outDir, 'capabilities.json'), JSON.stringify(exported, null, 2));

for (const capability of capabilities) {
  const fileSafe = capability.id.replace(/[^a-z0-9_.-]/gi, '_');
  await writeFile(path.join(outDir, `${fileSafe}.input.schema.json`), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: `${capability.id} input`,
    type: 'object',
    properties: Object.fromEntries(Object.entries(capability.inputSchema || {}).map(([key, field]) => [
      key,
      {
        type: normalizeJsonSchemaType(field.type),
        description: field.description,
        enum: field.enum,
        default: field.default,
      },
    ])),
    required: Object.entries(capability.inputSchema || {}).filter(([, field]) => field.required).map(([key]) => key),
    additionalProperties: true,
  }, null, 2));
}

console.log(`Exported ${capabilities.length} capabilities to ${outDir}`);

function normalizeJsonSchemaType(type) {
  if (!type) return 'string';
  if (type.endsWith('[]') || type === 'array') return 'array';
  if (type === 'object') return 'object';
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'string';
}
