# Development Environment Configuration

This document outlines the necessary configuration and setup steps for the Content Factory Web development environment.

## 1. Prerequisites

### Hosted Supabase Connectivity
The project now uses Supabase Cloud (or another remotely hosted Supabase stack). Obtain the official connection string from the Supabase Dashboard and keep TLS enabled.

*   **Host:** `db.<project-ref>.supabase.co`
*   **Port:** `5432`
*   **Database:** `postgres`
*   **User:** `postgres.<project-ref>`
*   **SSL:** Required (`sslmode=require` / `PGSSLMODE=require`)

> Replace `<project-ref>` and `<database-password>` with your actual values. You can find them under **Project Settings → Database** in the Supabase dashboard.

## 2. Environment Variables (.env / .env.local)

These variables are configured in `.env` (production/servers) and `.env.local` (local development).

### Database Configuration
Use the managed Supabase connection string (TLS required). Example:

*   **DATABASE_URL:**
    ```
    postgresql://postgres.<project-ref>:<database-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
    ```
*   **DIRECT_URL:**
    ```
    postgresql://postgres.<project-ref>:<database-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
    ```
*   **PGSSLMODE:**
    ```
    require
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
*   **Storyboard (Draft → Board):** `N8N_STORYBOARD_SCRIPT_WEBHOOK` (default fallback: `https://n8n.atomx.top/webhook/897bb7fb-b878-4135-9aaf-d60beba1dbef`)
*   **XHS Text2Image:** `N8N_XHS_TEXT2IMG_WEBHOOK` (default fallback: `https://hooks.atomx.top/webhook/xhs_text2img_web`)
*   **Creator Reference Sync:** `VIRAL_CREATOR_SYNC_WEBHOOK_URL` — optional webhook endpoint that fetches the latest notes for a selected creator when用户在前端点击“同步最新笔记”。若不配置，系统会默认调用本应用的 `/api/webhook/creator-sync` stub（按钮始终可用）；如需接入真实采集器，可将其设置为前端应用内的相对路径或任意完整 URL，后台会POST创作者信息并附带 `x-user-api-key`（如存在）。

### Credit System Configuration
*   **POINTS_API_BASE:** Base URL for the external credit system API.
    *   Default: `https://api.atomx.top`

### NexAPI Routing & Proxy
These variables drive the NexAPI gateway (frontend console + `/api/nexapi/proxy/*` routes).

*   **NEXAPI_UPSTREAM_KEY** *(required)* — Upstream vendor key used when forwarding chat/responses requests.
*   **NEXAPI_ROUTE_MAIN** *(optional)* — Primary base URL for NexAPI traffic. Default: `https://aiapi.atomx.top`.
*   **NEXAPI_ROUTE_BACKUP** *(optional)* — Backup base URL. Default: `https://aiapi.nextide.top`.
*   **NEXAPI_EXTRA_ROUTES** *(optional)* — Comma-separated list of additional routes using the format  
    `id|label|https://base.url|origin`. Example:  
    ```
    NEXAPI_EXTRA_ROUTES=hk-pop|香港 POP|https://hk.aiapi.atomx.top|apac,edge-cdn|Edge CDN|https://edge.aiapi.atomx.top|global
    ```
    When configured, these routes automatically appear in the API Console health table and are available via the `X-NexAPI-Route` header.

## 3. Running the Application

1.  **Configure Supabase env vars:** Ensure `.env.local` / `.env` include the hosted Supabase credentials shown above.
2.  **Start Development Server:**
    ```bash
    npm run dev
    ```
    *   **Local Access:** `http://localhost:3000`
    *   **Network Access:** `http://<your-lan-ip>:3000` (e.g., `http://172.20.10.2:3000`)

## 4. Troubleshooting

*   **"Tenant or user not found" / DB Connection Error:**
    *   Confirm the credentials in `.env*` match the Supabase project settings.
    *   Ensure outbound traffic to `db.<project-ref>.supabase.co:5432` is allowed (VPN / firewall).
    *   `PGSSLMODE` **must** be `require`; Supabase Cloud enforces TLS.
*   **"ERR_NAME_NOT_RESOLVED" for `supabase-api.atomx.top`:**
    *   Ensure your DNS can resolve this domain. If on a restricted network, you may need to add a hosts entry or fix DNS settings.
*   **"Connection Refused" on localhost:3000:**
    *   Ensure `npm run dev` is running.
    *   If accessing from another device, ensure you use the LAN IP (e.g., `172.20.10.2`), not `localhost`.
