import { Client } from 'pg';
import 'dotenv/config';

// Server Config
const host = '47.107.158.233';
const port = 5433; // Pooler Port
const password = process.env.POSTGRES_PASSWORD || 'BfuRuWJYA1I_GeAjo3qpSA';

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
