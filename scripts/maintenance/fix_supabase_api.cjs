const WORKFLOW_ID = 'xNY4qhKT2cwXYi0v';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const API_KEY = process.env.N8N_API_KEY;
const BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.atomx.top') + '/api/v1';

async function fixSupabaseNodes() {
  try {
    // 1. Fetch
    console.log('Fetching workflow...');
    const getRes = await fetch(`${BASE_URL}/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    
    if (!getRes.ok) throw new Error(`Fetch failed: ${getRes.status}`);
    const workflow = await getRes.json();
    
    // 2. Modify nodes to use Custom API Call (resource: api)
    let fixedCount = 0;
    
    workflow.nodes = workflow.nodes.map(node => {
      if (node.type === 'n8n-nodes-base.supabase') {
        console.log(`Fixing node: ${node.name}`);
        
        // Common settings
        node.parameters = {
          resource: 'api',
          method: 'PATCH',
          jsonParameters: true,
          options: {}
        };
        
        if (node.name === 'Supabase: Status Generating') {
          node.parameters.path = '=/storyboard_tasks?id=eq.{{ $json.body.taskId }}';
          node.parameters.body = {
            status: 'GENERATING_GRID'
          };
          fixedCount++;
        } else if (node.name === 'Supabase: Status Completed') {
          node.parameters.path = "=/storyboard_tasks?id=eq.{{ $('Generate Filename').item.json.taskId }}";
          node.parameters.body = {
            status: 'GRID_COMPLETED',
            coverImage: "=https://<YOUR_PROJECT_REF>.supabase.co/storage/v1/object/public/images/storyboard/{{ $('Generate Filename').item.json.fileName }}"
          };
          fixedCount++;
        }
      }
      return node;
    });

    // 3. Upload
    console.log(`Uploading fixes for ${fixedCount} nodes...`);
    const payload = {
        nodes: workflow.nodes,
        connections: workflow.connections,
        name: workflow.name,
        settings: workflow.settings || {}
    };

    const putRes = await fetch(`${BASE_URL}/workflows/${WORKFLOW_ID}`, {
      method: 'PUT',
      headers: { 
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!putRes.ok) {
        const text = await putRes.text();
        throw new Error(`Update failed: ${putRes.status} - ${text}`);
    }
    
    console.log('Success! Workflow updated to use Custom API Call.');

  } catch (error) {
    console.error('Error:', error);
  }
}

fixSupabaseNodes();
