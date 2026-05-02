# 20260501 多身份登录体系改造计划（邮箱 + 微信 + 手机）

## 目标
- 在保持现有邮箱登录可用的前提下，引入微信登录与手机号登录。
- 将“登录方式”与“用户主账号”解耦，避免同一用户产生多账号。
- 优先增量改造，确保可灰度发布与快速回滚。

## 范围
- 数据库：新增身份绑定与手机号验证码挑战表。
- API：新增手机号验证码发送/校验接口；改造微信绑定流程为登录态绑定。
- 兼容：保留现有 `profiles.wechat_openid` 与 `api_key` 流程，先双轨兼容。

## 现状结论
- 当前已有邮箱 OTP 验证接口：`/api/auth/verify-otp`。
- 当前已有微信登录与绑定接口，但绑定依赖 `apiKey`，存在泄露与误绑风险。
- `profiles` 表已有 `wechat_openid` 字段，可作为迁移过渡。

## 方案对比
### 方案 A：继续将微信/手机字段直接塞入 `profiles`
- 优点：开发快。
- 缺点：扩展差，未来支持更多登录方式会持续膨胀；约束难管理。

### 方案 B（采用）：新增 `user_auth_identities` 统一管理登录身份
- 优点：结构清晰，可扩展（未来 Apple/Google/企业微信等）。
- 缺点：首期需要迁移与兼容层。

## 设计
### 数据层
- `public.user_auth_identities`
  - `user_id`、`provider`、`provider_uid`、`verified_at`、`meta`
  - 唯一约束：`(provider, provider_uid)`
- `public.phone_otp_challenges`
  - 记录手机号验证码挑战与消费状态、过期时间、尝试次数

### API 层
- 新增：`POST /api/auth/phone/send-code`
- 新增：`POST /api/auth/phone/verify`
- 改造：`POST /api/auth/wechat/bind`
  - 从“`openid + apiKey`”改为“`openid + 登录态`”

### 兼容策略
- 保留旧 `profiles.wechat_openid` 查询路径。
- 绑定成功时双写：`user_auth_identities` + `profiles.wechat_openid`。

## 分阶段里程碑
1. Phase 1（本次）
- 新增 Prisma 模型与迁移 SQL。
- 新增手机号接口骨架。
- 改造微信绑定为登录态绑定（兼容旧字段）。

2. Phase 2
- 小程序与 Web 前端切换到新接口。
- 微信登录优先查 `user_auth_identities`，未命中再查 `profiles.wechat_openid`。

3. Phase 3
- 回填历史微信绑定数据。
- 完全移除 `apiKey` 绑定微信路径。

## 风险
- 短信网关未接入时只能走开发验证码模式。
- 绑定流程改造后，旧端若未升级会出现绑定失败。

## 回滚
- 回滚 API 改造：恢复 `apiKey` 绑定分支。
- 回滚数据层：保留新增表，不影响旧逻辑；必要时只停用新接口。

## 验收标准
- 无登录态调用微信绑定接口返回 401。
- 有登录态可成功绑定微信并写入身份表。
- 手机号验证码接口可完成最小闭环（发送->校验->写入身份绑定）。
- 现有邮箱登录与已上线业务 API 不受影响。

## Tech Debt
- 需要补短信服务适配层（供应商抽象 + 限流中间件 + 风控）。
- 需要统一 Web/小程序会话写入与刷新策略。
