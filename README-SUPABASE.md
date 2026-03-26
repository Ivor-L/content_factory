# Supabase Integration Guide

## Overview
This project now targets the hosted Supabase deployment (cloud or managed stack).
- **API URL**: `https://supabase-api.atomx.top`
- **Postgres**: `db.<project-ref>.supabase.co:5432` (`postgres.<project-ref>` user, TLS required)
- **Storage**: Bucket `uploads` (public) served by the same Supabase domain.

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
Run the app anywhere with outbound access to Supabase using the managed connection string (replace placeholders).

```
postgresql://postgres.<project-ref>:<database-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

Add this value to both `DATABASE_URL` and `DIRECT_URL`, then start the dev server:

```bash
npm run dev
```

> 如果连接失败，请确认 `.env*` 中的 `DATABASE_URL` / `DIRECT_URL` 已更新为云端地址，并保持 `sslmode=require`。

### Step 2.5: 推荐的环境变量文件分工
- `.env`：服务器/容器部署使用，填入云端 Supabase 的正式凭证。
- `.env.local`：本地开发使用，可填入同一套凭证或使用受限服务角色。

### Step 3: Configure Storage
1. Go to **Storage** in Supabase Dashboard.
2. Create a new bucket named **`uploads`**.
3. Make it **Public**.
4. Add a policy to allow uploads (e.g., for `INSERT` operations).

## 🛠 （可选）本地 Supabase CLI 快速同步
如需在本地通过 Supabase CLI 运行一个「离线沙箱」用于开发，可参考以下步骤（适用于自建 CLI 环境；不影响线上数据库）：

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
- **App cannot connect?** 确认连接字符串指向云端 Supabase (`db.<project-ref>.supabase.co:5432`) 且 `sslmode=require`。
- **"Relation does not exist"?** Ensure you ran the SQL script successfully in Step 1.
