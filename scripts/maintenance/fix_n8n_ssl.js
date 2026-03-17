
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

// Configuration
const N8N_HOST = process.env.N8N_BASE_URL || 'https://n8n.atomx.top';
const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';

async function updateWorkflow() {
  try {
    // 1. Get current workflow
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const getRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    if (!getRes.ok) throw new Error(`Get failed: ${getRes.status}`);
    const workflow = await getRes.json();

    // 2. Find "下载图片" node
    const downloadNode = workflow.nodes.find(n => n.name === '下载图片');
    if (!downloadNode) {
      console.error('Node "下载图片" not found!');
      return;
    }

    console.log('Found "下载图片" node, updating SSL options...');
    
    // Deactivate workflow first
    console.log('Deactivating workflow...');
    await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}/deactivate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });

    // 3. Update options to ignore SSL
    if (!downloadNode.parameters.options) {
        downloadNode.parameters.options = {};
    }
    downloadNode.parameters.options.allowUnauthorizedCerts = true;
    
    // 4. Update the workflow
    console.log('Updating workflow...');
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

    if (!updateRes.ok) throw new Error(`Update failed: ${updateRes.status} - ${updateRes.statusText}`);
    const updateData = await updateRes.json();

    console.log('Workflow updated successfully:', updateData.id);

    // Reactivate
    console.log('Activating workflow...');
    await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

updateWorkflow();
