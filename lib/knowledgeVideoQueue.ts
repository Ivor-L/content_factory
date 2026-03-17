import { PgBoss, SendOptions, WorkOptions } from "pg-boss";
import { renderKnowledgeVideo } from "@/workers/knowledgeVideoRenderer";

type KnowledgeVideoJob = {
  taskId: string;
};

const JOB_NAME = "knowledge-video.render";

type KnowledgeBossGlobal = typeof globalThis & {
  __knowledgeVideoBoss?: Promise<PgBoss>;
};

const bossGlobal = globalThis as KnowledgeBossGlobal;

function resolveConnectionString() {
  return process.env.QUEUE_DATABASE_URL || process.env.DATABASE_URL;
}

function buildSslConfig() {
  const mode = (process.env.DATABASE_SSL || process.env.PGSSLMODE || "").toLowerCase();
  if (mode === "require" || mode === "true" || mode === "1") {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

async function createBoss() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error("QUEUE_DATABASE_URL or DATABASE_URL must be set for pg-boss");
  }

  const ssl = buildSslConfig();

  const boss = new PgBoss({
    connectionString,
    schema: process.env.PG_BOSS_SCHEMA || "pgboss",
    ...(ssl ? { ssl } : {}),
    monitorIntervalSeconds: 60,
  });

  boss.on("error", (error) => {
    console.error("[knowledge-video-queue] boss error", error);
  });

  await boss.start();
  await boss.createQueue(JOB_NAME);
  return boss;
}

export async function getKnowledgeVideoBoss() {
  if (!bossGlobal.__knowledgeVideoBoss) {
    bossGlobal.__knowledgeVideoBoss = createBoss();
  }
  return bossGlobal.__knowledgeVideoBoss;
}

const defaultRetryLimit = Number.isFinite(Number(process.env.KNOWLEDGE_VIDEO_JOB_RETRY_LIMIT))
  ? Number(process.env.KNOWLEDGE_VIDEO_JOB_RETRY_LIMIT)
  : 3;
const defaultRetryDelay = Number.isFinite(Number(process.env.KNOWLEDGE_VIDEO_JOB_RETRY_DELAY))
  ? Number(process.env.KNOWLEDGE_VIDEO_JOB_RETRY_DELAY)
  : 60;

export async function enqueueKnowledgeVideoJob(taskId: string, options?: SendOptions) {
  const boss = await getKnowledgeVideoBoss();
  return boss.send(JOB_NAME, { taskId } satisfies KnowledgeVideoJob, {
    retryLimit: defaultRetryLimit,
    retryDelay: defaultRetryDelay,
    ...options,
  });
}

export async function subscribeKnowledgeVideoJobs(
  handler: (payload: KnowledgeVideoJob) => Promise<void>,
  options?: WorkOptions
) {
  const boss = await getKnowledgeVideoBoss();
  await boss.work(
    JOB_NAME,
    {
      localConcurrency: 1,
      ...options,
    },
    async (jobBatch) => {
      const jobs = Array.isArray(jobBatch)
        ? jobBatch
        : jobBatch
        ? [jobBatch]
        : [];
      for (const job of jobs) {
        if (!job?.data) continue;
        try {
          await handler(job.data as KnowledgeVideoJob);
        } catch (error) {
          console.error("[knowledge-video-queue] handler failed", error);
          throw error;
        }
      }
    }
  );
}
