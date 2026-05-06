import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const outDir = path.join(root, 'artifacts', 'skills');
const zipPath = path.join(outDir, 'nextide-skills.zip');

await mkdir(outDir, { recursive: true });
await rm(zipPath, { force: true });

execFileSync('zip', ['-r', zipPath, '.claude/skills', 'skills/wechat-longform-writer', 'artifacts/capabilities'], {
  cwd: root,
  stdio: 'inherit',
});

console.log(`Packaged NexTide skills to ${zipPath}`);
