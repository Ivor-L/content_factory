# 服务器部署故障排查与修复计划

根据您描述的服务器部署问题（502 错误、SSL 证书问题、Supabase 连接失败、API URL 配置错误），制定以下排查与修复计划。

由于我当前处于本地开发环境，无法直接访问您的远程服务器，我们将通过检查本地代码库中的部署配置（Docker, Nginx, Env）来定位问题，并生成修复方案供您在服务器上执行。

## 阶段一：配置分析与诊断 (Analysis)

1.  **检查项目架构与部署文件**
    *   搜索并读取 `docker-compose.yml` 或相关部署脚本，确认服务编排结构（Frontend, Supabase, Nginx, n8n 是否都在同一网络下）。
    *   查找 Nginx 配置文件（通常在 `nginx/`, `docker/config/nginx` 或类似路径）。

2.  **排查 `www.atomx.top` 502 Bad Gateway 问题**
    *   检查 Nginx 中关于 `www.atomx.top` 的 `server` 块配置。
    *   确认 `proxy_pass` 指向的上游服务（Upstream）名称和端口是否与 Docker 容器内部端口一致（Next.js 通常是 3000）。

3.  **排查 Supabase 连接与 SSL 问题**
    *   检查 `supabase-api.atomx.top` 的 Nginx 配置。
    *   确认 SSL 证书路径配置是否正确，以及证书文件是否与新安装的证书匹配。
    *   检查 Supabase 的 Kong 网关配置（如果是自托管 Supabase），确认监听端口和协议。

4.  **排查 API URL 变更为 `www.atomx.top` 的问题**
    *   检查 Supabase 相关的环境变量配置（如 `.env` 或 `docker-compose.yml` 中的 `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` 等）。
    *   确认是否有配置错误将 API URL 指向了前端域名。

## 阶段二：修复实施 (Fix Implementation)

5.  **修正 Nginx 配置**
    *   根据诊断结果，修正 `nginx.conf` 或 `conf.d/*.conf` 中的域名绑定、SSL 路径和反向代理端口。
    *   确保 HTTP 到 HTTPS 的重定向配置正确。

6.  **修正 Supabase 环境变量**
    *   将 Supabase 服务的 `API_EXTERNAL_URL` 修正回 `https://supabase-api.atomx.top`（或正确的 API 网关地址）。
    *   确保 n8n 连接所需的内部/外部网络别名正确。

7.  **解决端口冲突**
    *   检查 `docker-compose.yml` 中的端口映射（`ports` 部分），确保没有重复占用宿主机端口（如 80, 443, 3000, 8000, 5432 等）。

## 阶段三：验证与部署 (Verification & Deployment)

8.  **生成部署更新指南**
    *   整理所有修改后的配置文件。
    *   提供在服务器上执行的命令清单（如 `docker-compose up -d --force-recreate`, `nginx -s reload` 等）。

9.  **验证清单**
    *   访问 `https://www.atomx.top` 确认页面加载正常。
    *   访问 `https://supabase-api.atomx.top` 确认 SSL 安全且无 502。
    *   在 n8n 中测试 Supabase 节点连接。
    *   检查 Supabase Dashboard 中的 API URL 显示是否恢复正常。
