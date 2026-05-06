import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { updateAgentCapabilityRunFromResult } from '@/lib/agent-runs/store';

const root = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const olderThanMinutes = numberArg('--older-than-minutes', 120);
const limit = numberArg('--limit', 100);
const outDir = path.join(root, '.nextide', 'output', 'cleanup-agent-runs');
const staleBefore = new Date(Date.now() - olderThanMinutes * 60 * 1000);

function numberArg(name: string, fallback: number) {
  const raw = args.find((arg) => arg.startsWith(`${name}=`))?.split('=')[1];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    const report = {
      ok: true,
      skipped: true,
      reason: 'DATABASE_URL or DIRECT_URL is not set',
      dryRun,
      olderThanMinutes,
      matched: 0,
      processed: 0,
    };
    const reportPath = path.join(outDir, `report-${Date.now()}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    return;
  }

  const runs = await prisma.agentCapabilityRun.findMany({
    where: {
      status: { in: ['queued', 'running', 'waiting_callback'] },
      createdAt: { lt: staleBefore },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  const results = [] as Array<Record<string, unknown>>;
  for (const run of runs) {
    const item = {
      runId: run.id,
      capabilityId: run.capabilityId,
      previousStatus: run.status,
      createdAt: run.createdAt.toISOString(),
      businessType: run.businessType,
      businessId: run.businessId,
      dryRun,
      action: dryRun ? 'would_timeout' : 'timeout',
    };
    results.push(item);
    if (dryRun) continue;

    await updateAgentCapabilityRunFromResult({
      runId: run.id,
      capabilityId: run.capabilityId,
      mode: run.mode as 'wait' | 'submit',
      status: 'timeout',
      createdAt: run.createdAt.toISOString(),
      finishedAt: new Date().toISOString(),
      result: run.resultJson,
      artifacts: [],
      usage: run.usageJson as { credits?: number; provider?: string; durationMs?: number } | undefined,
      error: {
        code: 'timeout',
        message: `Run timed out after being stale for more than ${olderThanMinutes} minutes.`,
      },
    }, {
      businessType: run.businessType || undefined,
      businessId: run.businessId || undefined,
      businessTaskId: run.businessTaskId || undefined,
      businessStatus: 'timeout',
    });
  }

  const report = {
    ok: true,
    dryRun,
    olderThanMinutes,
    staleBefore: staleBefore.toISOString(),
    matched: runs.length,
    processed: dryRun ? 0 : runs.length,
    results,
  };
  const reportPath = path.join(outDir, `report-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
