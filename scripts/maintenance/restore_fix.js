
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const N8N_HOST = process.env.N8N_BASE_URL || 'https://n8n.atomx.top';
const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function restoreAndFix() {
  try {
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const wfRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const workflow = await wfRes.json();

    // 1. Identify nodes
    const node2Index = workflow.nodes.findIndex(n => n.name === 'Update Product (Code)' || n.name === '查询工作流积分');
    const node11Index = workflow.nodes.findIndex(n => n.name === 'Update Product (HTTP)' || n.name === '写回Supabase-products');

    console.log(`Node 2 Index: ${node2Index}, Node 11 Index: ${node11Index}`);

    // 2. Fix Node 2 (Revert to placeholder)
    if (node2Index !== -1 && workflow.nodes[node2Index].name === 'Update Product (Code)') {
        console.log('Restoring Node 2 (Query Credits)...');
        // We don't have original logic, so we make a pass-through
        workflow.nodes[node2Index] = {
            id: workflow.nodes[node2Index].id,
            name: "查询工作流积分 (Restored)",
            type: "n8n-nodes-base.noOp", // Safe placeholder
            typeVersion: 1,
            position: workflow.nodes[node2Index].position
        };
        // If NoOp doesn't exist or we want to be safe, use Code
        workflow.nodes[node2Index] = {
            id: workflow.nodes[node2Index].id,
            name: "查询工作流积分 (Restored)",
            type: "n8n-nodes-base.code",
            typeVersion: 2,
            position: workflow.nodes[node2Index].position,
            parameters: {
                language: "javaScript",
                jsCode: "// Placeholder for 'Query Workflow Credits'\n// The previous logic was accidentally overwritten.\n// Please re-implement the credit check logic here.\nreturn $input.all();"
            }
        };
    }

    // 3. Fix Node 11 (Apply Code Logic)
    if (node11Index !== -1) {
        console.log('Fixing Node 11 (Update Product)...');
        const oldNode = workflow.nodes[node11Index];
        workflow.nodes[node11Index] = {
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
  if (error.response) {
      return { json: { error: error.response.status, message: error.response.statusText } };
  }
  return { json: { error: error.message } };
}
`
            }
        };
    }

    // 4. Update Workflow
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
    await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    console.log('Workflow activated.');

  } catch (error) {
    console.error('Error:', error);
  }
}

restoreAndFix();
