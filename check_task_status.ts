
import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
const { Pool } = pg;
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString, ssl: false });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkLatestTask() {
  try {
    console.log('Connecting to database...');
    const task = await prisma.storyboardTask.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    console.log('Latest Task:', JSON.stringify(task, null, 2));
  } catch (error) {
    console.error('Error fetching task:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLatestTask();
