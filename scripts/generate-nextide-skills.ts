import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { NEXTIDE_CAPABILITIES } from '../lib/agent-capabilities/registry';
import type { AgentCapabilityDefinition, AgentCapabilitySchemaField } from '../lib/agent-capabilities/types';

const root = process.cwd();
const skillsDir = path.join(root, '.claude', 'skills');
await mkdir(skillsDir, { recursive: true });

const bySkill = new Map<string, AgentCapabilityDefinition[]>();
for (const capability of NEXTIDE_CAPABILITIES) {
  if (!bySkill.has(capability.skillName)) bySkill.set(capability.skillName, []);
  bySkill.get(capability.skillName)!.push(capability);
}

for (const [skillName, caps] of bySkill.entries()) {
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

await mkdir(path.join(skillsDir, 'nextide-skill-router-cn'), { recursive: true });
await writeFile(path.join(skillsDir, 'nextide-skill-router-cn', 'SKILL.md'), renderRouter(NEXTIDE_CAPABILITIES));
console.log('generated router');

function renderSkill(skillName: string, caps: AgentCapabilityDefinition[]) {
  const first = caps[0];
  const description = caps.map((cap) => `${cap.title}：${cap.description}`).join('；');
  return `---\nname: ${skillName}\ndescription: ${description}\nallowed-tools: Read, Write, Bash\n---\n\n# ${first.title}\n\nFollow shared NexTide rules in:\n\n- \`nextide-shared\`\n\n<!-- BEGIN NEXTIDE AUTO-GENERATED -->\n\n## NexTide Capability Contract\n\n${caps.map(renderCapability).join('\n\n')}\n\n## General Rules\n\n- Use NexTide capability IDs, not internal n8n webhook URLs.\n- Do not expose API secrets or internal webhook URLs in prompts or output.\n- If status is not \`available\`, fail fast and explain what is missing.\n- For async tasks, prefer \`--wait\` when the user wants a finished result in the same turn.\n- After a finished run, use \`nextide run artifacts <run-id> --output-dir .nextide/output/<run-id>\` and read \`manifest.json\` first.\n- Prefer returning local artifact paths from \`manifest.json\` over pasting huge raw JSON.\n\n<!-- END NEXTIDE AUTO-GENERATED -->\n`;
}

function renderCapability(cap: AgentCapabilityDefinition) {
  const safe = cap.id.replace(/[^a-z0-9_.-]/gi, '-');
  return `### ${cap.title}\n\n- Capability: \`${cap.id}\`\n- Version: \`${cap.version || '0.1.0'}\`\n- Category: \`${cap.category || 'system'}\`\n- Status: \`${cap.status}\`\n- Execution: \`${cap.executionType}\`\n- Async: \`${cap.async}\`\n- Cost level: \`${cap.costLevel || 'unknown'}\`\n- Required auth: ${(cap.requiredAuth || []).map((item) => `\`${item}\``).join(', ') || '`none`'}\n- Required env: ${(cap.requiredEnv || []).map((item) => `\`${item}\``).join(', ') || '`none`'}\n- Required plan: \`${cap.requiredPlan || 'none'}\`\n- Rate limit: ${renderRateLimit(cap)}\n- Estimated credits: ${cap.estimatedCredits ?? 'unknown'}\n- Estimated duration: ${cap.estimatedDurationSeconds ?? 'unknown'} seconds\n- Tags: ${(cap.tags || []).map((tag) => `\`${tag}\``).join(', ')}\n\nDescription:\n\n${cap.description}\n\nExamples:\n\n${renderExamples(cap)}\n\nInput fields:\n\n${renderFields(cap.inputSchema)}\n\nOutput fields:\n\n${renderFields(cap.outputSchema)}\n\nCLI:\n\n${renderCliWorkflow(cap, safe)}`;
}

function renderCliWorkflow(cap: AgentCapabilityDefinition, safe: string) {
  if (cap.async) {
    return `\`\`\`bash\nnextide capability run ${cap.id} \\\n  --input .nextide/input/${safe}.json \\\n  --output .nextide/output/${safe}-result.json \\\n  --mode submit \\\n  --wait \\\n  --timeout ${cap.maxWaitSeconds || 1800} \\\n  --interval 5\n\nRUN_ID=$(node -e "const r=require('./.nextide/output/${safe}-result.json'); console.log(r.run && r.run.runId)")\nnextide run artifacts "$RUN_ID" \\\n  --output-dir .nextide/output/$RUN_ID\n\`\`\`\n\nArtifact-first reading order:\n\n1. Read \`.nextide/output/$RUN_ID/manifest.json\`.\n2. Return local artifact paths when present.\n3. If a remote URL artifact is present, return the URL from manifest.\n4. Only inspect the full result JSON when manifest is insufficient.`;
  }
  return `\`\`\`bash\nnextide capability run ${cap.id} \\\n  --input .nextide/input/${safe}.json \\\n  --output .nextide/output/${safe}-result.json \\\n  --mode wait\n\`\`\`\n\nIf the result contains artifacts, export them:\n\n\`\`\`bash\nRUN_ID=$(node -e "const r=require('./.nextide/output/${safe}-result.json'); console.log(r.run && r.run.runId)")\nnextide run artifacts "$RUN_ID" \\\n  --output-dir .nextide/output/$RUN_ID\n\`\`\``;
}

