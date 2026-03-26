import prisma from '../lib/prisma';

async function main() {
  const posterSummaries = await prisma.taskSummary.findMany({
    where: { taskType: 'poster' },
    select: { id: true, taskId: true, title: true, thumbnailUrl: true }
  });

  console.log('找到 poster taskType 记录数:', posterSummaries.length);

  let fixed = 0;
  for (const s of posterSummaries) {
    const ct = await prisma.creativeTask.findUnique({
      where: { id: s.taskId },
      select: { id: true, generatedImagesJson: true, status: true }
    });

    if (ct) {
      let thumbnailUrl = s.thumbnailUrl;
      if (thumbnailUrl === null && ct.generatedImagesJson !== null) {
        try {
          const raw = ct.generatedImagesJson;
          const imgs = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (Array.isArray(imgs) && imgs.length > 0 && imgs[0].url) {
            thumbnailUrl = imgs[0].url;
          }
        } catch {}
      }

      await prisma.taskSummary.update({
        where: { id: s.id },
        data: {
          taskType: 'creative',
          thumbnailUrl: thumbnailUrl,
          status: ct.status,
          updatedAt: new Date(),
        }
      });

      console.log('已修复:', s.title, '| thumbnailUrl:', thumbnailUrl ?? '(无图片)');
      fixed++;
    }
  }

  console.log('\n修复完成，共修复', fixed, '条记录');
}

main().catch(console.error).finally(() => prisma.$disconnect());
