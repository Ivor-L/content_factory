
const axios = require('axios');

// Configuration
const N8N_HOST = 'https://n8n.atomx.top';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk';
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';

async function updateWorkflow() {
  try {
    // 1. Get current workflow
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const getRes = await axios.get(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const workflow = getRes.data;

    // 2. Find "下载图片" node
    const downloadNode = workflow.nodes.find(n => n.name === '下载图片');
    if (!downloadNode) {
      console.error('Node "下载图片" not found!');
      return;
    }

    console.log('Found "下载图片" node, updating SSL options...');
    
    // 3. Update options to ignore SSL
    if (!downloadNode.parameters.options) {
        downloadNode.parameters.options = {};
    }
    // For n8n-nodes-base.httpRequest, allowUnauthorizedCerts is usually inside options
    downloadNode.parameters.options.allowUnauthorizedCerts = true;
    
    // Also verify if it needs any other settings. 
    // In some versions it is a top level parameter "allowUnauthorizedCerts".
    // Let's set it in both places just in case, though usually it's in options for HTTP Request node.
    
    // 4. Update the workflow
    console.log('Updating workflow...');
    const updateRes = await axios.put(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, 
      { nodes: workflow.nodes, connections: workflow.connections }, 
      { headers: { 'X-N8N-API-KEY': API_KEY } }
    );

    console.log('Workflow updated successfully:', updateRes.data.id);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

updateWorkflow();
