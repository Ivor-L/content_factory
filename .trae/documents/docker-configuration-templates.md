# Docker配置模板集合

## 1. 基础Dockerfile模板

### Node.js应用标准Dockerfile
```dockerfile
# 构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 生产阶段
FROM node:18-alpine

# 创建非root用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# 设置工作目录
WORKDIR /app

# 复制依赖和代码
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs . .

# 环境变量
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
ENV PORT=3000

# 切换用户
USER nextjs

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3000

CMD ["npm", "start"]
```

### Python应用标准Dockerfile
```dockerfile
# 构建阶段
FROM python:3.11-slim AS builder

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# 生产阶段
FROM python:3.11-slim

WORKDIR /app

# 复制Python依赖
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# 复制应用代码
COPY . .

# 环境变量
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

EXPOSE 8000

CMD ["python", "app.py"]
```

## 2. Docker Compose配置模板

### 开发环境docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "${APP_PORT:-3000}:3000"
    volumes:
      - .:/app
      - /app/node_modules
      - ./logs:/app/logs
    environment:
      - NODE_ENV=development
      - CHOKIDAR_USEPOLLING=true
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
    env_file:
      - .env.development
    depends_on:
      - db
      - redis
    command: npm run dev

  db:
    image: postgres:15-alpine
    ports:
      - "${DB_PORT:-5432}:5432"
    environment:
      - POSTGRES_DB=${DB_NAME:-myapp}
      - POSTGRES_USER=${DB_USER:-postgres}
      - POSTGRES_PASSWORD=${DB_PASSWORD:-password}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "${NGINX_PORT:-80}:80"
      - "${NGINX_SSL_PORT:-443}:443"
    volumes:
      - ./config/nginx.dev.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app

volumes:
  postgres_data:
  redis_data:

networks:
  default:
    driver: bridge
```

### 生产环境docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NODE_ENV: production
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    image: myapp:latest
    ports:
      - "${APP_PORT:-3000}:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
    env_file:
      - .env.production
    volumes:
      - ./logs:/app/logs
      - ./uploads:/app/uploads
    restart: unless-stopped
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx.prod.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
      - ./static:/usr/share/nginx/html
    depends_on:
      - app
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=${DB_NAME}
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  backup:
    image: postgres:15-alpine
    volumes:
      - ./backups:/backups
      - ./scripts/backup.sh:/backup.sh
    environment:
      - POSTGRES_DB=${DB_NAME}
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    command: |
      sh -c 'echo "0 2 * * * /backup.sh" | crontab - && crond -f'
    depends_on:
      - db

volumes:
  postgres_data:
  redis_data:

networks:
  default:
    driver: bridge
```

## 3. Nginx配置模板

