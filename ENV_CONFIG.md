# Development Environment Configuration

This document outlines the necessary configuration and setup steps for the Content Factory Web development environment.

## 1. Prerequisites

### Direct Supabase Connectivity
The database is now reachable directly over the public internet—no SSH tunnel is required. Make sure your IP is allow‑listed in Supabase (or that the project’s network policy allows public access) before attempting to connect.

*   **Supabase (Supavisor) Host:** `47.107.158.233`
*   **Port:** `5433` (public Supavisor pooler)
*   **Database:** `postgres`
*   **User:** `postgres.your-tenant-id`
*   **SSL:** Disabled (connection string explicitly sets `sslmode=disable`)

> If you rotate credentials in Supabase, update the `DATABASE_URL`/`DIRECT_URL` values accordingly.

## 2. Environment Variables (.env / .env.local)

These variables are configured in `.env` and `.env.local`.

### Database Configuration
Use the Supabase connection string directly (replace credentials with the ones from your Supabase project if they change).

*   **DATABASE_URL:**
    ```
    postgresql://postgres.your-tenant-id:Htk4XZETgYriBTd_qbjrjlNE6vEC68Y61XQNFsDT0v5A2NJcLD3CuQ@47.107.158.233:5433/postgres?sslmode=disable
    ```
*   **DIRECT_URL:**
    ```
    postgresql://postgres.your-tenant-id:Htk4XZETgYriBTd_qbjrjlNE6vEC68Y61XQNFsDT0v5A2NJcLD3CuQ@47.107.158.233:5433/postgres?sslmode=disable
    ```

### Supabase API Configuration
Using the SSL-secured domain.

*   **NEXT_PUBLIC_SUPABASE_URL:** `https://supabase-api.atomx.top`
*   **NEXT_PUBLIC_SUPABASE_ANON_KEY (Frontend):**
    ```
    eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzIzODc4NzIsICJleHAiOiAxOTMwMDY3ODcyfQ.ZlUh-VJ-6nAxvUfOQRxTicgAwJjiBoRITlb_mwuQyrM
    ```
*   **SERVICE_ROLE_KEY (Backend / N8N):**
    > **WARNING:** This key has full admin access. Never expose it in the frontend.
    ```
    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzI2MDk5OTIsImV4cCI6MjA4Nzk2OTk5Mn0.gXgmTX9Zoj7oESdbfFGWjbPcm7FGjvCGRLUj94_maGk
    ```

### N8N Webhooks
Endpoints for various automation workflows.

*   **Product Analysis:** `https://hook.atomx.top/webhook/product_dna_web`
*   **Script Breakdown:** `https://hook.atomx.top/webhook/script_extract_web`
*   **Replication/Generation:** `https://hook.atomx.top/webhook/Getway_web`

### Credit System Configuration
*   **POINTS_API_BASE:** Base URL for the external credit system API.
    *   Default: `https://api.atomx.top`

## 3. Running the Application

1.  **Confirm outbound connectivity:** Make sure your network can reach `47.107.158.233:5433` (no tunnel required).
2.  **Start Development Server:**
    ```bash
    npm run dev
    ```
    *   **Local Access:** `http://localhost:3000`
    *   **Network Access:** `http://<your-lan-ip>:3000` (e.g., `http://172.20.10.2:3000`)

## 4. Troubleshooting

*   **"Tenant or user not found" / DB Connection Error:**
    *   Confirm the credentials in `.env.local` match the Supabase project settings.
    *   Ensure your IP/network is allowed to access `47.107.158.233:5433`.
*   **"ERR_NAME_NOT_RESOLVED" for `supabase-api.atomx.top`:**
    *   Ensure your DNS can resolve this domain. If on a restricted network, you may need to add a hosts entry or fix DNS settings.
*   **"Connection Refused" on localhost:3000:**
    *   Ensure `npm run dev` is running.
    *   If accessing from another device, ensure you use the LAN IP (e.g., `172.20.10.2`), not `localhost`.
