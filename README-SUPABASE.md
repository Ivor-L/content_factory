# Supabase Integration Guide

## Overview
This project uses a self-hosted Supabase instance.
- **API URL**: `https://api.supabase.atomx.top`
- **Database Host (loopback)**: `127.0.0.1`
- **Exposed Port**: `54322` → maps to `supabase_db:5432`
- **Remote Access**: Public IP `47.107.158.233` currently blocks 5432/5433/54322; use SSH tunneling/VPN before pointing clients there.
- **Storage**: Supabase Storage (Bucket: `uploads`, exposed via `NEXT_PUBLIC_SUPABASE_BUCKET`, defaulting to this value)

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
Run the app on the same host (or tunnel) and use the loopback connection string (update the password/user if your project rotates credentials):

```
postgresql://postgres.your-tenant-id:<password>@127.0.0.1:54322/postgres?sslmode=disable
```

Add this value to both `DATABASE_URL` and `DIRECT_URL`, then start the dev server:

```bash
npm run dev
```

> If you still can’t connect, double-check that the process can reach `127.0.0.1:54322` (or that your SSH tunnel is active). Prisma must run with `PGSSLMODE=disable`.

### Step 2.5: 推荐的环境变量文件分工
- `.env`：用于服务器部署，保持 `host=127.0.0.1 port=54322`，供 Docker/PM2 直接连本机 Supabase。
- `.env.local`：用于本地开发；如果没有 SSH 隧道，就把 `host` 改成 `47.107.158.233`（或你的跳板 IP）。Next.js 在 `npm run dev` 时会优先读取 `.env.local`。

### Step 3: Configure Storage
1. Go to **Storage** in Supabase Dashboard.
2. Create a new bucket named **`uploads`**.
3. Make it **Public**.
4. Add a policy to allow uploads (e.g., for `INSERT` operations).

## 🛠 本地 Supabase CLI 快速同步（自建环境）
当你需要把服务器上的自建 Supabase 同步到本地 CLI 环境时，按下面的顺序操作可以避免迁移脚本顺序导致的报错：

1. **在服务器导出业务 schema**
   ```bash
   docker exec -t supabase_db_content-factory-web \
     pg_dump -U postgres -d postgres \
     --schema=public --schema=supabase_functions \
     > supabase/schema_public.sql
   ```
2. **把 `schema_public.sql` 拷到本地**  
   ```bash
   scp root@47.107.158.233:/root/content-factory-web/supabase/schema_public.sql ~/schema_public.sql
   ```
3. **临时跳过仓库里的迁移**（那些迁移依赖顺序目前不完整）：  
   ```bash
   mv supabase/migrations supabase/migrations.bak
   mkdir -p supabase/migrations
   ```
4. **启动本地 Supabase CLI**  
   ```bash
   supabase stop   # 如已在运行
   supabase start
   ```
5. **清空并重建 `public` schema（只影响 CLI 本地库）**  
   ```bash
   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
     -c "DROP SCHEMA IF EXISTS public CASCADE;"
   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
     -c "CREATE SCHEMA public AUTHORIZATION postgres;"
   ```
   > 如果需要导入 `supabase_functions` 里的钩子/函数，可保持默认 schema（默认 owner 是 `supabase_admin`，无需删除）。
6. **导入服务器导出的 schema**  
   ```bash
   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
     -f ~/schema_public.sql
   ```
   导入过程中可能会看到一些关于 `supabase_admin` 的 GRANT 警告，可忽略，只要 `public.*` 表和数据写入成功即可。
7. **恢复迁移目录（可选）**  
   ```bash
   rmdir supabase/migrations
   mv supabase/migrations.bak supabase/migrations
   ```
   未来若要重新整理迁移，先补齐建表 SQL，再把 `.sql.skip` 恢复即可。
8. **验证数据库可连通**  
   ```bash
   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
     -c "SELECT 'db connected' AS status;"
   ```
   如返回 `db connected`，即可 `npm run dev`，应用会使用 `.env.local` 中的本地 CLI 凭证。

## Troubleshooting
- **App cannot connect?** Ensure the process reaches `127.0.0.1:54322` (or enable a tunnel) and the credentials plus `PGSSLMODE=disable` are set.
- **"Relation does not exist"?** Ensure you ran the SQL script successfully in Step 1.
