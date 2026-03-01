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
