import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  console.log('Testing connection to:', connectionString?.replace(/:[^:@]+@/, ':****@'));

  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    return;
  }

  const pool = new Pool({ 
    connectionString,
    ssl: false // Pooler doesn't support SSL yet
  });
  
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('Connecting...');
    const count = await prisma.replication.count();
    console.log('✅ Connection successful! Replication count:', count);
  } catch (e) {
    console.error('❌ Connection failed:', e);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
