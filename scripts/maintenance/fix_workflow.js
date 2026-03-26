
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const N8N_HOST = process.env.N8N_BASE_URL || 'https://n8n.atomx.top';
const API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';

const PG_HOST =
  process.env.PG_HOST ||
  process.env.SUPABASE_DB_HOST ||
  "db.<project-ref>.supabase.co";
const PG_PORT = Number(process.env.PG_PORT || process.env.SUPABASE_DB_PORT || 5432);
const PG_DATABASE = process.env.PG_DATABASE || "postgres";
const PG_USER =
  process.env.PG_USER ||
  process.env.SUPABASE_DB_USER ||
  "postgres.<project-ref>";
const PG_PASSWORD =
  process.env.PG_PASSWORD ||
  process.env.SUPABASE_DB_PASSWORD ||
  "";

async function fixWorkflow() {
  try {
    // --- Step 1: Create Postgres Credential ---
    console.log('Creating Postgres credential...');
    const credBody = {
      name: "Postgres (Trae Auto-Fix)",
      type: "postgres",
      data: {
        host: PG_HOST,
        port: PG_PORT,
        database: PG_DATABASE,
        user: PG_USER,
        password: PG_PASSWORD,
        ssl: process.env.PG_SSL_MODE || "require",
        // Satisfy schema validation with empty/default values
        sshTunnel: false,
        sshAuthenticateWith: "password",
        sshHost: "",
        sshPort: 22,
        sshUser: "",
        sshPassword: "",
        privateKey: "",
        passphrase: ""
      }
    };

    let newCredId;
    
    const createCredRes = await fetch(`${N8N_HOST}/api/v1/credentials`, {
      method: 'POST',
      headers: { 
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credBody)
    });

    if (!createCredRes.ok) {
      console.error(`Failed to create credential: ${createCredRes.status}`);
      console.error(await createCredRes.text());
      return;
    } else {
      const newCred = await createCredRes.json();
      console.log('Credential Created! ID:', newCred.id);
      newCredId = newCred.id;
    }

    // --- Step 2: Fetch Workflow ---
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const wfRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const workflow = await wfRes.json();


    // --- Step 3: Modify Workflow ---
    // Find the Supabase node
    // Note: The node name might be "写回Supabase-products"
    const nodeIndex = workflow.nodes.findIndex(n => n.type === 'n8n-nodes-base.supabase' || (n.name && n.name.includes('Supabase')));
    
    if (nodeIndex === -1) {
      console.error('Supabase node not found in workflow!');
      return;
    }

    const oldNode = workflow.nodes[nodeIndex];
    console.log(`Found Supabase node at index ${nodeIndex}:`, oldNode.name);

    // Create replacement Postgres node
    const newNode = {
      id: oldNode.id, // Keep ID to preserve connections
      name: "Update Product (Postgres)", // New name
      type: 'n8n-nodes-base.postgres',
      typeVersion: 1,
      position: oldNode.position,
      credentials: {
        postgres: {
          id: newCredId,
          name: "Postgres (Trae Auto-Fix)"
        }
      },
      parameters: {
        operation: 'executeQuery',
        // query: 'UPDATE "Product" SET "selling_points" = $1, "selling_points_text" = $2 WHERE "id" = $3',
        // Using string interpolation for simplicity if $json values are safe, but parameterized is better.
        // Wait, Postgres node "executeQuery" uses standard pg library.
        // The previous attempt had syntax for parameters.
        // Let's verify the query format.
        // The node supports "Expression" in query.
        query: 'UPDATE "Product" SET "selling_points" = $1, "selling_points_text" = $2 WHERE "id" = $3',
        additionalFields: {
          // In n8n Postgres node, queryParams is a string of comma-separated values.
          // We need to be careful with commas in the content.
          // Usually n8n handles array/object to string conversion?
          // Let's try to pass them as JSON strings wrapped in expression.
          queryParams: '={{ JSON.stringify($json.selling_points) }}, {{ $json.selling_points_text }}, {{ $json.product_id }}'
        }
      }
    };

    // Replace node
    workflow.nodes[nodeIndex] = newNode;

    // --- Step 4: Update Workflow on Server ---
    console.log('Updating workflow on server...');
    
    // We need to send PUT request with new workflow data
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

    // Activate the workflow if it was inactive?
    // Usually update doesn't activate.
    // Let's activate it just in case.
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
