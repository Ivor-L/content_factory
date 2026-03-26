
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const N8N_HOST = process.env.N8N_BASE_URL || 'https://n8n.atomx.top';
const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_REST_URL =
  process.env.SUPABASE_REST_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://supabase-api.atomx.top';

async function fixDnsIssue() {
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

    console.log('Updating node to use hosted Supabase REST endpoint...');
    
    // We update the code to use the HTTPS endpoint directly
    workflow.nodes[nodeIndex].parameters.jsCode = `
const productId = $input.item.json.product_id;
const sellingPoints = $input.item.json.selling_points;
const sellingPointsText = $input.item.json.selling_points_text;

// Supabase Configuration
const url = '${SUPABASE_REST_URL}/rest/v1/Product?id=eq.' + productId;
const apiKey = '${SUPABASE_ANON_KEY}';

try {
  const response = await this.helpers.httpRequest({
      method: 'PATCH',
      url: url,
      headers: {
          'apikey': apiKey,
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
      },
      body: {
          selling_points: sellingPoints,
          selling_points_text: sellingPointsText
      },
      json: true
  });

  return { json: response };
} catch (error) {
  if (error.response) {
      return { json: { error: error.response.status, message: error.response.statusText } };
  }
  return { json: { error: error.message } };
}
`;

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

fixDnsIssue();
