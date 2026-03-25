import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL or DIRECT_URL is not set');
  }

  const sslMode =
    process.env.DATABASE_SSL?.toLowerCase() ||
    process.env.PGSSLMODE?.toLowerCase() ||
    '';

  const ssl =
    sslMode === 'require' || sslMode === 'true' || sslMode === '1'
      ? { rejectUnauthorized: false }
      : false;
  
  // Create a new Pool with explicit SSL configuration
  const pool = new Pool({ 
    connectionString,
    ssl,
  });
  
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

function createLazyPrismaClient() {
  let client: ReturnType<typeof prismaClientSingleton> | undefined;
  return new Proxy({} as ReturnType<typeof prismaClientSingleton>, {
    get(_target, prop) {
      if (!client) {
        client = prismaClientSingleton();
      }
      return (client as Record<string | symbol, unknown>)[prop];
    },
  });
}

const prisma: ReturnType<typeof prismaClientSingleton> =
  globalThis.prisma ?? createLazyPrismaClient();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;
