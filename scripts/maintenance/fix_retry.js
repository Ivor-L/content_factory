
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const N8N_HOST = process.env.N8N_BASE_URL || 'https://n8n.atomx.top';
const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function fixPostgresIssue() {
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

    console.log('Updating node to fallback to public IP with correct port...');
    
    // Strategy 4: Fallback to Public IP but double check port?
    // User said 47.107.158.233:8000 timed out.
    // 172.17.0.1 refused.
    // Maybe we should try the database port directly if API is inaccessible?
    // But this is a code node doing HTTP requests, not a Postgres node.
    // So we must use the HTTP API.
    
    // Wait, is the Supabase API on port 8000 exposed publicly?
    // The user's .env says: NEXT_PUBLIC_SUPABASE_URL="http://47.107.158.233:8000"
    // So it should be exposed.
    
    // Maybe try HTTPS? The n8n is on HTTPS.
    // But the .env says http.
    
    // Let's try to make the Code node more robust and print better errors.
    
    workflow.nodes[nodeIndex].parameters.jsCode = `
const productId = $input.item.json.product_id;
const sellingPoints = $input.item.json.selling_points;
const sellingPointsText = $input.item.json.selling_points_text;

// Strategy: Try Public IP again, but handle timeout gracefully.
// Also try https just in case.
const urlsToTry = [
    'http://47.107.158.233:8000/rest/v1/Product?id=eq.' + productId,
    'https://api.supabase.atomx.top/rest/v1/Product?id=eq.' + productId
];
const apiKey = '${SUPABASE_ANON_KEY}';

// Helper to wrap request in a promise that catches errors
async function tryRequest(url) {
    try {
        console.log('Trying: ' + url);
        const response = await this.helpers.httpRequest({
            method: 'PATCH',
            url: url,
            headers: {
                'apikey': apiKey,
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
                // Removed Host header to let it be set automatically for IP or Domain
            },
            body: {
                selling_points: sellingPoints,
                selling_points_text: sellingPointsText
            },
            json: true,
            timeout: 10000 // Increase timeout to 10s
        });
        return { success: true, data: response, url: url };
    } catch (error) {
        return { success: false, error: error.message, code: error.code, url: url };
    }
}

let errors = [];
for (const url of urlsToTry) {
    const result = await tryRequest.call(this, url);
    if (result.success) {
        return { json: result.data };
    }
    errors.push({ url: result.url, error: result.error, code: result.code });
}

return { 
  json: { 
      error: "All connection attempts failed", 
      details: errors
  } 
};
`;

    // Update Sticky Note
    const noteIndex = workflow.nodes.findIndex(n => n.name === 'Trae Note');
    if (noteIndex !== -1) {
        workflow.nodes[noteIndex].parameters.content = "## Note from Trae\nRetrying Public IP and Domain with longer timeout (10s).\n\nIf this fails, please check if port 8000 is allowed in the server's Security Group (Firewall).";
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

fixPostgresIssue();