function renderRateLimit(cap: AgentCapabilityDefinition) {
  if (!cap.rateLimit) return '`none`';
  const parts = [];
  if (cap.rateLimit.perMinute) parts.push(`${cap.rateLimit.perMinute}/minute`);
  if (cap.rateLimit.perHour) parts.push(`${cap.rateLimit.perHour}/hour`);
  return parts.map((part) => `\`${part}\``).join(', ') || '`none`';
}

function renderExamples(cap: AgentCapabilityDefinition) {
  if (!cap.examples?.length) return '- none';
  return cap.examples.map((example) => `- ${example.name}${example.description ? `：${example.description}` : ''}\n\n  \`\`\`json\n${JSON.stringify(example.input, null, 2).split('\n').map((line) => `  ${line}`).join('\n')}\n  \`\`\``).join('\n');
}

function renderFields(schema: Record<string, AgentCapabilitySchemaField> = {}) {
  const rows = Object.entries(schema);
  if (!rows.length) return '- none';
  return rows.map(([key, field]) => `- \`${key}\` (${field.type}${field.required ? ', required' : ''})：${field.description}${field.default !== undefined ? ` 默认：\`${JSON.stringify(field.default)}\`` : ''}`).join('\n');
}

function renderRouter(capabilities: AgentCapabilityDefinition[]) {
  const rows = capabilities.map((cap) => `| ${cap.title} | \`${cap.skillName}\` | \`${cap.id}\` | \`${cap.status}\` | ${cap.tags?.join(', ') || ''} |`).join('\n');
  return `---\nname: nextide-skill-router-cn\ndescription: 中文用户的 NexTide skill 路由器。适合“我该用哪个 NexTide skill”“帮我把这个任务拆成 NexTide skills 链路”“NexTide 现在有哪些 agent 能力”等请求。\nallowed-tools: Read, Bash\n---\n\n# NexTide Skill Router CN\n\nFollow shared NexTide rules in:\n\n- \`nextide-shared\`\n\n## Source of Truth\n\n\`\`\`bash\nnextide capability list\n\`\`\`\n\n## Routing Principles\n\n- 先识别任务真实目标，而不是只看字面关键词。\n- 优先使用最窄的 skill，不要一上来用大工作流。\n- 数据采集 → 分析拆解 → 生产生成 → 发布打包，按阶段排序。\n- 如果 capability 不是 \`available\`，必须说明“已登记但尚未接入 production runner”。\n- 如果 capability 是 \`available\`，给出可执行命令或下一步输入要求。\n- TikTok 博主蒸馏、账号爆款打法拆解、创作者内容公式提炼 → 优先使用 \`tiktok-creator-distiller\`。该 skill 是 workflow MVP，复用 \`social.tiktok.collect\` + \`viral.breakdown.video_prompts\`。\n\n<!-- BEGIN NEXTIDE AUTO-GENERATED -->\n\n## Current Capability Routes\n\n| 用户需求 | 推荐 Skill | Capability | Status | Tags |\n|---|---|---|---|---|\n${rows}\n\n<!-- END NEXTIDE AUTO-GENERATED -->\n\n## Good Output Shape\n\nReturn:\n\n1. 推荐 skill 或 skill chain\n2. 每一步为什么用它\n3. 当前 capability 状态\n4. 用户需要准备什么输入\n5. 如 available，给出下一步执行命令\n`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
