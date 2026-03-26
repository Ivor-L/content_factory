# NexAPI 现状审计（阶段 1）

更新：2026-03-26

## 1. UI / 站点结构
- 官网入口位于 `app/(site)`，`SiteHeader.tsx` 当前导航项均为锚点 + `OpenClaw` 外链；无产品级别的“API”入口。
- `siteContent.nav` 定义了文案，需在英文/中文中同步新增 `nexapi` 词条。
- 落地页样式在 `NexTideLanding.module.css`，颜色/字体已与品牌对齐，可直接复用。
- 仪表盘（`app/(main)`）依赖 `Sidebar.tsx` 作为全局导航，暂未出现 API 相关页面，后续需新增 `nexapi` 路由分组。
- 现有 `ApiKeyModal` 会在用户首次登录后提示绑定“外部积分系统 api_key”，这与即将上线的“自有 key 管理”冲突，需要改造为 NexAPI 控制台内管理。

## 2. 鉴权与数据
- 项目使用 Supabase Auth（邮箱登录），`profiles` 表中仅存储 `api_key` 字段，且加了唯一索引，无法满足多 key、多级代理需求。
- Prisma schema（`prisma/schema.prisma`）未定义与钱包/交易相关的模型，需要新增 `wallets`、`transactions`、`api_keys` 等表并执行迁移。
- 现有多租户逻辑通过 `TenantLayout`/`useTenant` 实现，可在其上挂载 NexAPI 页面，确保“账户通用”。

## 3. 积分 / Credits 代理
- `app/api/integration/credits` + `lib/points-server.ts` 实现了一个“云雾外部积分系统”代理，默认 Base URL `https://api.atomx.top`。
- 代理流程：从 Supabase `profiles.api_key` 读取外部 key → 调用 `/api/balance/check` 或 `/usage/events` → 前端展示。
- 该模式与目标“本地积分账本 + 云雾调用”不符，后续计划：
  1. 将 `POINTS_API_BASES` 扩展为 NexTide 自身的网关（NexAPI 代理），不再直接暴露云雾 API。
  2. `profiles.api_key` 将被新的 `api_keys`（多条记录）取代，`ApiKeyModal` 改为指引到 NexAPI 控制台。
  3. 新增 `walletService` 维护人民币 ↔ 积分；当前代理逻辑将逐步废弃或保留兼容层。

## 4. 支付 / 充值
- 仓库内暂无支付宝或其他支付实现，亦无充值订单表，确认需从零开发：
  - 引入 `alipay-sdk`；
  - 设计 `recharge_orders` 表（金额、汇率、积分、状态、Alipay trade no）；
  - 新增 `/api/nexapi/recharge` 创建订单、二维码链接；
  - `/api/nexapi/webhooks/alipay` 处理回调。

## 5. 云雾 API / Apifox
- `docs/云雾API 接口对接3.17 .apifox.json` 已存在，包含所有接口 & Markdown；目前仍是云雾品牌。
- 项目中尚无脚本处理该 JSON；需要新增 `scripts/nexapi/build-apifox.ts`，并引入资源缓存目录（建议 `public/nexapi-apifox/` + `artifacts/`）。

## 6. 风险与阻塞
1. **数据库迁移**：当前 Prisma schema 主要聚焦 Supabase 系统表（与 Supabase 管理的 `auth` schema`共享）；新增表需确认部署数据库是否允许自建 schema & RLS 配置。
2. **多 key 支持**：`profiles.api_key` 唯一约束需要保留（历史功能依赖），需计划迁移策略（如复制数据到新表 + `profiles.api_key` 仅作 legacy）。
3. **支付回调域名**：阿里云服务器需 HTTPS、公网可访问，且 `aiapi.atomx.top` 要能被支付宝回调，DNS 与证书准备是上线前置条件。
4. **流式代理**：当前 `/api/integration/credits` 只有普通 HTTP 请求，尚未实现 SSE；NexAPI 网关要稳定透传 `fetch` 流式响应，需要评估 Next.js Route Handler（Edge vs Node）能力或自建 Node 服务。
5. **多租户**：`TenantLayout` 逻辑意味着不同 tenant 的文案/资源不同，NexAPI 应该只对 NexTide 可见，需要布尔开关或 slug 判断。

## 7. 建议的即时行动
- 在 `docs/04-features/nexapi-development-plan.md` 基础上，立项 Stage 2 设计，重点解决：
  1. 新/旧积分系统并存策略；
  2. 新表结构 & Prisma 迁移方案；
  3. 支付宝集成流程；
  4. NexAPI 页面路由结构。
- 代码层面先标记 TODO：
  - `ApiKeyModal` 增加“将迁移至 NexAPI 控制台”的提示或暂时隐藏，防止用户继续绑定旧 key。
  - `SiteHeader` 顶部导航预留 `NexAPI` 占位（待 UI 完稿后启用）。

---
（阶段 1 完成，后续阶段将在此基础上迭代）
