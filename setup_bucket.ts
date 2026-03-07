
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supabase-api.atomx.top';
// We need the SERVICE_ROLE_KEY to create buckets. 
// From ENV_CONFIG.md:
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzI2MDk5OTIsImV4cCI6MjA4Nzk2OTk5Mn0.gXgmTX9Zoj7oESdbfFGWjbPcm7FGjvCGRLUj94_maGk';

// Try creating client with minimal options
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function setupBucket() {
  const bucketName = 'temp_uploads';

  console.log(`Checking for bucket '${bucketName}'...`);
  
  // Try to use fetch directly to bypass potential client library issues with headers
  // Supabase Storage API: POST /storage/v1/bucket
  
  try {
      const response = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketName}`, {
          method: 'GET',
          headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey
          }
      });
      
      if (response.ok) {
          console.log(`Bucket '${bucketName}' exists.`);
          const bucket = await response.json();
          if (!bucket.public) {
              console.log('Updating to public...');
              await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketName}`, {
                  method: 'PUT',
                  headers: {
                      'Authorization': `Bearer ${serviceRoleKey}`,
                      'apikey': serviceRoleKey,
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ public: true })
              });
              console.log('Updated.');
          }
      } else if (response.status === 404) {
           console.log(`Bucket '${bucketName}' not found. Creating...`);
           const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
                  method: 'POST',
                  headers: {
                      'Authorization': `Bearer ${serviceRoleKey}`,
                      'apikey': serviceRoleKey,
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ 
                      id: bucketName,
                      name: bucketName,
                      public: true,
                      file_size_limit: 104857600,
                      allowed_mime_types: ['video/mp4', 'video/quicktime', 'video/webm']
                  })
              });
           
           if (createRes.ok) {
               console.log('Bucket created successfully.');
           } else {
               const err = await createRes.text();
               console.error('Failed to create bucket:', createRes.status, err);
           }
      } else {
          console.error('Error checking bucket:', response.status, await response.text());
      }
      
  } catch (e) {
      console.error('Fetch error:', e);
  }
}

setupBucket().catch(console.error);
