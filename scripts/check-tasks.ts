#!/usr/bin/env tsx

/**
 * 检查数据库中的任务数量
 *
 * 使用方法:
 * npx tsx scripts/check-tasks.ts
 */

import 'dotenv/config';
import prisma from '../lib/prisma';

async function main() {
  console.log('📊 正在检查数据库中的任务...\n');

  try {
    const [
      creativeCount,
      posterCount,
      digitalHumanCount,
      replicationCount,
      storyboardCount,
      knowledgeVideoCount,
      replicationShotCount,
      taskSummaryCount,
    ] = await Promise.all([
      prisma.creativeTask.count(),
      prisma.xhsPosterJob.count(),
      prisma.digitalHumanVideo.count(),
      prisma.replication.count(),
      prisma.storyboardTask.count(),
      prisma.knowledgeVideoTask.count(),
      prisma.replicationShotTask.count(),
      prisma.taskSummary.count(),
    ]);

    const totalTasks =
      creativeCount +
      posterCount +
      digitalHumanCount +
      replicationCount +
      storyboardCount +
      knowledgeVideoCount +
      replicationShotCount;

    console.log('各类任务数量：');
    console.log('─────────────────────────────');
    console.log(`智能创作 (CreativeTask):        ${creativeCount}`);
    console.log(`小红书图文 (XhsPosterJob):      ${posterCount}`);
    console.log(`数字人视频 (DigitalHumanVideo): ${digitalHumanCount}`);
    console.log(`视频复刻 (Replication):         ${replicationCount}`);
    console.log(`分镜视频 (StoryboardTask):      ${storyboardCount}`);
    console.log(`知识视频 (KnowledgeVideoTask):  ${knowledgeVideoCount}`);
    console.log(`场景复刻 (ReplicationShotTask): ${replicationShotCount}`);
    console.log('─────────────────────────────');
    console.log(`总计:                           ${totalTasks}`);
    console.log('');
    console.log(`TaskSummary 表中的记录数:       ${taskSummaryCount}`);
    console.log('');

    if (totalTasks === 0) {
      console.log('✅ 数据库中暂无任务，无需同步。');
      console.log('💡 新创建的任务会自动同步到 TaskSummary 表。');
    } else if (taskSummaryCount === 0) {
      console.log('⚠️  发现 ' + totalTasks + ' 个任务，但 TaskSummary 表为空。');
      console.log('💡 建议运行同步脚本：');
      console.log('   npx tsx scripts/sync-tasks.ts');
    } else if (taskSummaryCount < totalTasks) {
      console.log('⚠️  TaskSummary 表中的记录数少于实际任务数。');
      console.log('💡 建议运行同步脚本以更新：');
      console.log('   npx tsx scripts/sync-tasks.ts');
    } else {
      console.log('✅ TaskSummary 表已同步。');
      if (taskSummaryCount > totalTasks) {
        console.log('ℹ️  TaskSummary 中的记录数多于当前任务数（可能包含已删除任务的历史记录）。');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ 检查失败:', error);
    process.exit(1);
  }
}

main();
