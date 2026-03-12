# Supabase Integration Guide

## Overview
This project uses a self-hosted Supabase instance.
- **API URL**: `https://api.supabase.atomx.top`
- **Database Host**: `47.107.158.233`
- **Database Port**: `5433` (Supavisor public pooler)
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
The database is now reachable directly—no SSH tunnel is required. Use the Supabase connection string exposed in `.env` (update the password/user if your project rotates credentials):

```
postgresql://postgres.your-tenant-id:<password>@47.107.158.233:5433/postgres?sslmode=disable
```

Add this value to both `DATABASE_URL` and `DIRECT_URL`, then start the dev server:

```bash
npm run dev
```

> If you still can’t connect, double-check that your IP/network is allowed to reach `47.107.158.233:5433`.

### Step 3: Configure Storage
1. Go to **Storage** in Supabase Dashboard.
2. Create a new bucket named **`uploads`**.
3. Make it **Public**.
4. Add a policy to allow uploads (e.g., for `INSERT` operations).

## Troubleshooting
- **App cannot connect?** Ensure your outbound network can reach `47.107.158.233:5433` and the credentials in `.env` are correct.
- **"Relation does not exist"?** Ensure you ran the SQL script successfully in Step 1.
