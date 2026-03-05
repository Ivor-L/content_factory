
const N8N_HOST = 'https://n8n.atomx.top';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk';
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';

async function inspect() {
  try {
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const wfRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const workflow = await wfRes.json();
    
    // Find the HTTP node
    const node = workflow.nodes.find(n => n.name === 'Update Product (HTTP)');
    if (node) {
      console.log('Node Config:', JSON.stringify(node, null, 2));
    } else {
      console.log('HTTP node not found!');
      // List all nodes
      console.log('Nodes:', workflow.nodes.map(n => n.name));
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

inspect();
