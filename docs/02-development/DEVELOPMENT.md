# 本地开发指南

## 1. 前置条件

- Node.js LTS
- npm
- SSH 访问生产服务器（用于数据库隧道）

## 2. 安装与启动

```bash
npm install
npm run dev
```

默认访问：`http://localhost:3000`

## 3. 环境变量配置

项目根目录需要 `.env` 文件，内容如下：

```env
# 通过 SSH 隧道连接线上数据库（Prisma 直连）
DATABASE_URL="postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres?sslmode=disable"
DIRECT_URL="postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres?sslmode=disable"
PGSSLMODE=disable

# Supabase Auth 直接用线上地址，无需隧道
NEXT_PUBLIC_SUPABASE_URL="https://supabase-api.atomx.top"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
```

`.env.local` 里存放画布相关的 API Key 等本地覆盖配置。

## 4. SSH 数据库隧道

本地开发需要打开 SSH 隧道才能连接线上数据库：

```bash
ssh -L 54322:127.0.0.1:54322 root@47.107.158.233
```

保持终端窗口不关闭，隧道断开后数据库请求会失败。

> Supabase Auth API 直接使用线上地址（`https://supabase-api.atomx.top`），**不需要**额外的隧道。

## 5. 常用命令

```bash
npm run dev      # 本地开发
npm run build    # 构建
npm run lint     # 代码检查
```

## 6. API 路由入口

所有后端接口在 `app/api/` 目录下（Next.js Route Handlers）：

- 产品分析触发：`POST /api/products/analyze`
- 脚本拆解触发：`POST /api/scripts/breakdown`
- 积分代理：`GET /api/integration/credits`

## 7. Webhook 回调入口

n8n 等第三方平台的回调接口（仅服务端使用）：

- 复刻回调：`POST /api/webhook/replication`
- 故事板拆分回调：`POST /api/webhook/storyboard-split`
- 数字人回调：`POST /api/webhook/digital-human`

## 8. 数据库与迁移（Prisma）

```bash
# 同步 schema（开发时）
npx prisma db push

# 生成 Prisma Client
npx prisma generate

# 查看数据
npx prisma studio
```

## 9. 部署

参考：[生产部署指南](../DEPLOY_GUIDE.md)
