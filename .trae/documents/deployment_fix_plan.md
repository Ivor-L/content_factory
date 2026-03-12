# 部署故障排查与修复计划

## 1. 目标
解决当前生产环境面临的两个核心问题：
1. **n8n 连接 Supabase 失败** (502 Bad Gateway)。
2. **Web 应用无法启动** (数据库连接被拒绝 `Connection refused`)。

## 2. 诊断步骤 (执行顺序)
我们将按以下步骤逐一排查，确定问题根源后再执行修复。

### 第一步：检查 Supabase 服务状态与配置
需要确认 Supabase 的 API 网关 (Kong) 是否正常运行，以及环境变量是否正确。

**命令：**
```bash
# 1. 检查 Supabase 容器状态
docker ps -a | grep -E 'kong|supabase'

# 2. 检查 Supabase 环境变量 (确认 API_EXTERNAL_URL)
cat /root/supabase-self-hosted/supabase/docker/.env | grep API_EXTERNAL_URL
```
**预期结果：**
- 容器状态应为 `Up`。
- `API_EXTERNAL_URL` 必须严格等于 `https://supabase-api.atomx.top` (无多余斜杠，无拼写错误)。

### 第二步：检查数据库监听状态
Web 应用连不上数据库通常是因为 PostgreSQL 只监听了 `127.0.0.1`，导致容器（位于 `172.17.0.x`）无法访问。

**命令：**
```bash
# 检查宿主机端口监听情况
netstat -tlnp | grep 5433
```
**预期结果：**
- 应该看到 `0.0.0.0:5433` 或 `:::5433`。
- 如果看到 `127.0.0.1:5433`，说明数据库**拒绝外部连接**（包括容器），这是问题的根源。

### 第三步：验证网络连通性
在修复前，我们需要确认哪种连接方式是通的。

**命令：**
```bash
# 测试容器是否能通过 Docker 网关访问宿主机端口
# 如果这个命令成功，说明 172.17.0.1 是可用的，之前是配置错了
docker run --rm alpine/curl curl -v telnet://172.17.0.1:5433
```

## 3. 修复方案

根据诊断结果，我们将执行以下修复方案之一：

### 方案 A：标准 Docker 网络修复 (推荐)
如果数据库监听 `0.0.0.0`，最稳妥的方式是使用 `host.docker.internal`。

1. **修改 `docker-compose.yml`**：
   添加 `extra_hosts` 映射，让容器能解析 `host.docker.internal` 到宿主机 IP。
   ```yaml
   services:
     web:
       extra_hosts:
         - "host.docker.internal:host-gateway"
   ```

2. **修改 `.env`**：
   将 `DATABASE_URL` 中的 IP 改为 `host.docker.internal`。

### 方案 B：强制 Host 模式 (备选)
如果方案 A 失败，或者数据库只监听 `127.0.0.1` 且无法修改配置：
- 修改 `docker-compose.yml`，设置 `network_mode: "host"`。
- 修改 `.env`，使用 `127.0.0.1:5433`。
- **注意**：这会占用宿主机的 3000 端口，若冲突需修改 Next.js 端口。

## 4. 验证计划
修复完成后，执行以下验证：
1. `docker compose logs -f web` 确认无数据库连接错误。
2. 访问 `https://supabase-api.atomx.top` 确认无 502。
3. n8n 连接测试。
