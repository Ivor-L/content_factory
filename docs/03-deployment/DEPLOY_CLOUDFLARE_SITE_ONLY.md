# Cloudflare 部署（仅官网）

本方案只发布官网页面（`/`、`/openclaw`），不对外暴露系统后台页面。

## 1. 登录 Cloudflare

```bash
npx wrangler login
```

## 2. 设置官网模式环境变量

在 Cloudflare Worker / Pages 项目环境变量中添加：

- `SITE_ONLY_MODE=true`
- `SITE_ONLY_HOSTS=nextide.ai,www.nextide.ai`
- `NEXT_PUBLIC_SITE_ONLY=true`
- `NEXT_PUBLIC_ENABLE_REFERRAL_WATCHER=false`
- `NEXT_PUBLIC_DASHBOARD_URL=https://atomx.top/login`

说明：
- `SITE_ONLY_MODE`：启用官网隔离路由逻辑（根路径不再跳转 `/dashboard`）。
- `NEXT_PUBLIC_SITE_ONLY`：启用官网模式（不再跳转后台路由）。
- `NEXT_PUBLIC_DASHBOARD_URL`：官网里 Dashboard 按钮跳转到你的正式系统域名（登录入口）。
- `NEXT_PUBLIC_ENABLE_REFERRAL_WATCHER=false`：避免官网部署依赖 Supabase 登录能力。

## 3. 构建并部署到 Cloudflare

```bash
npx opennextjs-cloudflare@latest build
npx opennextjs-cloudflare@latest deploy
```

部署成功后，记录输出的 Worker 名称（例如 `content-factory-web`）。

## 4. 绑定域名 `nextide.ai`

先确保 `nextide.ai` 这个域名已经托管到 Cloudflare（Zone 在同一账号内）。

然后执行：

```bash
npx wrangler domains add nextide.ai --custom-domain
npx wrangler domains add www.nextide.ai --custom-domain
```

如果命令提示需要指定 Worker 名称，请加上：

```bash
npx wrangler domains add nextide.ai --custom-domain --name <YOUR_WORKER_NAME>
npx wrangler domains add www.nextide.ai --custom-domain --name <YOUR_WORKER_NAME>
```

## 5. 验证

- `https://nextide.ai` 打开官网首页
- `https://nextide.ai/openclaw` 打开官网 OpenClaw 页面
- `https://nextide.ai/dashboard` 会被重定向到首页（官网隔离生效）
