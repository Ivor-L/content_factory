import { subscribeKnowledgeVideoJobs } from "@/lib/knowledgeVideoQueue";
import prisma from "@/lib/prisma";

export async function renderKnowledgeVideo(taskId: string) {
  const task = await prisma.knowledgeVideoTask.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  console.info(`[knowledge-video] placeholder render for task ${taskId}`);
}

export async function runKnowledgeVideoWorker() {
  await subscribeKnowledgeVideoJobs(async ({ taskId }) => {
    await renderKnowledgeVideo(taskId);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runKnowledgeVideoWorker().catch((error) => {
    console.error("Knowledge video worker crashed", error);
    process.exit(1);
  });
}
