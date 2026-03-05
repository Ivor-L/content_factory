
const N8N_HOST = 'https://n8n.atomx.top';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk';
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';
const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzcyMjk3MjQyLCJleHAiOjQ5MjU4OTcyNDJ9.znavqNnEFGpqJ8_qOxzhLNkPaR8RL4fwhE57v_Mgrz0';

async function fixWorkflow() {
  try {
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const wfRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const workflow = await wfRes.json();

    // Find the Supabase node
    const nodeIndex = workflow.nodes.findIndex(n => n.type === 'n8n-nodes-base.supabase' || (n.name && n.name.includes('Supabase')));
    
    if (nodeIndex === -1) {
      console.error('Supabase node not found in workflow!');
      // Check if it's already an HTTP Request node (idempotency)
      const httpNode = workflow.nodes.find(n => n.name === 'Update Product (HTTP)');
      if (httpNode) {
        console.log('Workflow already updated to HTTP Request node.');
        return;
      }
      return;
    }

    const oldNode = workflow.nodes[nodeIndex];
    console.log(`Found Supabase node at index ${nodeIndex}:`, oldNode.name);

    // Create replacement HTTP Request node
    const newNode = {
      id: oldNode.id,
      name: "Update Product (HTTP)",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.1,
      position: oldNode.position,
      parameters: {
        method: "PATCH",
        url: "https://api.supabase.atomx.top/rest/v1/Product",
        authentication: "none", // We use headers
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "apikey", value: SUPABASE_ANON_KEY },
            { name: "Authorization", value: `Bearer ${SUPABASE_ANON_KEY}` },
            { name: "Content-Type", value: "application/json" },
            { name: "Prefer", value: "return=representation" }
          ]
        },
        sendQuery: true,
        queryParameters: {
          parameters: [
            { name: "id", value: "={{ 'eq.' + $json.product_id }}" }
          ]
        },
        sendBody: true,
        contentType: "json",
        bodyParameters: {
          parameters: [
            { name: "selling_points", value: "={{ $json.selling_points }}" },
            { name: "selling_points_text", value: "={{ $json.selling_points_text }}" }
          ]
        },
        options: {}
      }
    };

    // Replace node
    workflow.nodes[nodeIndex] = newNode;

    // Add a Sticky Note explaining the change
    workflow.nodes.push({
      parameters: {
        content: "## Note from Trae\nI replaced the Supabase node with an HTTP Request node to bypass the credential issue.\n\nIt uses the `anon` key. If you encounter permission errors (401/403), please edit the **Update Product (HTTP)** node and replace the `apikey` and `Authorization` headers with your `service_role` secret.",
        height: 200,
        width: 400,
        color: 4
      },
      id: "trae-note-" + Date.now(),
      name: "Trae Note",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [oldNode.position[0], oldNode.position[1] - 250]
    });

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

fixWorkflow();
