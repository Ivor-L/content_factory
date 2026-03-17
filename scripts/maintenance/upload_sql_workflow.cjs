
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = "xNY4qhKT2cwXYi0v";
const HOST = process.env.N8N_HOST || "n8n.atomx.top";
const PATH = `/api/v1/workflows/${WORKFLOW_ID}`;

const options = {
  hostname: HOST,
  path: PATH,
  method: 'PUT',
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
    console.log(`Reading fixed SQL workflow...`);
    const root = path.resolve(__dirname, '..', '..');
    const workflowPath = path.join(root, 'workflows', 'exports', 'workflow_xNY4qhKT2cwXYi0v_fixed_sql.json');
    const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

    // CLEANUP JSON for PUT
    const allowedKeys = ['name', 'nodes', 'connections', 'settings'];
    const updatePayload = {};
    for (const key of allowedKeys) {
        if (workflow[key] !== undefined) {
            updatePayload[key] = workflow[key];
        }
    }
    
    // Update Workflow
    console.log(`Updating workflow ${WORKFLOW_ID}...`);
    await request(options, updatePayload);
    console.log("Workflow updated successfully!");

  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
