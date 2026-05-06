import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NEXTIDE_CAPABILITIES } from '../lib/agent-capabilities/registry';

const root = process.cwd();
const outDir = path.join(root, '.nextide', 'input');
await mkdir(outDir, { recursive: true });

let count = 0;
for (const capability of NEXTIDE_CAPABILITIES) {
  if (!capability.examples?.length) continue;
  capability.examples.forEach(async () => undefined);
  for (let index = 0; index < capability.examples.length; index++) {
    const example = capability.examples[index];
    const suffix = capability.examples.length > 1 ? `-${index + 1}` : '';
    const file = path.join(outDir, `${capability.id.replace(/[^a-z0-9_.-]/gi, '-')}${suffix}.json`);
    await writeFile(file, JSON.stringify(example.input, null, 2));
    count++;
  }
}

console.log(`Generated ${count} example fixture(s) in ${outDir}`);
