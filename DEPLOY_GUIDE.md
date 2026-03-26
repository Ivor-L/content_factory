# 生产部署指南

基于 `content-factory-web` 项目在 `atomx.top` 的实际部署经验整理。

## 基础信息

| 项目 | 值 |
|------|-----|
| 生产地址 | https://atomx.top |
| 应用服务器 | 47.107.158.233 |
| n8n 服务器 | 47.107.155.228 |
| Docker 容器端口 | 宿主机 3002 → 容器 3000 |
| Supabase API | https://supabase-api.atomx.top |
| n8n 编辑器 | https://n8n.atomx.top |
| n8n Webhook | https://hooks.atomx.top |

---

## 1. 环境变量配置

### 生产环境（服务器 `.env`）

```env
NEXT_PUBLIC_APP_URL="https://atomx.top"
NEXT_PUBLIC_SUPABASE_URL="https://supabase-api.atomx.top"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"

# Docker 容器内通过 host.docker.internal 访问宿主机上的 Supabase
DATABASE_URL="postgresql://supabase_admin:postgres@host.docker.internal:54322/postgres?sslmode=disable"
DIRECT_URL="postgresql://supabase_admin:postgres@host.docker.internal:54322/postgres?sslmode=disable"
```

### 本地开发（`.env`）

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

### 本地开发 SSH 隧道（只需 54322，Supabase Auth 直连线上）

```bash
ssh -L 54322:127.0.0.1:54322 root@47.107.158.233
```

---

## 2. Prisma 配置要点

### `lib/prisma.ts` — 必须使用懒加载代理

构建时不能要求 `DATABASE_URL`，否则 Next.js 构建会失败。使用懒加载代理，确保数据库连接只在运行时初始化：

```ts
function createLazyPrismaClient() {
  let client: ReturnType<typeof prismaClientSingleton> | undefined;
  return new Proxy({} as ReturnType<typeof prismaClientSingleton>, {
    get(_target, prop) {
      if (!client) {
        client = prismaClientSingleton();
      }
      return (client as unknown as Record<string | symbol, unknown>)[prop];
    },
  });
}

const prisma = globalThis.prisma ?? createLazyPrismaClient();
export default prisma;
if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;
```

### `prisma.config.ts` — 不能包含 datasource 硬编码

```ts
import { defineConfig, env } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

---

## 3. Dockerfile 关键点

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
# 必须先 COPY prisma 目录，否则 postinstall 中的 prisma generate 会失败
COPY prisma ./prisma
COPY package.json package-lock.json ./
# 不能加 --omit=dev，否则 prisma CLI（devDependency）不会被安装
RUN npm ci --registry=https://registry.npmmirror.com

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
```

---

## 4. docker-compose.yml 关键点

Docker 容器内必须通过 `host.docker.internal` 访问宿主机上的 Supabase（54322 端口），需要配置 `extra_hosts`：

```yaml
services:
  web:
    build: .
    container_name: content-factory-web
    restart: always
    ports:
      - "3002:3000"
    env_file:
      - .env
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

---

## 5. Nginx 配置（sub_nginx 容器）

配置文件位于服务器：`/etc/nginx/conf.d/atomx.conf`

**canvas-runtime SPA 路由关键写法**（两个 location 顺序不能颠倒）：

```nginx
# 静态资源必须用 ^~ 前缀，防止被下面的正则匹配覆盖
location ^~ /canvas-runtime/assets/ {
    proxy_pass http://172.17.0.1:3002;
}

# SPA 路由：所有 /canvas-runtime 路径都返回 index.html
location ~ ^/canvas-runtime {
    rewrite ^ /canvas-runtime/index.html break;
    proxy_pass http://172.17.0.1:3002;
}

location / {
    proxy_pass http://172.17.0.1:3002;
}
```

**SSL 证书注意事项**：
- 通配符证书路径：`/etc/letsencrypt/live/atomx.top/fullchain.pem`
- 证书覆盖：`*.atomx.top`、`*.supabase.atomx.top`、`atomx.top`
- 每个 server block 必须有 `server_name`，否则会成为 catch-all 导致错误证书被匹配

---

## 6. 部署流程

1. 本地代码改好后，通过 `scp` 或 Git 上传到服务器
2. 服务器上进入项目目录：`cd /root/content-factory-web`
3. 重新构建并启动：
   ```bash
   docker compose up -d --build
   ```
4. 查看日志确认启动成功：
   ```bash
   docker compose logs -f web
   ```

---

## 7. Supabase Auth 配置

Auth 回调地址在 `/root/srv/content-factory-web/supabase/config.toml` 中配置：

```toml
[auth]
site_url = "https://atomx.top"
additional_redirect_urls = ["https://atomx.top", "https://atomx.top/auth/callback"]
```

修改后需重启 Supabase：`supabase stop && supabase start`

---

## 8. 常见报错

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| `DATABASE_URL or DIRECT_URL is not set` (构建时) | Prisma client 在模块加载时初始化 | 使用懒加载代理（见第 2 节） |
| `prisma/schema.prisma not found` (构建时) | Dockerfile 未在 npm ci 前 COPY prisma 目录 | 在 `COPY package.json` 之前加 `COPY prisma ./prisma` |
| `prisma generate` 跳过 | `npm ci --omit=dev` 导致 prisma CLI 未安装 | 去掉 `--omit=dev` |
| Docker 内无法连接 127.0.0.1:54322 | 容器内 127.0.0.1 是容器自身，不是宿主机 | 改用 `host.docker.internal`，并配置 `extra_hosts` |
| `/canvas-runtime` JS 文件返回 HTML | nginx rewrite 覆盖了静态资源请求 | 静态资源 location 加 `^~` 前缀 |
| `app.atomx.top` 显示错误证书 | nginx 有无 `server_name` 的 catch-all block | 为每个域名添加独立 server block |
| 本地 `fetch failed` (Supabase Auth) | 隧道未转发 54321 端口，或密钥不匹配 | 本地直接用线上 Supabase URL（无需隧道） |
