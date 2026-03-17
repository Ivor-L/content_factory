import { PgBoss, SendOptions, WorkOptions } from "pg-boss";

export const assetJobNames = {
  history: "assets.history.process",
  stories: "assets.stories.process",
  styles: "assets.styles.process",
} as const;

export type AssetJobName = (typeof assetJobNames)[keyof typeof assetJobNames];

export type AssetJobPayloads = {
  [assetJobNames.history]: { historyDocId: string };
  [assetJobNames.stories]: { storyId: string };
  [assetJobNames.styles]: { styleId: string };
};

const assetQueueList = Object.values(assetJobNames);

type BossGlobal = typeof globalThis & {
  __assetBoss?: Promise<PgBoss>;
};

const bossGlobal = globalThis as BossGlobal;

const defaultSchema = process.env.PG_BOSS_SCHEMA || "pgboss";

function resolveConnectionString() {
  return process.env.QUEUE_DATABASE_URL || process.env.DATABASE_URL;
}

function buildSslConfig() {
  const mode =
    process.env.DATABASE_SSL ||
    process.env.PGSSLMODE ||
    "";
  const normalized = mode.toLowerCase();
  if (
    normalized === "require" ||
    normalized === "true" ||
    normalized === "1"
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

async function ensureAssetQueues(boss: PgBoss) {
  await Promise.all(assetQueueList.map((name) => boss.createQueue(name)));
}

async function createBoss() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error(
      "QUEUE_DATABASE_URL or DATABASE_URL must be set for pg-boss"
    );
  }

  const ssl = buildSslConfig();

  const boss = new PgBoss({
    connectionString,
    schema: defaultSchema,
    ...(ssl ? { ssl } : {}),
    monitorIntervalSeconds: 60,
  });

  boss.on("error", (error) => {
    console.error("[pg-boss] error", error);
  });

  await boss.start();
  await ensureAssetQueues(boss);
  console.info("[pg-boss] started with schema %s", defaultSchema);
  return boss;
}

export async function getBoss() {
  if (!bossGlobal.__assetBoss) {
    bossGlobal.__assetBoss = createBoss();
  }
  return bossGlobal.__assetBoss;
}

const defaultRetryLimit = Number.isFinite(Number(process.env.ASSET_JOB_RETRY_LIMIT))
  ? Number(process.env.ASSET_JOB_RETRY_LIMIT)
  : 3;
const defaultRetryDelay = Number.isFinite(Number(process.env.ASSET_JOB_RETRY_DELAY))
  ? Number(process.env.ASSET_JOB_RETRY_DELAY)
  : 30;

export async function enqueueAssetJob<K extends AssetJobName>(
  name: K,
  payload: AssetJobPayloads[K],
  options?: SendOptions
) {
  const boss = await getBoss();
  return boss.send(name, payload, {
    retryLimit: defaultRetryLimit,
    retryDelay: defaultRetryDelay,
    ...options,
  });
}

export type AssetJobHandler<K extends AssetJobName> = (
  payload: AssetJobPayloads[K]
) => Promise<void>;

export async function subscribeAssetJob<K extends AssetJobName>(
  name: K,
  handler: AssetJobHandler<K>,
  options?: WorkOptions
) {
  const boss = await getBoss();
  await boss.work(
    name,
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
        if (!job?.data) {
          throw new Error(`Job ${name} missing payload`);
        }
        await handler(job.data as AssetJobPayloads[K]);
      }
    }
  );
}
