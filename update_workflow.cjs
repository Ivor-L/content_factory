const https = require('https');
const fs = require('fs');

const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk";
const WORKFLOW_ID = "yNIjqrlSnTeWDFIx";
const HOST = "n8n.atomx.top";
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

    if (!webhookNode.parameters.options) webhookNode.parameters.options = {};
    webhookNode.parameters.options.responseMode = 'responseNode';
    console.log("Modified Webhook responseMode to 'responseNode'");

    // Check Clean Node
    const cleanNodeName = "清洗卖点数据";
    if (!workflow.nodes.find(n => n.name === cleanNodeName)) {
      throw new Error(`Node '${cleanNodeName}' not found`);
    }

    // Check if Respond Node already exists
    if (!workflow.nodes.find(n => n.name === "返回前端结果")) {
        // Create Respond to Webhook Node
        const respondNode = {
          parameters: {
            respondWith: "json",
            responseBody: "={\n \"sellingPoints\": {{ $json.selling_points.marketing_profile.core_selling_points.map(p => p.description) }},\n \"detailedDescription\": {{ JSON.stringify($json.selling_points.visual_description) }},\n \"workflowData\": {{ JSON.stringify($json.selling_points) }}\n}",
            options: {}
          },
          id: "uuid-respond-webhook-" + Date.now(),
          name: "返回前端结果",
          type: "n8n-nodes-base.respondToWebhook",
          typeVersion: 1,
          position: [-1200, 750]
        };

        // Add Node
        workflow.nodes.push(respondNode);
        console.log("Added 'Respond to Webhook' node");

        // Connect Clean Node -> Respond Node
        if (!workflow.connections[cleanNodeName]) workflow.connections[cleanNodeName] = { main: [] };
        if (!workflow.connections[cleanNodeName].main) workflow.connections[cleanNodeName].main = [];
        if (workflow.connections[cleanNodeName].main.length === 0) workflow.connections[cleanNodeName].main.push([]);

        workflow.connections[cleanNodeName].main[0].push({
          node: "返回前端结果",
          type: "main",
          index: 0
        });
        console.log(`Connected '${cleanNodeName}' to '返回前端结果'`);
    } else {
        console.log("'返回前端结果' node already exists, skipping addition");
    }

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
