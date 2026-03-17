
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const N8N_HOST = process.env.N8N_BASE_URL || 'https://n8n.atomx.top';
const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function fixWorkflowWithCodeNode() {
  try {
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const wfRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const workflow = await wfRes.json();

    // Find the problematic node (could be "Update Product (HTTP)" or "写回Supabase-products" or "Update Product (Postgres)")
    // We want to replace whatever is at the position of the DB update.
    const nodeIndex = workflow.nodes.findIndex(n => 
        n.name.includes('Update Product') || 
        n.name.includes('Supabase') ||
        n.type.includes('httpRequest') ||
        n.type.includes('postgres') ||
        n.type.includes('supabase')
    );
    
    if (nodeIndex === -1) {
      console.error('Target node not found in workflow!');
      return;
    }

    const oldNode = workflow.nodes[nodeIndex];
    console.log(`Found node to replace at index ${nodeIndex}:`, oldNode.name);

    // Create replacement Code node
    // Using n8n-nodes-base.code
    const newNode = {
      id: oldNode.id,
      name: "Update Product (Code)",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: oldNode.position,
      parameters: {
        language: "javaScript",
        jsCode: `
const productId = $input.item.json.product_id;
const sellingPoints = $input.item.json.selling_points;
const sellingPointsText = $input.item.json.selling_points_text;

// Supabase Configuration
const url = 'https://api.supabase.atomx.top/rest/v1/Product?id=eq.' + productId;
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
  // If it's a 404 or empty response but successful (204), handle it
  if (error.response) {
      return { json: { error: error.response.status, message: error.response.statusText, body: error.response.data } };
  }
  throw error;
}
`
      }
    };

    // Replace node
    workflow.nodes[nodeIndex] = newNode;

    // Update Sticky Note
    const noteIndex = workflow.nodes.findIndex(n => n.name === 'Trae Note');
    if (noteIndex !== -1) {
        workflow.nodes[noteIndex].parameters.content = "## Note from Trae\nI replaced the update node with a **Code Node** to ensure stability.\n\nIt uses `this.helpers.httpRequest` to call Supabase API directly.\n\nIf you need to change permissions, edit the code and update the `apiKey` variable.";
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
      console.error(`Failed to update workflow: ${updateRes.status}`);
      console.error(await updateRes.text());
      return;
    }

    const updatedWf = await updateRes.json();
    console.log('Workflow updated successfully!', updatedWf.id);

    // Activate
    console.log('Activating workflow...');
    await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    console.log('Workflow activated.');

  } catch (error) {
    console.error('Error:', error);
  }
}

fixWorkflowWithCodeNode();
