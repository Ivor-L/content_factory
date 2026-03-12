# Next.js + Prisma 7 + Docker 部署指南

本指南基于 `content-factory-web` 项目的实际部署经验，重点解决了 Prisma 7 兼容性、Next.js Standalone 构建、网络环境优化及数据库迁移等核心问题。

## 1. 核心文件配置

### 1.1 Dockerfile (生产环境优化版)

此 Dockerfile 解决了以下关键问题：
- **Prisma 7 兼容性**：Builder 阶段使用 TS config，Runner 阶段替换为 JS config。
- **构建速度**：使用阿里云 Alpine 镜像和 npm 淘宝镜像。
- **运行时依赖**：显式复制 Prisma Client 和 Standalone 依赖。
- **内存优化**：限制 Node.js 内存使用。

```dockerfile
# Base image
FROM node:22-alpine AS base

# Replace apk repositories with Aliyun mirror
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile --registry=https://registry.npmmirror.com; \
  elif [ -f package-lock.json ]; then npm ci --registry=https://registry.npmmirror.com; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile --registry=https://registry.npmmirror.com; \
  else echo "Lockfile not found." && exit 1; fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1

# Generate Prisma Client (build time)
# 注意：构建时需要临时注入 .env 变量供 prisma generate 使用
RUN export $(grep -v "^#" .env | xargs) && npx prisma generate

RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; fi

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install openssl for Prisma
RUN apk add --no-cache openssl
RUN npm install -g prisma --registry=https://registry.npmmirror.com

COPY --from=builder /app/public ./public
RUN mkdir .next && chown nextjs:nodejs .next

# 复制 Standalone 构建产物
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 关键：显式复制 Prisma Client，防止运行时找不到模块
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# 关键技巧：在 Runtime 阶段创建一个简单的 JS config 文件
# 这绕过了 Prisma 7 对 TS config 文件的依赖问题，并直接读取运行时环境变量
RUN echo 'module.exports = { schema: "prisma/schema.prisma", datasource: { url: process.env.DATABASE_URL } }' > prisma.config.js

# 删除原来的 TS config 防止冲突
RUN rm -f prisma.config.ts

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
```

### 1.2 docker-entrypoint.sh (启动脚本)

使用 `db push` 替代 `migrate deploy`，适应无迁移文件的场景。

```bash
#!/bin/sh
set -e

echo "Pushing database schema..."
# 使用 --accept-data-loss 强制同步 schema，避免交互式确认卡住脚本
npx prisma db push --accept-data-loss

echo "Starting application..."
exec "$@"
```

### 1.3 docker-compose.yml

```yaml
version: '3.9'

services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: content-factory-web
    restart: always
    ports:
      - "3002:3000"  # 映射到宿主机 3002 端口
    env_file:
      - .env         # 注入环境变量
```

## 2. 代码适配 (Next.js SSG)

如果页面中包含直接的数据库查询（`prisma.findMany` 等），Next.js 默认会在构建时尝试执行（SSG）。如果此时无法连接数据库，构建会失败。

**解决方案**：在相关 `page.tsx` 文件顶部添加强制动态渲染配置。

```typescript
// app/(main)/xxx/page.tsx
export const dynamic = "force-dynamic"; // <--- 添加这一行

import prisma from "@/lib/prisma";
// ...
```

## 3. 服务器环境准备

### 3.1 解决内存溢出 (OOM)
对于小内存服务器（如 2G/4G 内存），构建过程极易崩溃。建议启用 Swap。

```bash
# 创建 4G Swap 文件
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
# 持久化配置
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 3.2 网络加速
如果无法拉取 GitHub 代码，建议在本地打包后上传，或配置 Git 代理。

## 4. 部署流程

1.  **上传代码**：将项目代码上传至服务器。
2.  **配置环境变量**：确保项目根目录下有 `.env` 文件，且包含正确的 `DATABASE_URL`。
3.  **构建并启动**：
    ```bash
    docker compose up -d --build
    ```
4.  **验证服务**：
    ```bash
    docker compose logs -f web
    # 看到 "Ready on http://localhost:3000" 即为成功
    ```
5.  **开放端口**：在阿里云安全组中放行 **3002** 端口（TCP）。

## 5. 常见报错排查

| 错误信息 | 原因 | 解决方案 |
| :--- | :--- | :--- |
| `Error: The datasource.url property is required...` | Prisma 7 检测到 config 文件但无法读取环境变量。 | 确保 Dockerfile 中使用了 JS config 替换策略。 |
| `Error: Cannot find module '.prisma/client/default'` | Standalone 模式未包含 Prisma Client。 | 确保 Dockerfile 中显式 COPY 了 `.prisma` 和 `@prisma` 目录。 |
| `P3005: The database schema is not empty` | 数据库非空且无迁移记录，导致 `migrate deploy` 失败。 | 改用 `prisma db push --accept-data-loss`。 |
| `HTTP 502 Bad Gateway` (浏览器) | 服务未启动或端口被防火墙拦截。 | 检查 `docker compose logs`；检查阿里云安全组规则。 |
| `PrismaConfigEnvError` (构建时) | 构建时 `prisma generate` 读不到环境变量。 | 确保 Dockerfile 中有 `RUN export $(grep ... .env) && npx prisma generate`。 |
