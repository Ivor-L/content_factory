const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = "yNIjqrlSnTeWDFIx";
const HOST = (process.env.N8N_BASE_URL || "https://n8n.atomx.top").replace(/^https?:\/\//, "");
const PATH = `/api/v1/workflows/${WORKFLOW_ID}`;

const options = {
  hostname: HOST,
  path: PATH,
  method: 'GET',
  headers: {
    'X-N8N-API-KEY': API_KEY,
    'Content-Type': 'application/json'
  }
};

function request(opts, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  try {
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const workflow = await request(options);

    // Modify Webhook Node
    let webhookNode = workflow.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
    if (!webhookNode) throw new Error("Webhook node not found");

    console.log("Current Webhook parameters:", JSON.stringify(webhookNode.parameters, null, 2));

    // FIX: Set responseMode at the top level of parameters
    webhookNode.parameters.responseMode = 'responseNode';
    
    // Also check options, just in case, but usually it's top level for v2
    if (webhookNode.parameters.options && webhookNode.parameters.options.responseMode) {
        delete webhookNode.parameters.options.responseMode; // Remove from options if it was wrongly placed
    }

    console.log("Updated Webhook parameters:", JSON.stringify(webhookNode.parameters, null, 2));

    // CLEANUP JSON for PUT
    const allowedKeys = ['name', 'nodes', 'connections', 'settings'];
    const updatePayload = {};
    for (const key of allowedKeys) {
        if (workflow[key] !== undefined) {
            updatePayload[key] = workflow[key];
        }
    }
    
    // Update Workflow
    console.log("Updating workflow...");
    const updateOpts = { ...options, method: 'PUT' };
    await request(updateOpts, updatePayload);
    console.log("Workflow updated successfully!");

  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
