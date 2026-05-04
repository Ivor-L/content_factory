# 小程序分享赚钱与算力消耗接口补齐计划

## 目标

- 让小程序「算力消耗」页面可以通过 `X-User-Api-Key` 读取 `/api/integration/usage`。
- 让小程序「分享赚钱」页面的邀请链接能稳定携带并绑定 `ref` 邀请码。
- 保持 Web 端现有 Supabase Bearer token 鉴权与分享绑定流程不变。

## 范围

- 后端积分代理：
  - `/api/integration/credits`
  - `/api/integration/usage`
- 分享邀请链路：
  - URL `ref`/`referral`/`invite` 参数捕获
  - `/api/referrals` 现有绑定接口复用
- 小程序分享页链接生成。

## 方案对比

### 方案 A：补齐现有代理接口

- 在积分代理中复用 `getRequestUserContext`，同时支持 Bearer token 与 `X-User-Api-Key`。
- 在全局 provider 捕获 URL 邀请参数，写入现有 `atomx:pending-referral-code` localStorage。
- 优点：改动小，不新增 schema，不改变现有页面调用。
- 风险：依赖外部积分系统 `/usage/events` 与 `/balance` 稳定性。

### 方案 B：新增小程序专用聚合接口

- 新增 `/api/miniapp/me`，聚合 profile、余额、消耗、邀请统计。
- 优点：小程序端请求更少，字段契约更集中。
- 风险：涉及更多模块与回归面，当前问题不能最快闭环。

## 结论

采用方案 A。当前缺口是已有页面与已有接口之间的鉴权/跳转接线问题，不需要新表或聚合层即可修复。

## 兼容性

- Next.js：仅修改 App Router route handlers 与 client provider，兼容当前结构。
- Prisma/Supabase：不改 schema，不新增迁移。
- 外部积分系统：继续使用 `POINTS_API_BASE` + `https://api.atomx.top` fallback。
- 小程序：保留 `X-User-Api-Key` 请求方式。

## 风险与回滚

- 风险：外部积分接口返回结构差异导致解析为空。
  - 缓解：继续使用现有宽松解析函数。
- 风险：邀请链接从 `/share` 改为 `/register` 后租户 basePath 不一致。
  - 缓解：沿用 Web 端 `buildReferralLink` 的路径约定。
- 回滚：还原本次 API 鉴权辅助函数、URL 捕获组件和小程序链接改动即可。

## 验收标准

- `GET /api/integration/credits` 支持 Bearer token 与 `X-User-Api-Key`。
- `GET /api/integration/usage` 支持 Bearer token 与 `X-User-Api-Key`。
- 打开 `/?ref=<userId>`、`/register?ref=<userId>` 或 `/login?ref=<userId>` 后，登录完成可由现有 watcher 调用 `/api/referrals` 绑定。
- 小程序分享页复制出的链接使用 `/register?ref=<shareCode>`。
- `npm run lint`、`npm run typecheck` 通过。

## Tech Debt

- 后续可把积分余额、消耗记录、邀请统计抽成 `lib/credits-proxy.ts`，减少 `/api/referrals` 与 `/api/integration/usage` 中的解析重复。
- 后续可新增 `/api/miniapp/me` 聚合接口，降低小程序 profile 页多请求开销。
