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

> ⚠️ **部署前必须逐项核对**：`.env` 中缺少任何一项都会导致对应功能静默失败（不报启动错误，只在运行时出错）。

### 生产环境完整 `.env`（服务器 `/root/content-factory-web/.env`）

```env
# ── 数据库（Docker 容器内通过 host.docker.internal 访问宿主机 Supabase）──────
DATABASE_URL=postgresql://supabase_admin:postgres@host.docker.internal:54322/postgres?sslmode=disable
SHADOW_DATABASE_URL=postgresql://supabase_admin:postgres@host.docker.internal:54322/content_factory_shadow?sslmode=disable
DIRECT_URL=postgresql://supabase_admin:postgres@host.docker.internal:54322/postgres?sslmode=disable
PGSSLMODE=disable

# ── Supabase ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://supabase-api.atomx.top
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SUPABASE_SERVICE_ROLE_KEY=sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz
NEXT_PUBLIC_SUPABASE_BUCKET=uploads

# ── App ───────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://atomx.top

# ── Webhook 回调鉴权 ───────────────────────────────────────────────────────────
ADMIN_TOKEN=dev-sync-token-1774007442

# n8n / 轮询服务 回调到 App 时使用的公网地址（必须是外网可访问地址）
N8N_CALLBACK_BASE_URL=https://atomx.top

# ── N8N Webhooks ──────────────────────────────────────────────────────────────
N8N_PRODUCT_ANALYSIS_WEBHOOK=https://hooks.atomx.top/webhook/product_dna_web
N8N_SCRIPT_BREAKDOWN_WEBHOOK=https://hooks.atomx.top/webhook/script_extract_web
N8N_STORYBOARD_BREAKDOWN_WEBHOOK=https://hooks.atomx.top/webhook/storyboard_disassembly_web
N8N_EXTRACT_COPY_WEBHOOK=https://hooks.atomx.top/webhook/extract_copy
N8N_REPLICATION_WEBHOOK=https://hooks.atomx.top/webhook/Getway_web
N8N_STORYBOARD_GEN_WEBHOOK=https://hooks.atomx.top/webhook/storyboard_gateway_web
N8N_STORYBOARD_SCRIPT_WEBHOOK=https://hooks.atomx.top/webhook/xhs_chuangzuo_web
N8N_VEO3_WEBHOOK=https://hooks.atomx.top/webhook/storyboard_video
N8N_IMAGE_GEN_WEBHOOK=https://hooks.atomx.top/webhook/storyboard-image-generate

# ── Canvas（无线画布）─────────────────────────────────────────────────────────
# 系统级云雾 API Key，所有用户共用
CANVAS_UPSTREAM_DEFAULT_API_KEY=sk-gmTSsDWAsxVZf41AM5CrhdoV4leDluYeuFgg1P8VwrkpWQTm
CANVAS_CREDITS_DEFAULT_API_KEY=sk-gmTSsDWAsxVZf41AM5CrhdoV4leDluYeuFgg1P8VwrkpWQTm
CANVAS_SKIP_CREDITS_CHECK=true
# 云雾 API 基础地址
CANVAS_API_BASE_URL=https://yunwu.ai/v1
# 视频生成接口
CANVAS_VIDEO_GENERATIONS_URL=https://yunwu.ai/v1/video/create
CANVAS_VIDEO_TASK_URL_TEMPLATE=https://yunwu.ai/v1/video/query?id={taskId}
# 视频轮询服务回调地址（必须是外网可访问的公网地址，容器内 localhost 无效）
CANVAS_VIDEO_POLL_CALLBACK_BASE_URL=https://atomx.top

# ── 其他 ──────────────────────────────────────────────────────────────────────
NEXAPI_UPSTREAM_KEY=your-upstream-key
```

> **注意**：`.env` 中变量值不要加引号（不写 `KEY="value"`，直接写 `KEY=value`），否则 Docker `--env-file` 会把引号也计入值。

### 部署前环境变量检查命令

