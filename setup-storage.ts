
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

async function setupStorage() {
  const client = new Client({
    connectionString,
    ssl: false // Tunnel is non-SSL
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    // 1. Create 'uploads' bucket if not exists
    console.log("Checking 'uploads' bucket...");
    const checkBucket = await client.query(`
      SELECT id FROM storage.buckets WHERE id = 'uploads';
    `);

    if (checkBucket.rows.length === 0) {
      console.log("Creating 'uploads' bucket...");
      await client.query(`
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('uploads', 'uploads', true);
      `);
      console.log("'uploads' bucket created.");
    } else {
      console.log("'uploads' bucket already exists.");
    }

    // 2. Enable RLS on objects (it usually is enabled by default)
    // We need to add a policy to allow public read and authenticated upload?
    // Or just allow everything for now since it's a "Content Factory" tool?
    // Let's allow public read and insert for now.
    
    // Check if policy exists (complex to check, so we'll just try to create and ignore error or drop first)
    // Actually, let's just create a policy that allows everything for anon/authenticated for this bucket.
    
    console.log("Setting up storage policies...");
    
    // Policy: Public Read
    try {
        await client.query(`
            CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'uploads' );
        `);
        console.log("Created Public Access policy (SELECT).");
    } catch (e: any) {
        if (e.code === '42710') console.log("Public Access policy already exists.");
        else console.error("Error creating SELECT policy:", e.message);
    }

    // Policy: Public Insert (Allow anyone to upload for now, or authenticated?)
    // User is using anon key, so we need to allow anon.
    try {
        await client.query(`
            CREATE POLICY "Public Upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'uploads' );
        `);
        console.log("Created Public Upload policy (INSERT).");
    } catch (e: any) {
        if (e.code === '42710') console.log("Public Upload policy already exists.");
        else console.error("Error creating INSERT policy:", e.message);
    }

  } catch (err) {
    console.error('Error setting up storage:', err);
  } finally {
    await client.end();
  }
}

setupStorage();
