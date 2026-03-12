# 服务器部署修复指南 (Server Fix Guide)

根据您的描述和项目配置分析，您的服务器存在 Nginx 反向代理配置错误和 Supabase 环境变量配置错误。请按照以下步骤在服务器上逐一修复。

## 1. 修复 Nginx 配置 (解决 502 和 SSL 问题)

目前的 502 错误是因为 Nginx 找不到后端服务，或者端口转发错误。Supabase 连接失败是因为 SSL 证书配置丢失或域名指向错误。

请在服务器上找到 Nginx 配置文件（通常位于 `/etc/nginx/nginx.conf` 或 `/etc/nginx/conf.d/default.conf`），并将内容修改为以下结构。

**注意：** 请确保您的 SSL 证书路径正确。如果您使用的是 Certbot，路径通常是 `/etc/letsencrypt/live/atomx.top/...`。

```nginx
# /etc/nginx/nginx.conf 或 /etc/nginx/conf.d/atomx.conf

# 定义上游服务
upstream frontend_app {
    # 对应 docker-compose.yml 中的 3002:3000
    server 127.0.0.1:3002;
}

upstream supabase_kong {
    # Supabase Kong 网关默认端口
    server 127.0.0.1:8000;
}

# 1. 前端应用 (www.atomx.top)
server {
    listen 80;
    server_name www.atomx.top atomx.top;
    # 强制跳转 HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name www.atomx.top atomx.top;

    # SSL 证书路径 (请根据实际情况修改)
    ssl_certificate /etc/letsencrypt/live/atomx.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/atomx.top/privkey.pem;

    location / {
        proxy_pass http://frontend_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 2. Supabase API (supabase-api.atomx.top)
server {
    listen 80;
    server_name supabase-api.atomx.top;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name supabase-api.atomx.top;

    # SSL 证书路径 (请使用通配符证书或单独的证书)
    # 如果您没有单独的证书，且之前的证书包含此域名，请使用相同的路径
    ssl_certificate /etc/letsencrypt/live/atomx.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/atomx.top/privkey.pem;

    location / {
        proxy_pass http://supabase_kong;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # 增加超时时间，防止长连接中断
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

修改完成后，检查并重启 Nginx：
```bash
sudo nginx -t
sudo nginx -s reload
```

---

## 2. 修复 Supabase 环境变量 (解决 API URL 错误)

您提到 Supabase 的 API URL 变成了 `https://www.atomx.top`，这会导致 n8n 无法连接（因为 n8n 试图通过 API 域名访问，但被错误重定向到了前端页面）。

请进入服务器上部署 Supabase 的目录（通常是 `supabase/docker` 或您自定义的目录），找到 `.env` 文件。

**修改以下变量：**

```env
# 确保 API_EXTERNAL_URL 指向 Supabase API 域名，而不是前端域名
API_EXTERNAL_URL=https://supabase-api.atomx.top

# 如果有 SUPABASE_PUBLIC_URL，也请修正
SUPABASE_PUBLIC_URL=https://supabase-api.atomx.top

# 确保 Kong 监听端口正确 (通常默认是 8000)
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
```

修改完成后，重启 Supabase 服务：
```bash
# 在 docker-compose.yml 所在目录执行
docker-compose down
docker-compose up -d
```

---

## 3. 验证 n8n 连接

完成上述两步后：
1.  Supabase API 将恢复在 `https://supabase-api.atomx.top` 上访问。
2.  SSL 证书将生效（前提是 Nginx 配置的证书路径正确）。
3.  n8n 应该能够通过 HTTPS 正常连接 Supabase。

如果 n8n 仍然报错 "Self-signed certificate" 或证书信任问题，您可以临时在 n8n 节点中启用 "Ignore SSL Issues"（忽略 SSL 问题），或者确保服务器上的 SSL 证书链是完整的（fullchain.pem）。