```bash
# 核查关键变量是否已配置（值为空则说明缺失）
grep -E "CANVAS_VIDEO_POLL_CALLBACK_BASE_URL|CANVAS_UPSTREAM_DEFAULT_API_KEY|N8N_CALLBACK_BASE_URL|NEXT_PUBLIC_APP_URL|ADMIN_TOKEN" /root/content-factory-web/.env
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

**SSL 证书注意事项**：
- 通配符证书路径：`/etc/letsencrypt/live/atomx.top/fullchain.pem`
- 证书覆盖：`*.atomx.top`、`*.supabase.atomx.top`、`atomx.top`
- 每个 server block 必须有 `server_name`，否则会成为 catch-all 导致错误证书被匹配

---

## 6. 部署流程

1. 本地代码改好后，push 到 Git
2. 服务器上进入项目目录：`cd /root/content-factory-web`
3. 先同步模板中新增加的环境变量到线上 `.env`（只补缺失项，不覆盖已有值）：
   ```bash
   ./scripts/sync-env-from-template.sh .env.production.example .env
   ```
4. 发布前校验运行时环境变量（缺失会直接报错）：
   ```bash
   ./scripts/validate-runtime-env.sh --mode=runtime
   ```
5. 使用安全发布脚本（已内置“补齐缺失变量 + env 校验 + `git pull --ff-only` + `docker compose up -d --build`）：
   ```bash
   ./scripts/deploy-safe.sh
   ```
6. 查看日志确认启动成功：
   ```bash
   docker compose logs -f web
   ```

> ⚠️ **常见陷阱**：`docker compose up -d`（不带 `--build`）只会重启已有镜像，不会重新编译代码。每次改动代码后必须加 `--build`。
>
> ⚠️ **强规则**：线上 `.env` 只能手工维护，不要在发布流程中执行任何覆盖命令（如 `cp xxx .env`）。一旦覆盖，Apify 等密钥会“看似发布成功、功能实际失效”。
>
> ⚠️ **推荐规范**：新增环境变量后，统一更新 `.env.production.example`，发布时由 `sync-env-from-template.sh` 自动补齐到线上 `.env`，避免“本地有、线上漏配”。

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
| `app.atomx.top` 显示错误证书 | nginx 有无 `server_name` 的 catch-all block | 为每个域名添加独立 server block |
| 本地 `fetch failed` (Supabase Auth) | 隧道未转发 54321 端口，或密钥不匹配 | 本地直接用线上 Supabase URL（无需隧道） |
| `Invalid supabaseUrl` (运行时) | `NEXT_PUBLIC_*` 变量在构建时烘焙进 JS bundle，运行时 .env 不生效 | docker compose build 时必须通过 `args` 传入，见第 4 节 |
| P1013: database string is invalid | `.env` 中变量值带引号（如 `DATABASE_URL="..."`），Docker `--env-file` 会把引号也作为值的一部分 | 去掉 `.env` 中的引号，直接写 `DATABASE_URL=...` |
| 改了代码部署后没有生效 | 用了 `docker compose up -d` 而未加 `--build`，镜像未重新构建 | 每次部署必须用 `docker compose up -d --build` |
| 中文 IME 输入法在 ReactFlow 节点内无法使用 | `.react-flow__node` CSS 设置了 `user-select: none`，阻止输入法合成事件 | 在 `globals.css` 加 `.react-flow__node textarea { user-select: text !important; }` |
| 无线画布生图提示「画布服务尚未配置」 | `.env` 缺少 `CANVAS_UPSTREAM_DEFAULT_API_KEY` | 按第 1 节补全 Canvas 环境变量 |
| 视频生成后前端订阅无回调 | `CANVAS_VIDEO_POLL_CALLBACK_BASE_URL` 未配置，容器内 `request.nextUrl.origin` 返回内网地址，轮询服务无法回调 | 设置 `CANVAS_VIDEO_POLL_CALLBACK_BASE_URL=https://atomx.top` |
| 云雾报错信息不显示给用户 | 云雾返回 `success:false` 时前端未检测该字段 | 已修复（`postJson` 增加 `success/ok/code` 失败判断） |
