import prisma from '../lib/prisma';

async function main() {
  const task = await prisma.creativeTask.findFirst({
    where: {
      title: { contains: '编程' },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!task) {
    console.log('未找到任务');
    return;
  }

  console.log('\n=== 完整的 Creative Task 数据 ===\n');
  console.log(JSON.stringify(task, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
