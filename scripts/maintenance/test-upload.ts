
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

// Disable SSL verification for self-signed/invalid certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpload() {
  console.log('Testing Supabase Storage Upload...');

  const fileName = `test-${Date.now()}.txt`;
  const fileContent = 'Hello, Supabase!';
  
  // Create a Blob/Buffer
  const buffer = Buffer.from(fileContent, 'utf-8');

  console.log(`Uploading to bucket 'uploads' as '${fileName}'...`);

  const { data, error } = await supabase
    .storage
    .from('uploads')
    .upload(fileName, buffer, {
      contentType: 'text/plain',
      upsert: false
    });

  if (error) {
    console.error('❌ Upload Failed!');
    console.error('Error Message:', error.message);
    console.error('Error Details:', error);
  } else {
    console.log('✅ Upload Success!');
    console.log('Path:', data.path);
    
    // Get Public URL
    const { data: publicUrlData } = supabase
      .storage
      .from('uploads')
      .getPublicUrl(fileName);
      
    console.log('Public URL:', publicUrlData.publicUrl);
  }
}

testUpload();
