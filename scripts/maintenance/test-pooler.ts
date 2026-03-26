import { Client } from 'pg';
import 'dotenv/config';

// Server Config (prefers hosted Supabase defaults)
const host =
  process.env.PG_HOST ||
  process.env.SUPABASE_DB_HOST ||
  'db.<project-ref>.supabase.co';
const port = Number(process.env.PG_PORT || process.env.SUPABASE_DB_PORT || 5432);
const password =
  process.env.POSTGRES_PASSWORD ||
  process.env.SUPABASE_DB_PASSWORD ||
  '';

async function testPooler(username: string) {
  console.log(`\nTesting Pooler with user: ${username} on ${host}:${port}...`);
  const connectionString = `postgresql://${username}:${password}@${host}:${port}/postgres`;
  
  const client = new Client({
    connectionString,
    ssl:
      process.env.PG_SSL_MODE === 'disable'
        ? false
        : {
            rejectUnauthorized:
              process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false',
          },
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
    'postgres.<project-ref>',  // Main Supabase user
    'postgres.stub',           // Alternative tenant ID (if you renamed the project)
  ];

  for (const user of usernames) {
    if (await testPooler(user)) {
      console.log(`\n🎉 Found working configuration! User: ${user}`);
      break;
    }
  }
}

main();
