import { Client } from 'pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;

async function testConnection(ssl: boolean | object) {
  console.log(`\nTesting with SSL: ${JSON.stringify(ssl)}`);
  const client = new Client({
    connectionString,
    ssl,
  });

  try {
    await client.connect();
    const res = await client.query('SELECT NOW()');
    console.log('✅ Connection successful:', res.rows[0]);
    await client.end();
    return true;
  } catch (err: any) {
    console.error('❌ Connection failed:', err.message);
    try { await client.end(); } catch {}
    return false;
  }
}

async function main() {
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    return;
  }

  console.log('Using connection string:', connectionString.replace(/:[^:@]+@/, ':****@'));

  // Test 1: No SSL (for tunnel)
  const noSSLSuccess = await testConnection(false);
  
  // Test 2: Relaxed SSL (if tunnel supports it)
  if (!noSSLSuccess) {
    await testConnection({ rejectUnauthorized: false });
  }
}

main();
