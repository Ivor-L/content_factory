
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({ 
    connectionString,
    ssl: false 
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    console.log('Querying with adapter...');
    const recentVideos = await prisma.replication.findMany({
      where: {
        createdAt: {
          gte: threeDaysAgo,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
      include: {
        product: { select: { name: true } },
      },
    });
    console.log('Result:', recentVideos);
  } catch (e: any) {
    console.error('Error name:', e.name);
    console.error('Error message:', e.message);
    if (e.meta) console.error('Error meta:', e.meta);
    console.error('Full error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
