#!/usr/bin/env tsx

/**
 * 初始数据同步脚本
 * 将所有现有任务同步到 TaskSummary 表
 *
 * 使用方法:
 * npx tsx scripts/sync-tasks.ts
 *
 * 或指定用户ID:
 * npx tsx scripts/sync-tasks.ts --userId=<user-id>
 */

import 'dotenv/config';
import { syncAllTasks } from '../lib/taskSummary';

async function main() {
  const args = process.argv.slice(2);
  const userIdArg = args.find(arg => arg.startsWith('--userId='));
  const userId = userIdArg ? userIdArg.split('=')[1] : undefined;

  console.log('开始同步任务到 TaskSummary 表...');
  if (userId) {
    console.log(`仅同步用户 ${userId} 的任务`);
  } else {
    console.log('同步所有用户的任务');
  }

  try {
    await syncAllTasks(userId);
    console.log('✅ 任务同步完成');
    process.exit(0);
  } catch (error) {
    console.error('❌ 任务同步失败:', error);
    process.exit(1);
  }
}

main();
