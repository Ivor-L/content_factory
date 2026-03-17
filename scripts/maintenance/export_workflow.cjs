const https = require('https');
const fs = require('fs');
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

function request(opts) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    const jsonStr = await request(options);
    fs.writeFileSync('.trae/skills/xiangyu-n8n-workflow-building/runs/product-analysis-20260228-000000/output/product-analysis.json', jsonStr);
    console.log("Exported workflow to product-analysis.json");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
