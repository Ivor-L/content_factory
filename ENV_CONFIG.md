# Development Environment Configuration

This document outlines the necessary configuration and setup steps for the Content Factory Web development environment.

## 1. Prerequisites

### SSH Tunneling (Required for Database)
The database is hosted remotely and requires an SSH tunnel to access. This bypasses firewall restrictions and allows secure connection.

*   **Remote Server:** `47.107.158.233`
*   **Remote Database Port (Supavisor):** `5431`
*   **Local Mapped Port:** `54320`
*   **User:** `root`

**Command to start the tunnel:**
```bash
ssh -o ServerAliveInterval=60 -L 54320:127.0.0.1:5431 root@47.107.158.233 -N
```
*Note: You will need the SSH password for `root@47.107.158.233`.*

## 2. Environment Variables (.env / .env.local)

These variables are configured in `.env` and `.env.local`.

### Database Configuration
Using the SSH tunnel established above.

*   **DATABASE_URL:**
    ```
    postgresql://postgres.your-tenant-id:Htk4XZETgYriBTd_qbjrjlNE6vEC68Y61XQNFsDT0v5A2NJcLD3CuQ@127.0.0.1:54320/postgres
    ```
*   **DIRECT_URL:**
    ```
    postgresql://postgres.your-tenant-id:Htk4XZETgYriBTd_qbjrjlNE6vEC68Y61XQNFsDT0v5A2NJcLD3CuQ@127.0.0.1:54320/postgres
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

*   **Product Analysis:** `https://hooks.flowonn.com/webhook/product_dna_web`
*   **Script Breakdown:** `https://hooks.flowonn.com/webhook/script_extract_web`
*   **Replication/Generation:** `https://hooks.flowonn.com/webhook/Getway_web`

## 3. Running the Application

1.  **Ensure SSH Tunnel is active:** Check if port `54320` is listening or run the SSH command.
2.  **Start Development Server:**
    ```bash
    npm run dev
    ```
    *   **Local Access:** `http://localhost:3000`
    *   **Network Access:** `http://<your-lan-ip>:3000` (e.g., `http://172.20.10.2:3000`)

## 4. Troubleshooting

*   **"Tenant or user not found" / DB Connection Error:**
    *   Verify SSH tunnel is running.
    *   Check `.env.local` uses port `54320` and user `postgres.your-tenant-id`.
*   **"ERR_NAME_NOT_RESOLVED" for `supabase-api.atomx.top`:**
    *   Ensure your DNS can resolve this domain. If on a restricted network, you may need to add a hosts entry or fix DNS settings.
*   **"Connection Refused" on localhost:3000:**
    *   Ensure `npm run dev` is running.
    *   If accessing from another device, ensure you use the LAN IP (e.g., `172.20.10.2`), not `localhost`.
