
const N8N_HOST = 'https://n8n.atomx.top';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk';
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';
const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzcyMjk3MjQyLCJleHAiOjQ5MjU4OTcyNDJ9.znavqNnEFGpqJ8_qOxzhLNkPaR8RL4fwhE57v_Mgrz0';

async function fixRefusedIssue() {
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

    console.log('Updating node to try Container Name (kong)...');
    
    // Strategy 3: Use Container Name
    // If n8n and Supabase are in the same Docker network (which they likely are via docker-compose or similar setup)
    // The service name "kong" (Supabase API Gateway) or "supabase-kong" should resolve.
    // We'll try "kong" as it's the standard name in Supabase self-hosted setup.
    // Also try "supabase-kong" just in case.
    workflow.nodes[nodeIndex].parameters.jsCode = `
const productId = $input.item.json.product_id;
const sellingPoints = $input.item.json.selling_points;
const sellingPointsText = $input.item.json.selling_points_text;

// Strategy: Try Service Names
// Standard Supabase docker setup uses 'kong' for the API gateway on port 8000
const urlsToTry = [
    'http://kong:8000/rest/v1/Product?id=eq.' + productId,
    'http://supabase-kong:8000/rest/v1/Product?id=eq.' + productId,
    'http://api:8000/rest/v1/Product?id=eq.' + productId
];
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
            'Host': 'api.supabase.atomx.top'
        },
        body: {
            selling_points: sellingPoints,
            selling_points_text: sellingPointsText
        },
        json: true,
        timeout: 3000
    });
}

let lastError;

for (const url of urlsToTry) {
    try {
        const response = await makeRequest.call(this, url);
        return { json: { ...response, _meta: { successUrl: url } } };
    } catch (error) {
        lastError = error;
        // Continue to next URL
    }
}

// If all failed
const errBody = lastError.response ? lastError.response.data : lastError.message;
return { 
  json: { 
      error: "All connection attempts failed", 
      details: errBody,
      triedUrls: urlsToTry
  } 
};
`;

    // Update Sticky Note
    const noteIndex = workflow.nodes.findIndex(n => n.name === 'Trae Note');
    if (noteIndex !== -1) {
        workflow.nodes[noteIndex].parameters.content = "## Note from Trae\nUpdated to try internal Docker service names: `kong`, `supabase-kong`, `api`.\n\nThis assumes n8n and Supabase share a Docker network.";
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

fixRefusedIssue();
