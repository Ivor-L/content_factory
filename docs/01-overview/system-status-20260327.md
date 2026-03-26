# NexTide / Content Factory Web 平台概览（2026-03-27）

本文汇总目前仓库中两大子系统（主应用 & NexAPI 平台）的功能、数据对接、数据库/存储方案以及关键环境配置，便于后续开发或拆分部署。

---

## 1. 系统划分

| 模块 | 说明 | 当前状态 |
| --- | --- | --- |
| **主应用（Content Factory Web）** | 面向内部运营与客户的一体化 AI 内容生产系统，包含 Dashboard、创作任务、素材资产、数字人等功能。 | 已上线；继续迭代创作流程、n8n 工作流。 |
| **NexAPI 平台** | 面向开发者/代理的 API 站点，含 NexAPI 介绍页、模型广场、API 控制台、充值体系、自研代理路由。| UI 已独立出深色系视觉，控制台/模型页/后端接口全部可用；下一步计划拆仓库实现物理隔离。 |

> **注意**：目前两者仍在同一个 Next.js 仓库中，共享依赖与 CI；为了避免互相影响，建议按“独立仓库 + 子域部署”方案逐步拆分。

---

## 2. 功能清单

### 2.1 主应用（Dashboard）

- **智能创作流程**：诊断 → 挖掘 → 选题 → 内容产出，支持 Yunwu API 自动生成与人工补充。
- **素材资产解析**：历史文案 / 案例 / 风格上传后，通过 pg-boss worker 调用云雾（Yunwu）模型解析，写回 Supabase Storage + Postgres。
- **数字人 & 视频复刻**：与 n8n 工作流联通，可触发外部渲染服务（Kling、Sora、Gemini等）。
- **多租户支持**：`lib/tenants` 中定义各租户配置，SiteHeader/SiteFooter 根据租户自适应。
- **Supabase 登录**：邮箱+魔法链接；控制台前端通过 `supabase-js` 监听 session。
- **工作流集成**：`scripts/maintenance`、`workflows/` 目录存有 n8n 导出，便于回滚。

### 2.2 NexAPI 平台

- **官网着陆页**：全新的黑/深灰主题，沿用 nextide.ai 的 serif + 暖色高亮设计；主内容块包括价值点、模型 Launchpad 官方价对比、理由列表、路由示例。
- **模型广场**：
  - 前端：`/nexapi/models` 通过 `authedFetch` 调用 `/api/nexapi/models`，提供搜索/筛选。
  - 展示：每个模型显示官方价（`baseCostCnyPer1K`）vs NexAPI 售价（`sellPriceCnyPer1K`），自动生成“优惠百分比/与官方持平”徽章。
- **API 控制台**：
  - 功能：API Key 管理、最后四位提示、吊销；积分余额、充值订单、最近用量；Alipay 充值订单创建 & payURL。
  - 路由健康：`/api/nexapi/routes/status` 结合 `NEXAPI_ROUTE_MAIN/BACKUP/EXTRA` 返回延迟与健康度。
  - Apifox 相关 UI 已全部下线（此前 CTA/下载入口已移除）。
- **后端接口**：
  - `app/api/nexapi/*` 覆盖 keys/usage/wallet/recharge/webhooks/models/routes/console summary。
  - Proxy：新增公用 `lib/nexapi/proxyHandler.ts`，已对接 `/api/nexapi/proxy/v1/chat/completions` 与 `/api/nexapi/proxy/v1/responses`；后续可扩展到 images/audio。
  - 支付：`/api/nexapi/recharge/orders` 结合已有 Alipay 公钥/私钥配置，生成待支付订单 & payUrl。
- **脚本/Artifacts**：`scripts/nexapi/build-apifox.ts`、`artifacts/nexapi-apifox.json`、`public/nexapi-apifox/` 仍保留，但目前不会通过 UI 主动曝光，可供运营线下分享。

---

## 3. 对接与依赖

### 3.1 外部服务

