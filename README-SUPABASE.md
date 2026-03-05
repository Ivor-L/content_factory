# Supabase Integration Guide

## Overview
This project uses a self-hosted Supabase instance.
- **API URL**: `https://api.supabase.atomx.top`
- **Database Host**: `47.107.158.233`
- **Database Port**: `5431` (Remote) -> `54320` (Local SSH Tunnel)
- **Storage**: Supabase Storage (Bucket: `uploads`)

## 🚀 Manual Database Setup (Recommended)

Since automated migration encountered network issues, you can manually create the required tables in your Supabase dashboard.

### Step 1: Run SQL Script
1. Log in to your **Supabase Dashboard**.
2. Go to the **SQL Editor** (usually the icon with `>_` or "SQL").
3. Click **New Query**.
4. Open the file `supabase_schema.sql` in this project.
5. Copy the entire content and paste it into the SQL Editor.
6. Click **Run**.

This will create all the necessary tables (`Product`, `Script`, `Character`, etc.) and relationships.

### Step 2: Connect Your Application
To run the Next.js application locally, you still need to connect to the remote database. Since direct connection was blocked, **you must use the SSH Tunnel**.

1. **Start the SSH Tunnel** (Keep this terminal open):
   ```bash
   ssh -L 54320:127.0.0.1:5431 root@47.107.158.233 -N
   ```

2. **Run the Application** (In a new terminal):
   ```bash
   npm run dev
   ```

The application is configured to connect to `127.0.0.1:54320`, which tunnels to your remote database.

### Step 3: Configure Storage
1. Go to **Storage** in Supabase Dashboard.
2. Create a new bucket named **`uploads`**.
3. Make it **Public**.
4. Add a policy to allow uploads (e.g., for `INSERT` operations).

## Troubleshooting
- **App cannot connect?** Check if the SSH tunnel terminal is still running.
- **"Relation does not exist"?** Ensure you ran the SQL script successfully in Step 1.
