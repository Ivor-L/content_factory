
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString, ssl: false });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const product = await prisma.product.findFirst({
      where: {
        images: {
          not: '[]'
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    if (product) {
      console.log('Found product:', product.name);
      console.log('Images:', product.images);
    } else {
      console.log('No product with images found.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
