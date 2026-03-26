import pg from 'pg';
const { Client } = pg;

const connectionString =
  process.env.PG_CONNECTION_STRING ||
  process.env.DATABASE_URL ||
  "postgresql://postgres.<project-ref>:<database-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require";

async function check() {
  console.log("----------------------------------------------------------------");
  console.log("Testing connection to hosted Supabase/Postgres");
  console.log("----------------------------------------------------------------");

  const client = new Client({
    connectionString,
    ssl:
      process.env.PG_SSL_MODE === 'disable'
        ? false
        : {
            rejectUnauthorized:
              process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false',
          },
  });

  try {
    await client.connect();
    console.log("✅ SUCCESS: Connection established!");
    console.log("   Credentials + TLS settings are valid.");
    
    const res = await client.query('SELECT version()');
    console.log("   Database Version:", res.rows[0].version);
    
    await client.end();
  } catch (err) {
    console.log("❌ FAILURE: Connection Failed!");
    console.log("   Error:", err.message);
    console.log("----------------------------------------------------------------");
    console.log("Diagnosis:");
    if (err.message.includes('Connection terminated unexpectedly')) {
    console.log("   Confirm the host/port in DATABASE_URL. Supabase Cloud uses db.<project-ref>.supabase.co:5432.");
    } else if (err.code === 'ECONNREFUSED') {
        console.log("   Cannot reach the database host. Check VPN/firewall or SSH tunnel settings.");
    }
    console.log("----------------------------------------------------------------");
  }
}

check();
