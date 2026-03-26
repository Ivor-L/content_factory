import prisma from '../lib/prisma';

async function main() {
  // 查找包含"编程"的任务
  const task = await prisma.creativeTask.findFirst({
    where: {
      title: { contains: '编程' },
    },
    select: {
      id: true,
      userId: true,
      title: true,
      status: true,
      stage: true,
      layoutResultJson: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!task) {
    console.log('未找到包含"编程"的任务');
    return;
  }

  console.log('\n=== Creative Task ===');
  console.log('ID:', task.id);
  console.log('Title:', task.title);
  console.log('Status:', task.status);
  console.log('Stage:', task.stage);
  console.log('\nlayoutResultJson:');
  console.log(JSON.stringify(task.layoutResultJson, null, 2));

  // 提取第一张图片
  let thumbnailUrl = null;
  if (task.layoutResultJson) {
    const data = Array.isArray(task.layoutResultJson)
      ? task.layoutResultJson
      : task.layoutResultJson;

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (first && typeof first === 'object' && first.url) {
        thumbnailUrl = first.url;
      }
    }
  }

  console.log('\n提取的缩略图:', thumbnailUrl);

  // 查找对应的 TaskSummary
  const summary = await prisma.taskSummary.findUnique({
    where: {
      taskType_taskId: {
        taskType: 'creative',
        taskId: task.id,
      },
    },
  });

  console.log('\n=== TaskSummary ===');
  if (summary) {
    console.log('ID:', summary.id);
    console.log('Title:', summary.title);
    console.log('ThumbnailUrl:', summary.thumbnailUrl);
    console.log('Status:', summary.status);
  } else {
    console.log('未找到 TaskSummary 记录');
  }

  // 手动更新或创建
  if (thumbnailUrl) {
    const result = await prisma.taskSummary.upsert({
      where: {
        taskType_taskId: {
          taskType: 'creative',
          taskId: task.id,
        },
      },
      create: {
        taskType: 'creative',
        taskId: task.id,
        userId: task.userId!,
        title: task.title || '智能创作任务',
        status: task.status,
        thumbnailUrl: thumbnailUrl,
        createdAt: task.createdAt,
        updatedAt: new Date(),
        metadata: {
          stage: task.stage,
        },
      },
      update: {
        thumbnailUrl: thumbnailUrl,
        updatedAt: new Date(),
      },
    });

    console.log('\n=== 更新后的 TaskSummary ===');
    console.log('ThumbnailUrl:', result.thumbnailUrl);
    console.log('✅ 同步成功！');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
