import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import cliPackageJson from '../packages/nextide-cli/package.json' assert { type: 'json' };

const root = process.cwd();
const version = cliPackageJson.version || '0.0.0';
const releaseRoot = path.join(root, 'artifacts', 'release');
const stageDir = path.join(releaseRoot, `nextide-agent-runtime-${version}`);
const zipPath = path.join(releaseRoot, `nextide-agent-runtime-${version}.zip`);
const cliTarball = path.join(root, 'artifacts', 'cli', `nextide-cli-${version}.tgz`);
const skillsZip = path.join(root, 'artifacts', 'skills', 'nextide-skills.zip');

await mkdir(releaseRoot, { recursive: true });
await rm(stageDir, { recursive: true, force: true });
await rm(zipPath, { force: true });

await mkdir(path.join(stageDir, 'cli'), { recursive: true });
await mkdir(path.join(stageDir, 'skills'), { recursive: true });
await mkdir(path.join(stageDir, 'capabilities'), { recursive: true });
await mkdir(path.join(stageDir, 'fixtures'), { recursive: true });

await copyFile(cliTarball, path.join(stageDir, 'cli', path.basename(cliTarball)));
await copyFile(skillsZip, path.join(stageDir, 'skills', 'nextide-skills.zip'));

execFileSync('cp', ['-R', path.join(root, 'artifacts', 'capabilities') + '/', path.join(stageDir, 'capabilities')]);
execFileSync('cp', ['-R', path.join(root, '.nextide', 'input') + '/', path.join(stageDir, 'fixtures')]);

await writeFile(path.join(stageDir, 'INSTALL.md'), renderInstallGuide(version));
await writeFile(path.join(stageDir, 'manifest.json'), JSON.stringify({
  name: 'nextide-agent-runtime',
  version,
  createdAt: new Date().toISOString(),
  webBaseUrl: 'https://atomx.top',
  contents: {
    cli: `cli/${path.basename(cliTarball)}`,
    skills: 'skills/nextide-skills.zip',
    capabilities: 'capabilities/capabilities.json',
    fixtures: 'fixtures',
    installGuide: 'INSTALL.md',
  },
}, null, 2));

execFileSync('zip', ['-r', zipPath, path.basename(stageDir)], {
  cwd: releaseRoot,
  stdio: 'inherit',
});

console.log(`Packaged NexTide Agent Runtime to ${zipPath}`);

function renderInstallGuide(version: string) {
  return `# NexTide Agent Runtime ${version}\n\nThis release bundle contains the NexTide CLI, NexTide skills, capability contracts, input schemas, and example fixtures.\n\n## Contents\n\n\`\`\`text\ncli/nextide-cli-${version}.tgz\nskills/nextide-skills.zip\ncapabilities/capabilities.json\ncapabilities/*.input.schema.json\nfixtures/*.json\nmanifest.json\nINSTALL.md\n\`\`\`\n\n## Install CLI\n\n\`\`\`bash\nnpm install -g ./cli/nextide-cli-${version}.tgz\n\`\`\`\n\n## Install Skills\n\nFor Claude-style local skills, unzip the skills package into the target skills directory used by your agent environment.\n\nExample for a project-local install:\n\n\`\`\`bash\nunzip ./skills/nextide-skills.zip -d ./nextide-skills-install\n\`\`\`\n\nThen copy or reference the included \`.claude/skills\` directory according to your agent runtime.\n\n## Authenticate\n\n\`\`\`bash\nnextide auth login --api-base-url https://atomx.top\n\`\`\`\n\nThe login flow stores the user's **NexTide API Key** in \`~/.nextide/config.json\`.\n\n## Verify\n\n\`\`\`bash\nnextide doctor --api-base-url https://atomx.top\nnextide capability list --api-base-url https://atomx.top\n\`\`\`\n\n## Run an example\n\n\`\`\`bash\nmkdir -p .nextide/input .nextide/output\ncp ./fixtures/viral.midform.video.generate.json .nextide/input/viral.midform.video.generate.json\nnextide capability run viral.midform.video.generate \\\n  --api-base-url https://atomx.top \\\n  --input .nextide/input/viral.midform.video.generate.json \\\n  --output .nextide/output/viral.midform.video.generate-result.json \\\n  --mode submit \\\n  --wait\n\`\`\`\n\n## Export artifacts\n\n\`\`\`bash\nRUN_ID=$(node -e "const r=require('./.nextide/output/viral.midform.video.generate-result.json'); console.log(r.run && r.run.runId)")\nnextide run artifacts "$RUN_ID" --api-base-url https://atomx.top --output-dir .nextide/output/$RUN_ID\ncat .nextide/output/$RUN_ID/manifest.json\n\`\`\`\n\n## Security rules\n\n- Use stable NexTide capability IDs.\n- Do not call or expose internal n8n/webhook URLs.\n- Do not put server secrets into skills or fixtures.\n- Long-running workflows should use \`--wait\` or \`run wait\`, then \`run artifacts\`.\n`;
}
