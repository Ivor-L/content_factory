import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NEXTIDE_CAPABILITIES } from '../lib/agent-capabilities/registry';

const root = process.cwd();
const outDir = path.join(root, 'artifacts', 'capabilities');
await mkdir(outDir, { recursive: true });

const exported = {
  schemaVersion: '2026-05-06',
  brand: 'NexTide',
  generatedAt: new Date().toISOString(),
  count: NEXTIDE_CAPABILITIES.length,
  capabilities: NEXTIDE_CAPABILITIES,
};

await writeFile(path.join(outDir, 'capabilities.json'), JSON.stringify(exported, null, 2));

for (const capability of NEXTIDE_CAPABILITIES) {
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

console.log(`Exported ${NEXTIDE_CAPABILITIES.length} capabilities to ${outDir}`);

function normalizeJsonSchemaType(type: string) {
  if (!type) return 'string';
  if (type.endsWith('[]') || type === 'array') return 'array';
  if (type === 'object') return 'object';
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'string';
}
