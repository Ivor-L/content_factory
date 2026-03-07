
const https = require('https');
const fs = require('fs');

const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk";
const WORKFLOW_ID = "xNY4qhKT2cwXYi0v";
const HOST = "n8n.atomx.top";
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
    console.log(`Reading fixed workflow...`);
    const workflow = JSON.parse(fs.readFileSync('workflow_xNY4qhKT2cwXYi0v_fixed.json', 'utf8'));

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
