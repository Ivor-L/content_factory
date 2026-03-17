
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const N8N_HOST = process.env.N8N_BASE_URL || 'https://n8n.atomx.top';
const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';

const PG_HOST = process.env.PG_HOST || "47.107.158.233";
const PG_PORT = Number(process.env.PG_PORT || 54322);
const PG_DATABASE = process.env.PG_DATABASE || "postgres";
const PG_USER = process.env.PG_USER || "postgres";
const PG_PASSWORD = process.env.PG_PASSWORD || "";

async function run() {
  try {
    // 1. Fetch Workflow to inspect the node
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const wfRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const workflow = await wfRes.json();
    
    const sbNode = workflow.nodes.find(n => n.type === 'n8n-nodes-base.supabase');
    if (sbNode) {
      console.log('Supabase Node Config:', JSON.stringify(sbNode, null, 2));
    } else {
      console.log('No Supabase node found!');
    }

    // 2. Try to create Postgres Credential
    console.log('\nCreating Postgres credential...');
    const credBody = {
      name: "Postgres (Trae Fix)",
      type: "postgres",
      data: {
        host: PG_HOST,
        port: PG_PORT,
        database: PG_DATABASE,
        user: PG_USER,
        password: PG_PASSWORD,
        ssl: "disable" // Attempting simple config first
      }
    };

    const createRes = await fetch(`${N8N_HOST}/api/v1/credentials`, {
      method: 'POST',
      headers: { 
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credBody)
    });

    if (createRes.ok) {
      const newCred = await createRes.json();
      console.log('Credential Created! ID:', newCred.id);
    } else {
      console.log(`Failed to create credential: ${createRes.status} ${createRes.statusText}`);
      const text = await createRes.text();
      console.log('Response:', text);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

run();