### 开发环境nginx.conf
```nginx
events {
    worker_connections 1024;
}

http {
    upstream app {
        server app:3000;
    }

    server {
        listen 80;
        server_name localhost;

        location / {
            proxy_pass http://app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        location /static/ {
            alias /usr/share/nginx/html/static/;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

### 生产环境nginx.conf
```nginx
events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # 性能优化
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 20M;

    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        application/atom+xml
        application/javascript
        application/json
        application/rss+xml
        application/vnd.ms-fontobject
        application/x-font-ttf
        application/x-web-app-manifest+json
        application/xhtml+xml
        application/xml
        font/opentype
        image/svg+xml
        image/x-icon
        text/css
        text/plain
        text/x-component;

    upstream app {
        least_conn;
        server app:3000 max_fails=3 fail_timeout=30s;
    }

    # HTTP重定向到HTTPS
    server {
        listen 80;
        server_name _;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS服务器
    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # SSL配置
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        # 安全头
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

        location / {
            # 重要：确保端口正确指向应用服务端口（例如 3000 或 8000）
            # 如果 Supabase 或 Kong 网关监听 8000，这里必须是 8000
            proxy_pass http://app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            
            # 超时设置
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        location /static/ {
            alias /usr/share/nginx/html/static/;
            expires 1y;
            add_header Cache-Control "public, immutable";
            add_header X-Content-Type-Options nosniff;
        }

        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
```

## 4. 环境变量模板

### .env.development
```bash
# 应用配置
NODE_ENV=development
APP_PORT=3000
API_URL=http://localhost:3000/api
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# 数据库配置
DB_HOST=db
DB_PORT=5432
DB_NAME=myapp_dev
DB_USER=postgres
DB_PASSWORD=dev_password

# Redis配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# 日志配置
LOG_LEVEL=debug
LOG_FILE=./logs/app.log

# 其他配置
DEBUG=true
CORS_ORIGIN=http://localhost:3000
```

### .env.production
```bash
# 应用配置
NODE_ENV=production
APP_PORT=3000
API_URL=https://your-domain.com/api
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-url.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_prod_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_prod_service_role_key

# 数据库配置
DB_HOST=db
DB_PORT=5432
DB_NAME=myapp_prod
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Redis配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# 日志配置
LOG_LEVEL=info
LOG_FILE=/app/logs/app.log

# 安全配置
JWT_SECRET=your_jwt_secret_key
SESSION_SECRET=your_session_secret

# 性能配置
CACHE_TTL=3600
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

## 5. 构建脚本模板

### build.sh
```bash
#!/bin/bash

set -e

echo "🚀 开始构建应用..."

# 检查环境
if [ -z "$NODE_ENV" ]; then
    echo "❌ NODE_ENV 未设置"
    exit 1
fi

# 清理旧的构建
echo "🧹 清理旧的构建文件..."
rm -rf dist build .next

# 安装依赖
echo "📦 安装依赖..."
npm ci

# 运行测试
echo "🧪 运行测试..."
npm test

# 构建应用
echo "🔨 构建应用..."
npm run build

# 复制配置文件
echo "📋 复制配置文件..."
cp config/config.${NODE_ENV}.js dist/config.js

# 构建Docker镜像
echo "🐳 构建Docker镜像..."
docker build -t myapp:${NODE_ENV} \
  --build-arg NODE_ENV=${NODE_ENV} \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
  .

echo "✅ 构建完成！"
```

### docker-deploy.sh
```bash
#!/bin/bash

set -e

ENV=${1:-development}
VERSION=${2:-latest}

echo "🚀 部署到 ${ENV} 环境..."

# 构建镜像
echo "🔨 构建镜像..."
docker-compose -f docker-compose.${ENV}.yml build

# 推送到镜像仓库（如果需要）
if [ "$ENV" = "production" ]; then
    echo "📤 推送镜像到仓库..."
    docker tag myapp:${VERSION} your-registry.com/myapp:${VERSION}
    docker push your-registry.com/myapp:${VERSION}
fi

# 启动服务
echo "🚀 启动服务..."
docker-compose -f docker-compose.${ENV}.yml up -d

# 健康检查
echo "🏥 健康检查..."
sleep 10
curl -f http://localhost:${APP_PORT:-3000}/health || {
    echo "❌ 健康检查失败"
    docker-compose -f docker-compose.${ENV}.yml logs
    exit 1
}

echo "✅ 部署成功！"
```

## 6. 使用说明

### 6.1 开发环境启动
```bash
# 1. 复制环境变量
cp .env.example .env.development

# 2. 启动开发环境
docker-compose -f docker-compose.development.yml up -d

# 3. 查看日志
docker-compose -f docker-compose.development.yml logs -f app
```

### 6.2 生产环境部署
```bash
# 1. 设置环境变量
cp .env.example .env.production
# 编辑 .env.production 文件，设置正确的配置

# 2. 运行部署脚本
./docker-deploy.sh production v1.0.0

# 3. 验证部署
curl -f https://your-domain.com/health
```

### 6.3 备份与恢复
```bash
# 数据库备份
./scripts/backup-db.sh

# 数据库恢复
./scripts/restore-db.sh backup-file.sql
```
