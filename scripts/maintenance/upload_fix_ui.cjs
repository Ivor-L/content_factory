const WORKFLOW_ID = 'xNY4qhKT2cwXYi0v';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const API_KEY = process.env.N8N_API_KEY;
const BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.atomx.top') + '/api/v1';

async function fixAndUpload() {
  try {
    // 1. Get current workflow
    console.log('Fetching workflow...');
    const getRes = await fetch(`${BASE_URL}/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    
    if (!getRes.ok) {
        throw new Error(`Failed to fetch workflow: ${getRes.status} ${getRes.statusText}`);
    }
    
    const workflow = await getRes.json();
    
    // 2. Fix nodes
    console.log('Fixing nodes...');
    let fixedCount = 0;
    
    if (!workflow.nodes) {
        throw new Error('Workflow has no nodes!');
    }
    
    const newNodes = workflow.nodes.map(node => {
      // Fix Supabase Database Nodes
      if (node.type === 'n8n-nodes-base.supabase' && node.parameters.operation === 'executeQuery') {
        // Only fix if resource is missing or not 'database'
        if (node.parameters.resource !== 'database') {
            console.log(`Fixing Supabase node: ${node.name}`);
            node.parameters.resource = 'database';
            fixedCount++;
        }
      }
      return node;
    });
    
    console.log(`Fixed ${fixedCount} Supabase nodes.`);

    // 3. Prepare upload payload
    const payload = {
        nodes: newNodes,
        connections: workflow.connections,
        name: workflow.name,
        settings: workflow.settings || {} // Ensure settings is present
    };

    // 4. Upload
    console.log('Uploading fixed workflow...');
    const putRes = await fetch(`${BASE_URL}/workflows/${WORKFLOW_ID}`, {
      method: 'PUT',
      headers: { 
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!putRes.ok) {
        const errText = await putRes.text();
        throw new Error(`Failed to update workflow: ${putRes.status} ${putRes.statusText} - ${errText}`);
    }

    const result = await putRes.json();
    console.log('Success! Workflow updated.');
    console.log('Workflow ID:', result.id);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

fixAndUpload();
