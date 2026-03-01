# n8n 工作流构建 Skill - 环境配置

> **用途**：首次使用必读。从零部署 n8n、创建 API Key、配置 n8n-mcp MCP Server 的完整指南。

从零部署 n8n 到配置 n8n-mcp MCP Server 的完整指南。

---

## 前置条件清单

| 序号 | 条件 | 状态检查 | 必须 |
|------|------|----------|------|
| 1 | Claude Code 已安装 | 终端输入 `claude` 有响应 | 是 |
| 2 | Node.js 18+ 已安装 | `node -v` 输出 ≥ v18 | 是 |
| 3 | n8n 实例运行中 | 浏览器访问 n8n URL 能打开 | 是 |
| 4 | n8n API Key 已创建 | Settings → API → 有 Key | 是 |
| 5 | n8n-mcp 已注册 | Claude Code 中 `/mcp` 显示 n8n-mcp 绿色 | 是 |
| 6 | Skill 凭据已配置 | `credentials/n8n.md` 已填写实际值 | 是 |

### 前置软件安装

**1. Claude Code**

本 Skill 运行在 [Claude Code](https://docs.anthropic.com/en/docs/build-with-claude/claude-code/overview)（Anthropic 官方 CLI）中。需先安装：

```bash
npm install -g @anthropic-ai/claude-code
```

> 需要 Anthropic API 订阅（Max 或 Pro 计划）。

**2. Node.js 18+**

n8n-mcp 依赖 Node.js 运行时。检查版本：

```bash
node -v
```

未安装或版本过低时，按系统选择安装方式：

| 系统 | 推荐安装方式 |
|------|-------------|
| macOS | `brew install node` 或 [nvm](https://github.com/nvm-sh/nvm)：`nvm install 22` |
| Ubuntu/Debian | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo bash - && sudo apt install -y nodejs` |
| Windows | [Node.js 官网](https://nodejs.org/) 下载 LTS 安装包 |

> 推荐使用 nvm 管理 Node.js 版本，避免全局权限问题。

---

## 平台兼容性

本 Skill **不绑定任何特定部署方式**。Skill 运行时仅通过 HTTP API 与 n8n 通信，只要实例可达、API Key 有效即可。

### Skill 的实际依赖

| 接口 | 路径前缀 | 认证方式 | 用途 |
|------|---------|---------|------|
| 公开 API | `/api/v1/*` | `X-N8N-API-KEY` | 工作流 CRUD、凭据管理、执行验证 |
| 内部 REST | `/rest/*` | `Cookie: n8n-auth`（可选） | 社区节点管理 |

### 全场景支持

| 部署场景 | URL 示例 | 兼容 | 备注 |
|---------|---------|:--:|------|
| **云端 - Zeabur** | `https://xxx-n8n.zeabur.app` | 是 | — |
| **云端 - Railway / Render / Fly.io** | `https://n8n-xxx.up.railway.app` | 是 | — |
| **云端 - n8n Cloud 官方** | `https://xxx.app.n8n.cloud` | 是 | 社区节点 REST API 返回 403，Skill 自动降级为 GUI 安装引导 |
| **云端 - 自有 VPS + Docker** | `https://n8n.yourdomain.com` | 是 | — |
| **本地 - Docker** | `http://localhost:5678` | 是 | — |
| **本地 - npm / npx** | `http://localhost:5678` | 是 | npx 无持久化，仅适合临时测试 |
| **局域网 - 其他机器** | `http://192.168.1.100:5678` | 是 | — |

### 唯一的注意事项

**Form Trigger 需要 `WEBHOOK_URL`**：使用 Form Trigger 的工作流需要 n8n 知道自己的公网地址才能正确生成表单 URL。这是 n8n 本身的要求，与 Skill 无关。

| 部署方式 | 是否需要手动设置 `WEBHOOK_URL` |
|---------|:--:|
| 本地开发（localhost） | 否（n8n 自动推断） |
| 云端有固定域名 | 是（`WEBHOOK_URL=https://你的域名/`） |
| n8n Cloud | 否（官方自动配置） |

---

## 第一步：部署 n8n 实例

### 6 种部署方式对比

| 方案 | 难度 | 成本 | 持久化 | 推荐场景 |
|------|------|------|--------|----------|
| **A. Zeabur 一键部署** | 低 | ~$5/月 | 自动 | 个人用户首选，免运维 |
| **B. Docker 单机部署** | 中 | 服务器费用 | 需配 volume | 自有 VPS，完全控制 |
| **C. Docker Compose** | 中 | 服务器费用 | 需配 volume | 生产环境，带数据库 |
| **D. npm 全局安装** | 低 | 免费 | 本地文件 | 开发测试 |
| **E. npx 临时运行** | 低 | 免费 | 无 | 快速体验，临时测试 |
| **F. n8n Cloud 官方托管** | 低 | $24/月起 | 自动 | 企业用户，官方支持 |

---

### 方案 A：Zeabur 一键部署

**优点**：零运维、自动 HTTPS、一键部署、自动重启
**缺点**：按资源计费、冷启动延迟

**步骤：**

1. 登录 [Zeabur](https://zeabur.com)
2. **Create Project** → **Marketplace** → 搜索 `n8n`
3. 选择 n8n 模板 → **Deploy**
4. 等待部署完成，获得 URL（如 `https://xxx-n8n.zeabur.app`）
5. 首次访问设置管理员账号密码

**推荐环境变量：**

```
N8N_SECURE_COOKIE=false
GENERIC_TIMEZONE=Asia/Shanghai
N8N_DEFAULT_LOCALE=zh
```

---

### 方案 B：Docker 单机部署

**优点**：一条命令启动、环境隔离、易于备份迁移
**缺点**：需自行管理 HTTPS、需 VPS

**启动命令：**

```bash
docker run -d \
  --name n8n \
  --restart unless-stopped \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  -e GENERIC_TIMEZONE=Asia/Shanghai \
  -e N8N_SECURE_COOKIE=false \
  docker.n8n.io/n8nio/n8n
```

**挂载说明：**

| 路径 | 内容 |
|------|------|
| `/home/node/.n8n` | 数据库、凭证、加密密钥 |

**验证运行：**

```bash
docker ps | grep n8n
curl http://localhost:5678/healthz
```

---

### 方案 C：Docker Compose（生产推荐）

**优点**：声明式配置、支持 PostgreSQL、适合长期运行
**缺点**：配置稍复杂

```yaml
version: '3.8'
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    volumes:
      - n8n_data:/home/node/.n8n
    environment:
      - GENERIC_TIMEZONE=Asia/Shanghai
      - N8N_SECURE_COOKIE=false
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - WEBHOOK_URL=${WEBHOOK_URL}
      # 使用 PostgreSQL 时取消注释
      # - DB_TYPE=postgresdb
      # - DB_POSTGRESDB_HOST=postgres
      # - DB_POSTGRESDB_PORT=5432
      # - DB_POSTGRESDB_DATABASE=n8n
      # - DB_POSTGRESDB_USER=n8n
      # - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}

  # 生产环境推荐 PostgreSQL
  # postgres:
  #   image: postgres:16-alpine
  #   restart: unless-stopped
  #   volumes:
  #     - postgres_data:/var/lib/postgresql/data
  #   environment:
  #     - POSTGRES_DB=n8n
  #     - POSTGRES_USER=n8n
  #     - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

volumes:
  n8n_data:
  # postgres_data:
```

**启动：**

```bash
docker compose up -d
```

---

### 方案 D：npm 全局安装

**优点**：直接在系统运行、方便调试
**缺点**：依赖本地 Node.js、升级需手动

```bash
npm install -g n8n
n8n start
```

浏览器打开 `http://localhost:5678`。

**指定端口：**

```bash
N8N_PORT=8080 n8n start
```

---

### 方案 E：npx 临时运行

**优点**：无需安装、一次性使用
**缺点**：每次重新下载、无持久化

```bash
npx n8n
```

**适用场景**：快速体验、功能验证、临时测试。

---

### 方案 F：n8n Cloud 官方托管

**优点**：官方维护、自动更新、企业支持、SSO
**缺点**：按执行次数/工作流计费，成本较高

| 计划 | 价格 | 工作流数 | 执行次数/月 |
|------|------|---------|------------|
| Starter | $24/月 | 5 | 2,500 |
| Pro | $60/月 | 15 | 10,000 |
| Enterprise | 定制 | 无限 | 定制 |

**注册**：[n8n.io/cloud](https://n8n.io/cloud)

---

### 关键环境变量参考

| 变量 | 说明 | 推荐值 |
|------|------|--------|
| `GENERIC_TIMEZONE` | 时区 | `Asia/Shanghai` |
| `N8N_SECURE_COOKIE` | HTTPS cookie | 无 HTTPS 时设 `false` |
| `N8N_ENCRYPTION_KEY` | 加密密钥 | 随机字符串（首次启动自动生成） |
| `WEBHOOK_URL` | **必须设置** - Webhook/Form 公网地址，缺失会导致 Form Trigger 404 | `https://你的域名/` |
| `N8N_DEFAULT_LOCALE` | 默认语言 | `zh` |
| `N8N_PORT` | 监听端口 | `5678`（默认） |
| `EXECUTIONS_MODE` | 执行模式 | `regular`（默认）/ `queue` |

---

## 第二步：创建 API Key

1. 登录 n8n 实例
2. 点击左下角头像 → **Settings**
3. 选择 **API** 标签页
4. 点击 **Create API Key**
5. 复制 API Key（仅显示一次，妥善保存）

**验证命令：**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "X-N8N-API-KEY: {你的API_KEY}" \
  "https://{你的n8n地址}/api/v1/workflows?limit=1"
```

返回 `200` = 成功，`401` = Key 无效，超时 = 实例未运行。

**保存凭证**：写入 Skill 凭据文件 `credentials/n8n.md`

---

## 第三步：配置 n8n-mcp MCP Server

### 关于 n8n-mcp

[n8n-mcp](https://github.com/czlonkowski/n8n-mcp) 是第三方开源 MCP Server（MIT），让 Claude Code 直接操作 n8n。

**核心能力**：搜索 1,084 个节点 / 创建更新验证工作流 / 2,709 个模板库

**无需单独部署**：n8n-mcp 是一个 npm 包，以 stdio 模式运行在 Claude Code 本地进程内。没有服务器、没有端口、没有 Docker。Claude Code 启动时自动拉起，结束时自动回收。你只需一条 `claude mcp add` 命令注册即可。

### 配置方法

**第一步：预安装 n8n-mcp 包**

npx 首次运行需下载 n8n-mcp（~50MB 依赖），Claude Code 启动时超时会导致连接失败。必须先手动预安装：

```bash
# 预安装，确保包已缓存
npx -y n8n-mcp@latest --help 2>&1 | head -3

# 如果报 ENOTEMPTY 错误，先清理 npx 缓存再重试
rm -rf ~/.npm/_npx && npx -y n8n-mcp@latest --help 2>&1 | head -3
```

**第二步：写入 MCP 配置**

使用 `claude mcp add` 命令（写入 `~/.claude.json`，用户级全局生效）。根据你的部署方式替换 `N8N_API_URL`：

**通用命令**：

```bash
claude mcp add -s user \
  -e MCP_MODE=stdio \
  -e LOG_LEVEL=error \
  -e DISABLE_CONSOLE_OUTPUT=true \
  -e N8N_API_URL="你的n8n地址" \
  -e N8N_API_KEY="你的API_KEY" \
  -- n8n-mcp npx n8n-mcp
```

**各部署场景的 `N8N_API_URL` 值**：

| 部署方式 | `N8N_API_URL` 值 | 说明 |
|---------|-----------------|------|
| Zeabur | `https://xxx-n8n.zeabur.app` | Zeabur 分配的子域名 |
| Railway | `https://n8n-xxx.up.railway.app` | Railway 分配的子域名 |
| Render | `https://n8n-xxx.onrender.com` | Render 分配的子域名 |
| Fly.io | `https://n8n-xxx.fly.dev` | Fly.io 分配的子域名 |
| n8n Cloud | `https://xxx.app.n8n.cloud` | 官方托管地址 |
| VPS + Docker（有域名） | `https://n8n.yourdomain.com` | 自有域名 + 反向代理 |
| VPS + Docker（无域名） | `http://你的VPS_IP:5678` | 直接 IP 访问 |
| 本地 Docker / npm / npx | `http://localhost:5678` | 默认端口 |
| 局域网其他机器 | `http://192.168.x.x:5678` | 局域网 IP |

> **注意**：`N8N_API_URL` 不含尾部 `/` 和 `/api/v1`，只填根地址。

**完整示例（本地 Docker）**：

```bash
claude mcp add -s user \
  -e MCP_MODE=stdio \
  -e LOG_LEVEL=error \
  -e DISABLE_CONSOLE_OUTPUT=true \
  -e N8N_API_URL="http://localhost:5678" \
  -e N8N_API_KEY="eyJhbGci..." \
  -- n8n-mcp npx n8n-mcp
```

**完整示例（云端 Zeabur）**：

```bash
claude mcp add -s user \
  -e MCP_MODE=stdio \
  -e LOG_LEVEL=error \
  -e DISABLE_CONSOLE_OUTPUT=true \
  -e N8N_API_URL="https://myapp-n8n.zeabur.app" \
  -e N8N_API_KEY="eyJhbGci..." \
  -- n8n-mcp npx n8n-mcp
```

验证已写入：

```bash
claude mcp list | grep n8n
```

### 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `MCP_MODE` | 是 | 固定 `stdio`，通信协议 |
| `LOG_LEVEL` | 推荐 | `error`，防止日志干扰 |
| `DISABLE_CONSOLE_OUTPUT` | 推荐 | `true`，禁止控制台输出 |
| `N8N_API_URL` | 是 | n8n 地址（不含 `/api/v1`） |
| `N8N_API_KEY` | 是 | API 密钥 |

### 验证

**第三步：手动验证 MCP 协议**（重启 CC 前先确认）

```bash
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}\n' \
  | MCP_MODE=stdio LOG_LEVEL=error DISABLE_CONSOLE_OUTPUT=true \
    N8N_API_URL="https://你的n8n地址" \
    N8N_API_KEY="你的API_KEY" \
    npx -y n8n-mcp 2>/dev/null \
  | head -1
```

返回含 `"serverInfo":{"name":"n8n-documentation-mcp"}` 即成功。

**第四步：重启 Claude Code** 后：

1. 输入 `/mcp` 确认 `n8n-mcp` 绿色
2. 让 Claude 调用 `n8n_list_workflows` 测试

### 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| Server 启动失败 | Node.js 版本低 | 安装 Node.js 18+ |
| ENOTEMPTY 缓存损坏 | npx 缓存目录冲突 | `rm -rf ~/.npm/_npx` 后重新 `npx -y n8n-mcp@latest` |
| JSON 解析错误 | 缺 `MCP_MODE=stdio` | 添加环境变量 |
| 连接超时 | n8n 未运行或首次下载慢 | 先手动 `npx -y n8n-mcp@latest` 预装 |
| 401 Unauthorized | API Key 无效 | 重新创建 Key |
| 工具不可用 | 缺 `N8N_API_URL` | 添加环境变量 |

---

## 第四步：配置 Skill 凭据

编辑 Skill 内置凭据文件 `credentials/n8n.md`，填入你自己的值：

| 字段 | 说明 | 占位符 |
|------|------|--------|
| 实例 URL | n8n 地址（不含尾部 `/`） | `{N8N_URL}` |
| API Key | 公开 API 密钥 | `{N8N_API_KEY}` |
| Session Cookie | 浏览器 n8n-auth Cookie（可选，仅社区节点管理需要） | `{N8N_SESSION}` |

### 验证配置

| # | 检查项 | 通过标准 |
|---|--------|----------|
| 1 | 实例可访问 | 浏览器打开 `{N8N_URL}` 能正常加载 |
| 2 | API Key 有效 | `curl -s -o /dev/null -w "%{http_code}" -H "X-N8N-API-KEY: {N8N_API_KEY}" "{N8N_URL}/api/v1/workflows?limit=1"` 返回 `200` |
| 3 | n8n-mcp 绿色 | Claude Code 中 `/mcp` 显示 n8n-mcp 状态正常 |
| 4 | 凭据文件存在 | `credentials/n8n.md` 已填写实际值 |

---

## n8n-mcp 工具清单

### 节点发现（2 个）

| 工具 | 用途 |
|------|------|
| `search_nodes` | 按关键词搜索节点 |
| `get_node` | 获取节点属性定义 |

### 工作流管理（8 个）

| 工具 | 用途 |
|------|------|
| `n8n_list_workflows` | 列出所有工作流 |
| `n8n_get_workflow` | 获取工作流 JSON |
| `n8n_create_workflow` | 创建工作流 |
| `n8n_update_partial_workflow` | 增量更新（最常用） |
| `n8n_delete_workflow` | 删除工作流 |
| `n8n_activate_workflow` | 激活工作流 |
| `n8n_deactivate_workflow` | 停用工作流 |
| `n8n_deploy_template` | 部署模板 |

### 验证与执行（3 个）

| 工具 | 用途 |
|------|------|
| `n8n_validate_workflow` | 验证配置有效性 |
| `n8n_test_workflow` | 测试执行 |
| `n8n_executions` | 获取执行结果 |

---

## 参考资料

- [n8n-mcp GitHub](https://github.com/czlonkowski/n8n-mcp)
- [n8n 官方文档](https://docs.n8n.io/)
- [n8n API 文档](https://docs.n8n.io/api/)
- [n8n Docker 部署](https://docs.n8n.io/hosting/installation/docker/)
- [n8n Cloud](https://n8n.io/cloud)
- [Zeabur](https://zeabur.com)
