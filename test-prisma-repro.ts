
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

console.log('Connection String:', connectionString);

const pool = new Pool({ 
    connectionString,
    ssl: false 
});

async function main() {
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('Testing raw pg.Pool connection...');
    const client = await pool.connect();
    const res = await client.query('SELECT 1');
    console.log('Raw pg.Pool success:', res.rows);
    client.release();

    console.log('Connecting via Prisma...');
    
    // Just try a raw query first to verify connection
    const result = await prisma.$queryRaw`SELECT 1`;
    console.log('Success:', result);
    await prisma.$disconnect();
  } catch (e: any) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
