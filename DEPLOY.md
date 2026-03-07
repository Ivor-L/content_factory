# 部署指南 - AtomX (content-factory-web)

本指南将帮助您将应用部署到服务器 `47.107.158.233` 并绑定域名 `www.atomx.top`。

## 前置条件

1.  **服务器**: `47.107.158.233` (阿里云 ECS)
2.  **域名**: `www.atomx.top` 已解析到该 IP
3.  **代码**: 已推送到 GitHub

## 端口冲突分析

根据您的 `docker ps` 结果，我们发现了一个非常重要的信息：**您的服务器上已经运行着一套完整的服务**，包括 Supabase 全家桶、n8n 工作流系统以及其他名为 `sub_*` 的服务。

以下是具体的冲突点：

1.  **3000 端口** (`supabase-studio`)：被 Supabase 的管理后台占用。这意味着**我们不能使用 3000 端口**来部署我们的应用。
2.  **80/443 端口** (`sub_nginx`)：被一个现有的 Nginx 容器占用，它似乎是整个服务器的入口网关。
3.  **5433 端口** (`supabase-pooler`)：这是 Supabase 的数据库连接池，我们的应用需要连接它，这是正常的。

### 解决方案：修改端口并复用 Nginx

为了不破坏现有的服务（特别是 Supabase 和 n8n），我们应该采取**避让策略**：

1.  **修改应用端口**：将我们的应用端口从 `3000` 改为 `3002`（因为 3000 被 Studio 占用，3001 被 `sub_admin` 占用）。
2.  **接入现有 Nginx**：我们需要修改现有的 `sub_nginx` 配置，让它把 `www.atomx.top` 的流量转发到我们的新端口 `3002`。

## 第一步：修改 Docker Compose 配置

请在本地修改 `docker-compose.yml`，将端口映射改为 `3002:3000`。

```yaml
    ports:
      - "3002:3000"  # 宿主机 3002 -> 容器 3000
```

## 第二步：部署应用

登录服务器并部署：

```bash
cd content-factory-web
git pull origin main
docker compose down
docker compose up -d --build
```

此时应用将在 `http://localhost:3002` 运行。

## 第三步：配置网关 (sub_nginx)

这一步比较关键。由于 `80` 和 `443` 被容器 `sub_nginx` (`77694899f7b5`) 接管，我们需要知道这个 Nginx 的配置文件挂载在哪里。

1.  **查找 Nginx 配置位置**：
    ```bash
    docker inspect sub_nginx | grep Source
    ```
    这会告诉您宿主机上哪个目录挂载到了容器内。

2.  **修改 Nginx 配置**：
    在找到的配置目录下（通常是 `conf.d` 或 `nginx.conf`），添加一个新的 server 块（或修改现有的）：

    ```nginx
    server {
        listen 80;
        server_name www.atomx.top atomx.top;

        location / {
            # 注意：由于 Nginx 在容器内，访问宿主机端口需要用 host.docker.internal 或 宿主机IP
            # 如果 host.docker.internal 不可用，请使用服务器内网 IP 或公网 IP
            proxy_pass http://172.17.0.1:3002; 
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
    ```
    *(注：`172.17.0.1` 通常是 Docker 宿主机的网关 IP)*

3.  **重载 Nginx**：
    ```bash
    docker exec sub_nginx nginx -s reload
    ```

## 备选方案：如果不方便改 sub_nginx

如果 `sub_nginx` 是第三方维护的或者是不可修改的，您可以考虑：
- **方案 B**: 停止并删除 `sub_nginx`，然后在宿主机上直接安装 Nginx 接管所有流量（但这可能会破坏其他服务的配置）。
- **方案 C**: 使用非 80/443 端口访问，例如 `http://www.atomx.top:3002`（需要开放安全组）。

**强烈建议尝试第三步的方案，这是最稳妥的。**


```bash
ssh root@47.107.158.233
```

## 第二步：更新代码

进入项目目录（假设在 `/root/content-factory-web`）：

```bash
cd content-factory-web
git pull origin main
```

## 第三步：配置环境变量

确保 `.env` 文件使用的是生产环境配置。
您可以直接复制 `.env.production`：

```bash
cp .env.production .env
```

**注意**: 检查 `.env` 中的 `DATABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_URL` 是否正确指向了您的 Supabase 服务。

## 第四步：启动应用 (Docker)

使用 Docker Compose 启动 Next.js 应用：

```bash
docker compose down  # 停止旧容器（如果有）
docker compose up -d --build
```

此时，应用应该在 `http://localhost:3000` 运行。

## 第五步：配置 Nginx (反向代理)

为了让外部通过 `www.atomx.top` 访问，我们需要配置 Nginx。

1.  **安装 Nginx** (如果未安装):
    ```bash
    sudo apt update
    sudo apt install nginx
    ```

2.  **创建配置文件**:
    ```bash
    sudo nano /etc/nginx/sites-available/atomx
    ```

3.  **粘贴以下内容**:

    ```nginx
    server {
        server_name www.atomx.top atomx.top;

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

4.  **启用配置**:
    ```bash
    sudo ln -s /etc/nginx/sites-available/atomx /etc/nginx/sites-enabled/
    sudo nginx -t  # 测试配置是否正确
    sudo systemctl restart nginx
    ```

## 第六步：配置 HTTPS (SSL)

使用 Certbot 自动申请和配置免费 SSL 证书：

1.  **安装 Certbot**:
    ```bash
    sudo apt install certbot python3-certbot-nginx
    ```

2.  **申请证书**:
    ```bash
    sudo certbot --nginx -d www.atomx.top -d atomx.top
    ```
    按照提示输入邮箱并同意条款。Certbot 会自动修改 Nginx 配置以启用 HTTPS。

## 第七步：验证

打开浏览器访问 [https://www.atomx.top](https://www.atomx.top)，您应该能看到您的应用。

---

## 常见问题

### 数据库连接失败
如果 Docker 容器无法连接数据库，请检查防火墙设置，确保 5433/5431 端口允许访问，或者在 `.env` 中使用 Docker 内部网络别名（如果 Supabase 也在同一个 Docker 网络中）。

### 端口冲突
如果 3000 端口被占用，请修改 `docker-compose.yml` 中的端口映射，例如 `"3001:3000"`，然后更新 Nginx 配置中的 `proxy_pass` 为 `http://localhost:3001`。
