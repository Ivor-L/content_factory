import pg from 'pg';
const { Client } = pg;

// Explicitly disable SSL
const connectionString = "postgresql://postgres:<password>@127.0.0.1:54320/postgres";

async function check() {
  console.log("----------------------------------------------------------------");
  console.log("Testing connection to SSH Tunnel (127.0.0.1:54320) -> Remote DB");
  console.log("----------------------------------------------------------------");

  const client = new Client({
    connectionString,
    ssl: false // Force disable SSL
  });

  try {
    await client.connect();
    console.log("✅ SUCCESS: Connection established!");
    console.log("   The tunnel is working correctly.");
    
    const res = await client.query('SELECT version()');
    console.log("   Database Version:", res.rows[0].version);
    
    await client.end();
  } catch (err) {
    console.log("❌ FAILURE: Connection Failed!");
    console.log("   Error:", err.message);
    console.log("----------------------------------------------------------------");
    console.log("Diagnosis:");
    if (err.message.includes('Connection terminated unexpectedly')) {
        console.log("   The SSH tunnel is connected, BUT the remote server closed the connection.");
        console.log("   Likely Cause: The SSH tunnel is pointing to 'localhost' (IPv6 ::1)");
        console.log("                 but the database is listening on IPv4 (127.0.0.1).");
        console.log("   FIX: Restart the tunnel using '127.0.0.1' instead of 'localhost'.");
    } else if (err.code === 'ECONNREFUSED') {
        console.log("   The SSH tunnel is NOT running locally on port 54320.");
    }
    console.log("----------------------------------------------------------------");
  }
}

check();
