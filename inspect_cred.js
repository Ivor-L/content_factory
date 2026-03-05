
const N8N_HOST = 'https://n8n.atomx.top';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk';
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
