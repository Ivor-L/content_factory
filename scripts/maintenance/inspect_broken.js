
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const N8N_HOST = process.env.N8N_BASE_URL || 'https://n8n.atomx.top';
const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';

async function inspect() {
  try {
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const wfRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const workflow = await wfRes.json();
    
    // Find the HTTP node
    const node = workflow.nodes.find(n => n.name === 'Update Product (HTTP)');
    if (node) {
      console.log('Node Config:', JSON.stringify(node, null, 2));
    } else {
      console.log('HTTP node not found!');
      // List all nodes
      console.log('Nodes:', workflow.nodes.map(n => n.name));
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

inspect();