| 服务 | 用途 | 对接方式 |
| --- | --- | --- |
| **Supabase** | Auth、Storage、Postgres 托管 | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`，服务端使用 `SERVICE_ROLE_KEY`。 |
| **n8n** | 自动化流程（创作、素材解析、视频理解等） | `.env` 中配置多个 webhook（`script_extract_web`、`product_dna_web` 等）。 |
| **云雾（Yunwu）API** | 大模型生成、资产解析、Sora/Kling 接入 | Workers & 控制台代理统一通过 `NEXAPI_UPSTREAM_KEY` 与 `listRouteConfigs()` 管理线路。 |
| **Alipay** | NexAPI 充值 | 控制台后端使用已提供的应用公钥、支付宝公钥；订单状态通过回调 & `webhooks/alipay` 更新。 |

### 3.2 内部依赖

- **Prisma ORM**：`prisma/schema.prisma` 定义所有表（API Keys、Usage Logs、Transactions、Creative Tasks…）；`prisma/migrations` 保持最新结构。
- **Supabase Storage**：`uploads` bucket 用于素材原文件、解析结果；新资产解析脚本也写入该 bucket。
- **pg-boss**：资产 worker 使用 PG 队列表，队列名称 `assets.history.process` 等。

---

## 4. 数据库与存储

| 组件 | 说明 |
| --- | --- |
| **主数据库** | Supabase Postgres（云端 TLS 强制开启）。`DATABASE_URL` / `DIRECT_URL` 均需使用 `sslmode=require`。 |
| **Prisma 数据模型** | 详见 `prisma/schema.prisma`，核心表：`creative_tasks`、`api_keys`、`usage_logs`、`wallets`、`transactions`、`asset_histories` 等。 |
| **NexAPI 数据** | 与主库共用，包括 API Key 表、充值订单、用量日志；后续拆分时可将相关表迁移至独立 schema。 |
| **文件存储** | Supabase Storage `uploads` bucket；解析出来的 JSON/截图也会同步至 `public/nexapi-apifox/` 目录供静态下载。 |

---

## 5. 环境变量（核心）

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL / ANON_KEY`、`SERVICE_ROLE_KEY` | Supabase 认证 |
| `DATABASE_URL` / `DIRECT_URL` | Prisma 访问数据库 |
| `NEXAPI_UPSTREAM_KEY` | NexAPI Proxy 请求上游（云雾/OpenAI 兼容）的 Bearer Token |
| `NEXAPI_ROUTE_MAIN / BACKUP` | NexAPI 主/备线路（默认 `https://aiapi.atomx.top` 与 `https://aiapi.nextide.top`） |
| `NEXAPI_EXTRA_ROUTES` | 可选：`id|label|https://url|origin` 的逗号列表，自动出现在控制台路由表与 proxy resolver 中 |
| `POINTS_API_BASE`、`N8N_*` webhook | 主应用所需 |
| Alipay 相关 | 应用公钥、支付宝公钥、回调地址等已在 `.env`/docs 中配置 |

> 详细清单请参考《ENV_CONFIG.md》，其中新增一节“**NexAPI Routing & Proxy**”专门记录上述变量与示例值。

---

## 6. 运行与部署

1. **开发环境**
   ```bash
   npm install
   npm run dev
   ```
   - `http://localhost:3000/nexapi`：NexAPI 官网
   - `http://localhost:3000/nexapi/console`：API 控制台（需 Supabase 登录）
   - `http://localhost:3000/nexapi/models`：模型广场

2. **生产部署**
   - 仍在单一 Next.js 项目内，建议使用 PM2/Nginx 或 Vercel。
   - 若决定拆分 NexAPI，推荐：
     - 新建仓库（仅包含 `/nexapi` 相关页面 & `/api/nexapi/*`）。
     - 子域（如 `api.nextide.ai`）单独部署，主域 `nextide.ai` 保留营销与 Dashboard。
     - 通过 API Gateway 或数据库连接维持共用数据。

3. **Workers**
   ```bash
   npm run workers:assets
   ```
   需提供云雾 API Key、队列库连接等。

---

## 7. 后续建议

1. **仓库拆分与模块隔离**  
   - 目标：主应用（Dashboard）与 NexAPI 平台彻底解耦，互不影响依赖/发布节奏。
   - 步骤：新仓库 + 独立 env + 子域部署 →（可选）后端 API 也迁出。

2. **NexAPI Proxy 扩展**  
   - 在 `proxyHandler` 中加入流式/SSE 处理、图像/音频/任务 API 支持，提供更完整的 OpenAI 兼容层。

3. **监控与可视化**  
   - 控制台展示更多实时指标：路由延迟曲线、官方价对比变化、充值统计等。

4. **文档体系**  
   - 当前 docs 中部分老文件（`ARCHITECTURE.md` 等）已删除，建议在新仓库/文档站重建信息架构，并记录“拆分部署方案”。

---

如需更细的表结构/接口参数，可继续参考 `docs/02-development/**`、`docs/04-features/**` 以及 `prisma/schema.prisma`。本文件后续可按发布时间更新（建议放在 `docs/01-overview/` 目录下按日期归档）。***
