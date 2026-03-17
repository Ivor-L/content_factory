# Development Environment Configuration

This document outlines the necessary configuration and setup steps for the Content Factory Web development environment.

## 1. Prerequisites

### Direct Supabase Connectivity
Supabase is exposed only through the host loopback interface. You must run the app on the same server (or create an SSH tunnel / VPN) to reach it.

*   **Host:** `127.0.0.1`
*   **Port:** `54322` (host port that maps to `supabase_db:5432`)
*   **Database:** `postgres`
*   **User:** `postgres.your-tenant-id`
*   **SSL:** Disabled (`sslmode=disable` or `PGSSLMODE=disable`)

> Public IP `47.107.158.233` currently drops/blocks 5432/5433/54321/54322, so remote direct access fails unless you open the firewall or forward ports manually.

> If you rotate credentials in Supabase, update the `DATABASE_URL`/`DIRECT_URL` values accordingly.

## 2. Environment Variables (.env / .env.local)

These variables are configured in `.env` and `.env.local`.

*   `.env` —— 部署/服务器环境使用，连接 `127.0.0.1:54322`（Docker 宿主访问 supabase_db）。
*   `.env.local` —— 本地开发使用，如果你在自己电脑运行，需要把 host 改成 `47.107.158.233`（或你自己建立的隧道地址）。

### Database Configuration
Use the Supabase connection string exposed on `127.0.0.1:54322` (replace credentials with the ones from your Supabase project if they change).

*   **DATABASE_URL:**
    ```
    postgresql://postgres.your-tenant-id:<password>@127.0.0.1:54322/postgres?sslmode=disable
    ```
*   **DIRECT_URL:**
    ```
    postgresql://postgres.your-tenant-id:<password>@127.0.0.1:54322/postgres?sslmode=disable
    ```
*   **PGSSLMODE:**
    ```
    disable
    ```

### Supabase API Configuration
Using the SSL-secured domain.

*   **NEXT_PUBLIC_SUPABASE_URL:** `https://supabase-api.atomx.top`
*   **NEXT_PUBLIC_SUPABASE_ANON_KEY (Frontend):**
    ```
    <your_anon_key>
    ```
*   **SERVICE_ROLE_KEY (Backend / N8N):**
    > **WARNING:** This key has full admin access. Never expose it in the frontend.
    ```
    <your_service_role_key>
    ```
    > 开发/内测若暂时拿不到 service role key，可以留空。系统会自动回退为使用 anon key 写入 `uploads` bucket（确保 bucket 策略允许 INSERT）。
*   **NEXT_PUBLIC_SUPABASE_BUCKET:** Defaults to `uploads`. Override only if you provisioned a different public bucket for asset uploads.

### N8N Webhooks
Endpoints for various automation workflows.

*   **Product Analysis:** `https://hook.atomx.top/webhook/product_dna_web`
*   **Script Breakdown:** `https://hook.atomx.top/webhook/script_extract_web`
*   **Replication/Generation:** `https://hook.atomx.top/webhook/Getway_web`

### Credit System Configuration
*   **POINTS_API_BASE:** Base URL for the external credit system API.
    *   Default: `https://api.atomx.top`

## 3. Running the Application

1.  **Confirm loopback connectivity:** Make sure your container/host can reach `127.0.0.1:54322` (or set up SSH tunneling if running off-box).
2.  **Start Development Server:**
    ```bash
    npm run dev
    ```
    *   **Local Access:** `http://localhost:3000`
    *   **Network Access:** `http://<your-lan-ip>:3000` (e.g., `http://172.20.10.2:3000`)

## 4. Troubleshooting

*   **"Tenant or user not found" / DB Connection Error:**
    *   Confirm the credentials in `.env.local` match the Supabase project settings.
    *   Ensure the process reaches `127.0.0.1:54322`. If the app runs on a different machine, create an SSH tunnel (`ssh -L 54322:127.0.0.1:54322 user@server`) or open the firewall.
    *   Verify `PGSSLMODE=disable`; otherwise Prisma forces TLS and the server rejects the handshake.
*   **"ERR_NAME_NOT_RESOLVED" for `supabase-api.atomx.top`:**
    *   Ensure your DNS can resolve this domain. If on a restricted network, you may need to add a hosts entry or fix DNS settings.
*   **"Connection Refused" on localhost:3000:**
    *   Ensure `npm run dev` is running.
    *   If accessing from another device, ensure you use the LAN IP (e.g., `172.20.10.2`), not `localhost`.
