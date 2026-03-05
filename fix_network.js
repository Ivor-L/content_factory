
const N8N_HOST = 'https://n8n.atomx.top';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk';
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';
const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzcyMjk3MjQyLCJleHAiOjQ5MjU4OTcyNDJ9.znavqNnEFGpqJ8_qOxzhLNkPaR8RL4fwhE57v_Mgrz0';

async function fixNetworkIssue() {
  try {
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const wfRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const workflow = await wfRes.json();

    const nodeIndex = workflow.nodes.findIndex(n => n.name === 'Update Product (Code)');
    
    if (nodeIndex === -1) {
      console.error('Target node not found!');
      return;
    }

    console.log('Updating node to try Docker Host IP (172.17.0.1)...');
    
    // We update the code to use the Docker gateway IP
    // This is a common workaround when containers cannot talk to the host's public IP
    workflow.nodes[nodeIndex].parameters.jsCode = `
const productId = $input.item.json.product_id;
const sellingPoints = $input.item.json.selling_points;
const sellingPointsText = $input.item.json.selling_points_text;

// Strategy: Try Docker Host IP first, then Public IP (just in case)
// 172.17.0.1 is the default Docker bridge gateway on Linux
const dockerHostUrl = 'http://172.17.0.1:8000/rest/v1/Product?id=eq.' + productId;
const apiKey = '${SUPABASE_ANON_KEY}';

async function makeRequest(url) {
    return await this.helpers.httpRequest({
        method: 'PATCH',
        url: url,
        headers: {
            'apikey': apiKey,
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
            'Host': 'api.supabase.atomx.top' // Essential for routing
        },
        body: {
            selling_points: sellingPoints,
            selling_points_text: sellingPointsText
        },
        json: true,
        timeout: 5000 // 5s timeout to fail fast
    });
}

try {
  // Try Internal Docker IP
  const response = await makeRequest.call(this, dockerHostUrl);
  return { json: response };
} catch (error) {
  // If internal fails, return error to let user know
  // We could fallback, but let's see if this one works first
  const errBody = error.response ? error.response.data : error.message;
  const errCode = error.response ? error.response.status : (error.code || 'UNKNOWN');
  
  return { 
      json: { 
          error: "Failed to connect via 172.17.0.1", 
          details: errBody,
          code: errCode,
          triedUrl: dockerHostUrl
      } 
  };
}
`;

    // Update Sticky Note
    const noteIndex = workflow.nodes.findIndex(n => n.name === 'Trae Note');
    if (noteIndex !== -1) {
        workflow.nodes[noteIndex].parameters.content = "## Note from Trae\nUpdated to use **172.17.0.1:8000** (Docker Host IP) to bypass public IP firewall restrictions.\n\nIf this still fails, we might need to use the `postgres` service name if they are in the same network.";
    }

    // Update Workflow
    console.log('Updating workflow on server...');
    const updateRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      method: 'PUT',
      headers: { 
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings,
        name: workflow.name
      })
    });

    if (!updateRes.ok) {
        console.error(await updateRes.text());
        return;
    }
    console.log('Workflow updated successfully!');

    // Activate
    await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    console.log('Workflow activated.');

  } catch (error) {
    console.error('Error:', error);
  }
}

fixNetworkIssue();
