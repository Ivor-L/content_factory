import 'dotenv/config';
import prisma from '../lib/prisma';

const loadTestId = process.argv[2] || process.env.LOAD_TEST_ID || '20260506-content-factory';
const dryRun = process.env.DRY_RUN !== '0';

async function main() {
  const tasks = await prisma.creativeTask.findMany({
    where: {
      OR: [
        { title: { contains: `loadtest_${loadTestId}` } },
        { ideaText: { contains: loadTestId } },
        { channel: 'loadtest' },
      ],
    },
    select: { id: true, title: true, createdAt: true },
  });

  const taskIds = tasks.map((task) => task.id);

  console.log(JSON.stringify({ loadTestId, dryRun, creativeTaskCount: taskIds.length }, null, 2));
  if (tasks.length > 0) {
    console.table(tasks.slice(0, 20));
  }

  if (dryRun || taskIds.length === 0) {
    console.log(dryRun ? 'Dry run only. Set DRY_RUN=0 to delete.' : 'Nothing to delete.');
    return;
  }

  await prisma.$transaction([
    prisma.creativeTaskHistoryDoc.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.creativeTaskStory.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.creativeTaskStyle.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.creativeEvent.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.taskSummary.deleteMany({ where: { taskType: 'creative', taskId: { in: taskIds } } }),
    prisma.creativeTask.deleteMany({ where: { id: { in: taskIds } } }),
  ]);

  console.log(`Deleted ${taskIds.length} load-test creative tasks.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
