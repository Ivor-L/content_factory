
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.vibe', 'credentials.env') });

const N8N_HOST = process.env.N8N_BASE_URL || 'https://n8n.atomx.top';
const API_KEY = process.env.N8N_API_KEY;
const CRED_ID = '5XGJWMLxSG8cgpYd';

async function inspectCred() {
  try {
    console.log(`Fetching credential ${CRED_ID}...`);
    const res = await fetch(`${N8N_HOST}/api/v1/credentials/${CRED_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    
    if (!res.ok) {
      console.error(`Fetch failed: ${res.status}`);
      console.error(await res.text());
      return;
    }

    const cred = await res.json();
    console.log('Credential:', JSON.stringify(cred, null, 2));

    // If fetch works, try to update host
    if (cred && cred.data) {
        console.log('\nUpdating credential host...');
        const updateBody = {
            name: cred.name,
            type: cred.type,
            data: {
                ...cred.data,
                host: "https://api.supabase.atomx.top"
            }
        };
        // NOTE: cred.data usually contains masked secrets. sending them back might be an issue.
        // But let's see what we get first.
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

inspectCred();
