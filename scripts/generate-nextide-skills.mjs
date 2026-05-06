#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const tmpDir = path.join(root, '.nextide', 'tmp');
const skillsDir = path.join(root, '.claude', 'skills');
await mkdir(tmpDir, { recursive: true });
await mkdir(skillsDir, { recursive: true });

const tmpFile = path.join(tmpDir, 'capabilities-generate.mjs');
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

const bySkill = new Map();
for (const capability of capabilities) {
  if (!bySkill.has(capability.skillName)) bySkill.set(capability.skillName, []);
  bySkill.get(capability.skillName).push(capability);
}

for (const [skillName, caps] of bySkill.entries()) {
  if (skillName === 'nextide-shared') continue;
  const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
  const generated = renderSkill(skillName, caps);
  if (!existsSync(skillPath)) {
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, generated);
    console.log(`created ${path.relative(root, skillPath)}`);
    continue;
  }
  const current = await readFile(skillPath, 'utf8');
  const begin = '<!-- BEGIN NEXTIDE AUTO-GENERATED -->';
  const end = '<!-- END NEXTIDE AUTO-GENERATED -->';
  const block = generated.slice(generated.indexOf(begin), generated.indexOf(end) + end.length);
  if (current.includes(begin) && current.includes(end)) {
    const next = current.replace(new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`), block);
    await writeFile(skillPath, next);
    console.log(`updated ${path.relative(root, skillPath)}`);
  } else {
    await writeFile(skillPath, `${current.trim()}\n\n${block}\n`);
    console.log(`appended ${path.relative(root, skillPath)}`);
  }
}

await writeFile(path.join(skillsDir, 'nextide-skill-router-cn', 'SKILL.md'), renderRouter(capabilities));
console.log('generated router');

function renderSkill(skillName, caps) {
  const first = caps[0];
  const description = caps.map((cap) => `${cap.title}：${cap.description}`).join('；');
  return `---\nname: ${skillName}\ndescription: ${description}\nallowed-tools: Read, Write, Bash\n---\n\n# ${first.title}\n\nFollow shared NexTide rules in:\n\n- \`nextide-shared\`\n\n<!-- BEGIN NEXTIDE AUTO-GENERATED -->\n\n## NexTide Capability Contract\n\n${caps.map(renderCapability).join('\n\n')}\n\n## General Rules\n\n- Use NexTide capability IDs, not internal n8n webhook URLs.\n- Do not expose API secrets or internal webhook URLs in prompts or output.\n- If status is not \`available\`, fail fast and explain what is missing.\n- For async tasks, return the run id and use \`nextide run status\` / \`nextide run result\`.\n\n<!-- END NEXTIDE AUTO-GENERATED -->\n`;
}

function renderCapability(cap) {
  return `### ${cap.title}\n\n- Capability: \`${cap.id}\`\n- Status: \`${cap.status}\`\n- Execution: \`${cap.executionType}\`\n- Async: \`${cap.async}\`\n- Estimated duration: ${cap.estimatedDurationSeconds ?? 'unknown'} seconds\n- Tags: ${(cap.tags || []).map((tag) => `\`${tag}\``).join(', ')}\n\nDescription:\n\n${cap.description}\n\nInput fields:\n\n${renderFields(cap.inputSchema)}\n\nOutput fields:\n\n${renderFields(cap.outputSchema)}\n\nCLI:\n\n\`\`\`bash\nnextide capability run ${cap.id} \\\n  --input .nextide/input/${cap.id.replace(/[^a-z0-9_.-]/gi, '-')}.json \\\n  --output .nextide/output/${cap.id.replace(/[^a-z0-9_.-]/gi, '-')}-result.json \\\n  --mode ${cap.async ? 'submit' : 'wait'}\n\`\`\``;
}

function renderFields(schema = {}) {
  const rows = Object.entries(schema);
  if (!rows.length) return '- none';
  return rows.map(([key, field]) => `- \`${key}\` (${field.type}${field.required ? ', required' : ''})：${field.description}${field.default !== undefined ? ` 默认：\`${JSON.stringify(field.default)}\`` : ''}`).join('\n');
}

function renderRouter(capabilities) {
  const rows = capabilities.map((cap) => `| ${cap.title} | \`${cap.skillName}\` | \`${cap.id}\` | \`${cap.status}\` | ${cap.tags?.join(', ') || ''} |`).join('\n');
  return `---\nname: nextide-skill-router-cn\ndescription: 中文用户的 NexTide skill 路由器。适合“我该用哪个 NexTide skill”“帮我把这个任务拆成 NexTide skills 链路”“NexTide 现在有哪些 agent 能力”等请求。\nallowed-tools: Read, Bash\n---\n\n# NexTide Skill Router CN\n\nFollow shared NexTide rules in:\n\n- \`nextide-shared\`\n\n## Source of Truth\n\n\`\`\`bash\nnextide capability list\n\`\`\`\n\n## Routing Principles\n\n- 先识别任务真实目标，而不是只看字面关键词。\n- 优先使用最窄的 skill，不要一上来用大工作流。\n- 数据采集 → 分析拆解 → 生产生成 → 发布打包，按阶段排序。\n- 如果 capability 不是 \`available\`，必须说明“已登记但尚未接入 production runner”。\n- 如果 capability 是 \`available\`，给出可执行命令或下一步输入要求。\n\n<!-- BEGIN NEXTIDE AUTO-GENERATED -->\n\n## Current Capability Routes\n\n| 用户需求 | 推荐 Skill | Capability | Status | Tags |\n|---|---|---|---|---|\n${rows}\n\n<!-- END NEXTIDE AUTO-GENERATED -->\n\n## Good Output Shape\n\nReturn:\n\n1. 推荐 skill 或 skill chain\n2. 每一步为什么用它\n3. 当前 capability 状态\n4. 用户需要准备什么输入\n5. 如 available，给出下一步执行命令\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
