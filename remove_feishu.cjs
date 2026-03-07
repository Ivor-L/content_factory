const fs = require('fs');
const WORKFLOW_ID = 'xNY4qhKT2cwXYi0v';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk';
const BASE_URL = 'https://n8n.atomx.top/api/v1';

async function removeFeishuLogic() {
  try {
    // 1. Fetch
    console.log('Fetching workflow...');
    const getRes = await fetch(`${BASE_URL}/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    
    if (!getRes.ok) throw new Error(`Fetch failed: ${getRes.status}`);
    const workflow = await getRes.json();
    
    // 2. Modify
    let modified = false;
    
    workflow.nodes = workflow.nodes.map(node => {
      // Clean SQL in Start Node
      if (node.name === 'Supabase: Status Generating') {
        const oldQuery = node.parameters.query;
        // Remove " || $json.body.record_id"
        const newQuery = oldQuery.replace(' || $json.body.record_id', '');
        if (oldQuery !== newQuery) {
          console.log('Removed Feishu record_id fallback from Start Node SQL');
          node.parameters.query = newQuery;
          modified = true;
        }
      }
      
      // Clean SQL in End Node (just in case, though it uses taskId from previous node)
      if (node.name === 'Supabase: Status Completed') {
         // It uses $('Generate Filename').item.json.taskId, so it's likely fine.
         // But let's check if there's any weird fallback
      }

      return node;
    });

    if (!modified) {
        console.log('No Feishu logic found to remove (or already removed).');
    }

    // 3. Upload
    console.log('Uploading...');
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
    
    console.log('Success! Workflow updated.');

  } catch (error) {
    console.error('Error:', error);
  }
}

removeFeishuLogic();
