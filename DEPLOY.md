# 部署指南 - AtomX (content-factory-web)

本指南将帮助您将应用部署到服务器 `47.107.158.233` 并绑定域名 `www.atomx.top`。

## 前置条件

1.  **服务器**: `47.107.158.233` (阿里云 ECS)
2.  **域名**: `www.atomx.top` 已解析到该 IP
3.  **代码**: 已推送到 GitHub

## 预检：检查端口占用（强烈推荐）

在开始部署之前，强烈建议您在服务器上检查关键端口（3000, 80, 443, 5433）是否可用，以避免服务启动失败。

**1. 登录服务器**

```bash
ssh root@47.107.158.233
```

**2. 运行检查命令**

```bash
# 检查端口占用情况
netstat -tulpn | grep -E ':(3000|80|443|5433)'
```
*如果提示 `netstat: command not found`，请先运行 `apt install net-tools` 安装。*

**3. 分析结果**

- **无输出**：完美！端口均未被占用，可以直接部署。
- **3000 端口有输出**：说明有旧的应用在运行。
  - 解决方法：找到对应的 PID 或容器 ID，停止它。如果是 Docker 容器，运行 `docker ps` 查看并 `docker stop <container_id>`。
- **80/443 端口有输出**：通常是被 Nginx 占用。
  - 如果是您安装的 Nginx，这是正常的，后续只需修改配置文件。
  - 如果是 Apache 或其他服务，建议停止并卸载，或者修改我们的 Nginx 配置使用其他端口。
- **5433 端口有输出**：这是 Supabase 数据库端口。
  - 确保它是您预期的 Supabase 实例。如果它在运行，我们的应用才能连接数据库。

## 第一步：登录服务器

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
