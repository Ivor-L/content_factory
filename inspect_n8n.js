
const N8N_HOST = 'https://n8n.atomx.top';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk';
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';

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
        host: "47.107.158.233",
        port: 54322,
        database: "postgres",
        user: "postgres",
        password: "Htk4XZETgYriBTd_qbjrjlNE6vEC68Y61XQNFsDT0v5A2NJcLD3CuQ",
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
