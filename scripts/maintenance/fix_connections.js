
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const N8N_HOST = process.env.N8N_BASE_URL || 'https://n8n.atomx.top';
const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';

async function fixConnections() {
  try {
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const wfRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const workflow = await wfRes.json();

    // 1. Rename "查询工作流积分 (Restored)" -> "查询工作流积分"
    const creditNode = workflow.nodes.find(n => n.name === '查询工作流积分 (Restored)');
    if (creditNode) {
        console.log('Renaming credit node...');
        creditNode.name = '查询工作流积分';
    }

    // 2. Fix Connections
    console.log('Rebuilding connections...');
    
    // We'll reconstruct the connections object to be clean
    const newConnections = { ...workflow.connections };

    // A. Fix "清洗卖点数据" outputs
    // It should go to "Update Product (Code)" and "返回前端结果"
    if (newConnections['清洗卖点数据']) {
        newConnections['清洗卖点数据'].main = [[
            {
                node: 'Update Product (Code)',
                type: 'main',
                index: 0
            },
            {
                node: '返回前端结果',
                type: 'main',
                index: 0
            }
        ]];
    }

    // B. Fix "Update Product (Code)" outputs
    // It should go to "扣除积分"
    // Remove old keys if they exist
    delete newConnections['写回Supabase-products'];
    delete newConnections['Update Product (HTTP)'];

    newConnections['Update Product (Code)'] = {
        main: [[
            {
                node: '扣除积分',
                type: 'main',
                index: 0
            }
        ]]
    };
    
    // C. Ensure "Webhook" connects to "查询工作流积分" (The rename handles the key, but we need to check if the connection exists)
    // The key in connections is "Webhook", value points to "查询工作流积分". 
    // Since we renamed the node back to "查询工作流积分", the existing connection "Webhook" -> "查询工作流积分" (if it wasn't changed) is valid.
    // Let's verify.
    if (newConnections['Webhook']) {
        newConnections['Webhook'].main[0][0].node = '查询工作流积分';
    }
    
    // D. Ensure "查询工作流积分" connects to "验证api-key"
    // The key "查询工作流积分" in connections needs to exist.
    // If the key was "查询工作流积分" and we renamed the node back, it matches.
    // If the key was "查询工作流积分 (Restored)", we need to rename the key.
    if (newConnections['查询工作流积分 (Restored)']) {
        newConnections['查询工作流积分'] = newConnections['查询工作流积分 (Restored)'];
        delete newConnections['查询工作流积分 (Restored)'];
    }

    workflow.connections = newConnections;

    // 3. Update Workflow
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

fixConnections();
