import { Client } from 'pg';
import 'dotenv/config';

// Server Config
const host = process.env.PG_HOST || '127.0.0.1';
const port = Number(process.env.PG_PORT || 54322); // Host port that maps to supabase_db:5432
const password = process.env.POSTGRES_PASSWORD || '';

async function testPooler(username: string) {
  console.log(`\nTesting Pooler with user: ${username} on ${host}:${port}...`);
  const connectionString = `postgresql://${username}:${password}@${host}:${port}/postgres`;
  
  const client = new Client({
    connectionString,
    ssl: false, // Try NO SSL
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const res = await client.query('SELECT version()');
    console.log(`✅ Success! Version: ${res.rows[0].version}`);
    await client.end();
    return true;
  } catch (err: any) {
    console.error(`❌ Failed: ${err.message}`);
    try { await client.end(); } catch {}
    return false;
  }
}

async function main() {
  console.log('--- Testing Public Pooler Connection ---');
  
  // Try common username patterns for Supavisor
  const usernames = [
    'postgres.your-tenant-id',  // Tenant.User (Confirmed tenant ID)
    'postgres.stub',            // Alternative tenant ID
  ];

  for (const user of usernames) {
    if (await testPooler(user)) {
      console.log(`\n🎉 Found working configuration! User: ${user}`);
      break;
    }
  }
}

main();
