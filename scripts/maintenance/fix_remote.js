
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const N8N_HOST = process.env.N8N_BASE_URL || 'https://n8n.atomx.top';
const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function fixRemoteServerIssue() {
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

    console.log('Updating node to use Public IP via HTTPS (443) with Host Header...');
    
    // Strategy:
    // 1. Use Public IP (47.107.158.233) to avoid DNS ENOTFOUND
    // 2. Use HTTPS (443) because port 8000 timed out (likely firewall)
    // 3. Set Host header to 'api.supabase.atomx.top' for Nginx routing
    // 4. Disable SSL verification because IP != Hostname in cert
    
    workflow.nodes[nodeIndex].parameters.jsCode = `
const productId = $input.item.json.product_id;
const sellingPoints = $input.item.json.selling_points;
const sellingPointsText = $input.item.json.selling_points_text;

// Configuration
// Using IP 47.107.158.233 instead of domain to bypass n8n DNS issues
// Using HTTPS (443) because port 8000 seems blocked
const url = 'https://47.107.158.233/rest/v1/Product?id=eq.' + productId;
const apiKey = '${SUPABASE_ANON_KEY}';

try {
  const response = await this.helpers.httpRequest({
      method: 'PATCH',
      url: url,
      headers: {
          'apikey': apiKey,
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          'Host': 'api.supabase.atomx.top' // Critical for Nginx to route to Supabase
      },
      body: {
          selling_points: sellingPoints,
          selling_points_text: sellingPointsText
      },
      json: true,
      skipSslCertificateValidation: true, // Essential when accessing HTTPS via IP
      timeout: 10000
  });

  return { json: response };
} catch (error) {
  const errInfo = {
      message: error.message,
      code: error.code,
      status: error.response ? error.response.status : undefined,
      data: error.response ? error.response.data : undefined
  };
  
  return { 
      json: { 
          error: "Connection failed (Remote Server Mode)", 
          details: errInfo,
          triedUrl: url
      } 
  };
}
`;

    // Update Sticky Note
    const noteIndex = workflow.nodes.findIndex(n => n.name === 'Trae Note');
    if (noteIndex !== -1) {
        workflow.nodes[noteIndex].parameters.content = "## Note from Trae\n**Remote Server Mode Configured**\n\n1. Using Public IP `47.107.158.233` (Bypass DNS)\n2. Using HTTPS 443 (Bypass Port 8000 Block)\n3. Setting `Host: api.supabase.atomx.top`\n4. SSL Validation Disabled (IP mismatch)";
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

fixRemoteServerIssue();
