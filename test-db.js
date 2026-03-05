
import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  console.log('Testing connection to:', connectionString);

  if (!connectionString) {
    console.error('❌ DATABASE_URL is not defined');
    return;
  }

  const pool = new Pool({ 
    connectionString,
    // Explicitly disable SSL for the SSH tunnel connection as per lib/prisma.ts
    // The pooler on port 5431 might support it, but tunnel is safe without it
    ssl: false 
  });
  
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const count = await prisma.product.count();
    console.log('✅ Connection Successful! Product count:', count);
  } catch (e) {
    console.error('❌ Connection Failed:', e.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
