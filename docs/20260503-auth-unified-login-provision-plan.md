# 20260503 统一登录与积分开户链路改造计划

## 目标
- 统一 Web 与小程序在微信/手机号/邮箱三类登录后的“账号补全”流程。
- 对所有登录方式实现一致行为：
  1) 若用户不存在则创建 Supabase 账号
  2) 确保 `profiles` 存在并可读写
  3) 确保 `user_auth_identities` 完整绑定（email/phone/wechat）
  4) 登录完成前调用积分系统创建账号并获取真实 `api_key` 绑定到 `profiles.api_key`
- 严禁生成随机/本地伪造 `api_key` 作为生产兜底，避免“能登录但无法扣费”。

## 范围
- 后端认证路由：
  - `app/api/auth/wechat/login/route.ts`
  - `app/api/auth/wechat/phone-login/route.ts`
  - `app/api/auth/phone/verify/route.ts`
  - `app/api/auth/verify-otp/route.ts`
  - `app/api/auth/email/password-login/route.ts`
  - `app/api/auth/provision-credits/route.ts`
  - `app/api/user/profile/route.ts`
- 新增统一服务层：
  - `lib/auth/finalizeLogin.ts`
- 小程序登录调用：
  - `digital_human_miniapp/taro/src/utils/api.ts`
  - `digital_human_miniapp/taro/src/subpages/login-email/index.tsx`
  - `digital_human_miniapp/taro/src/subpages/login-password/index.tsx`

## 现状问题
- 登录后开户逻辑分散在多处，触发时机不一致（Web 有、小程序部分缺失）。
- `CREDITS_INTERNAL_SECRET` 缺失时，部分链路会返回失败，部分链路会回退到随机 `mini_*` key，导致后续积分扣费必然失败。
- 微信登录“未绑定”与“自动注册”语义混杂，前后端期望不一致。

## 方案对比
### 方案 A：保留各 route 自行实现开户与绑定（现状）
- 优点：改动面小。
- 缺点：重复逻辑高，行为不一致，容易再次出现某条登录链路遗漏开户。

### 方案 B（采用）：抽象统一登录完成器（Finalize Login）
- 优点：所有登录方式共享同一标准流程；错误语义统一；便于观测与审计。
- 缺点：短期改动文件较多，需要一次性回归。

## 目标设计
- 新增 `finalizeLogin` 服务，输入为 `userId` 与可选身份信息（email/phone/openid）。
- 服务内部顺序：
  1) `ensureProfile(userId)`
  2) `upsertIdentity(userId, provider, providerUid)`
  3) `ensureCreditsApiKey(userId)`：仅接受真实积分系统返回 key
  4) 返回统一登录 payload（`userId/apiKey/username/avatarUrl`）
- 当积分开户失败时：返回明确错误码（如 `CREDITS_PROVISION_FAILED`），由前端提示并阻止进入主流程。

## 兼容性
- Next.js：纯服务层抽象，不改变现有路由入口与响应结构主干。
- Prisma/Supabase：复用既有表结构 `profiles` / `user_auth_identities`。
- 小程序：继续使用当前 API，不增加微信端额外权限范围。
- 积分系统：继续调用既有 `/internal/provision`，不变更外部契约。

## 风险
- 若生产环境未配置 `CREDITS_INTERNAL_SECRET`，登录会被明确阻断（这是期望行为，会暴露配置问题）。
- 若历史账号缺失 identity 映射，首次登录会触发补绑定，需注意唯一约束冲突处理。

## 回滚策略
- 保留 route 层原入口不变，若出现严重问题可快速回滚到改造前提交。
- 回滚不涉及 schema 变更，无需数据库回退。

## 分阶段里程碑
1. 抽象 `finalizeLogin` 与 `ensureCreditsApiKey`，接入微信/手机号/邮箱 route。
2. 小程序在邮箱验证码、邮箱密码登录后显式触发开户接口并处理错误。
3. 清理随机 `api_key` 兜底逻辑，统一错误码。
4. 执行 lint/typecheck/build（如适用）与最小登录回归。

## 验收标准
- 微信登录：未绑定账号可自动创建并登录，且 `profiles.api_key` 为真实积分系统 key。
- 手机号登录：新老用户均可登录，且具备真实 `api_key`。
- 邮箱登录（OTP/密码）：登录后可直接查询积分与执行扣费。
- 任何登录路径若积分开户失败，前端得到清晰错误而非伪成功。

## Tech Debt
- `provision-credits` 仍依赖同步外部调用，后续可考虑异步重试与死信队列。
- 登录链路缺乏统一审计日志，建议后续补充 auth event 表。
