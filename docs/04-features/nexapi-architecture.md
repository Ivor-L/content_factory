# NexAPI 技术方案 v1（阶段 2）

更新：2026-03-26
负责人：Codex（协助）

---

## 1. 数据模型（Prisma + Postgres）
> 新表默认位于 `public` schema；若后续需要 RLS，可复用 Supabase 机制。

### 1.1 `api_keys`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | `String @id @default(cuid())` | 主键 |
| userId | `String @db.Uuid` | Supabase `users.id` 外键 |
| label | `String?` | 用户自定义标签 |
| keyHash | `String` | `sha256` 后的 key（存储安全）|
| lastFour | `String` | 明文后四位，便于展示 |
| status | `String` | `active / revoked / expired` |
| scopes | `String[]` | 预留多权限 |
| quotaCredits | `Int?` | key 级别限额（积分）|
| createdAt / updatedAt | `DateTime` | 审计 |
| agentId | `String?` | 指向 `agent_relations`，用于多级代理 |

> 生成策略：服务端创建随机 48 字符 key，返回给用户并立即只显示一次。旧的 `profiles.api_key` 会在迁移脚本中复制为该表第一条记录。

### 1.2 `wallets`
| 字段 | 类型 | 说明 |
|------|------|------|
| userId | `String @id @db.Uuid` | 与用户一对一 |
| balanceCredits | `BigInt` | 当前积分余额（整数）|
| currency | `String @default("CNY")` | 币种 |
| updatedAt | `DateTime` | 更新时间 |

### 1.3 `transactions`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | `String @id @default(cuid())` | |
| userId | `String @db.Uuid` | |
| type | `String` | `recharge / deduct / refund / promo` |
| amountCredits | `BigInt` | 正数或负数 |
| amountCny | `Decimal(12,2)?` | 对应人民币金额 |
| channel | `String?` | `alipay`, `manual`, `usage` |
| refId | `String?` | 关联 recharge order id、usage id |
| meta | `Json?` | 额外数据（模型、taskId 等）|
| createdAt | `DateTime` | |

### 1.4 `usage_logs`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | `String @id @default(cuid())` | |
| userId | `String @db.Uuid` | |
| apiKeyId | `String?` | |
| modelId | `String` | `gpt-4o`, `qwen-plus` 等 |
| route | `String` | `yunwu.ai`, `api3.wlai.vip` |
| promptTokens / completionTokens | `Int` | |
| priceCny | `Decimal(12,4)` | 成本 |
| chargedCredits | `BigInt` | 用户扣除积分 |
| responseMs | `Int?` | 性能数据 |
| createdAt | `DateTime` | |

### 1.5 `model_prices`
| 字段 | 类型 | 说明 |
|------|------|------|
| modelId | `String @id` | |
| displayName | `String` | |
| provider | `String` | `OpenAI`, `Anthropic`, `Suno`... |
| type | `String` | `chat / audio / image / video / tool` |
| baseCostCnyPer1K | `Decimal(12,4)` | 云雾成本（人民币）|
| sellPriceCnyPer1K | `Decimal(12,4)` | 售价 = 成本×5，可手动覆盖 |
| minIncrement | `Int` | token/秒计量粒度 |
| routes | `String[]` | 可用线路 |
| capabilities | `String[]` | `vision`, `function_call`, `realtime` |
| description | `String?` | 简介 |
| docsLink | `String?` | 文档链接 |
| status | `String` | `active / coming_soon` |
| updatedAt | `DateTime` | |

### 1.6 `recharge_orders`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | `String @id @default(cuid())` | |
| userId | `String @db.Uuid` | |
| amountCny | `Decimal(12,2)` | 充值人民币金额 |
| credits | `BigInt` | = 金额 × 100 |
| status | `String` | `pending / paid / failed / expired` |
| alipayTradeNo | `String?` | 支付宝交易号 |
| payUrl | `String?` | 二维码/收银台链接 |
| meta | `Json?` | 设备/IP 等 |
| createdAt / updatedAt | `DateTime` | |

### 1.7 `agent_relations`（可选）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | `String @id @default(cuid())` | |
| parentUserId | `String @db.Uuid` | |
| childUserId | `String @db.Uuid` | |
| commissionRate | `Decimal(5,4)` | 折扣/返点 |
| status | `String` | |

---

## 2. 后端接口设计（Next.js Route Handlers）

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/nexapi/keys` | GET/POST/DELETE | 列出/创建/吊销 API key。服务端生成 key，入库 hash。|
| `/api/nexapi/console/summary` | GET | 返回余额、最近调用、线路状态卡片数据。|
| `/api/nexapi/usage` | GET | 分页查询 `usage_logs`（过滤模型、时间）。|
| `/api/nexapi/recharge/orders` | POST | 创建充值订单（金额、积分）；内部调用支付宝 SDK 生成支付链接。|
| `/api/nexapi/recharge/orders` | GET | 当前/历史订单。|
| `/api/nexapi/webhooks/alipay` | POST | 支付宝异步通知，校验签名，更新订单 & 钱包。|
| `/api/nexapi/proxy/*` | POST | 代理 Yunwu API（chat, audio, images等），追加用户上下文 + 计费。|
| `/api/nexapi/routes/status` | GET | 轮询各线路延迟/可用性（调用 `HEAD` 或轻量 ping）。|

### 2.1 代理流程
1. 前端/第三方 → `POST /api/nexapi/proxy/v1/chat/completions`
2. 鉴权：检查 Bearer `<nexapi-key>`，解析 `api_keys` 表，确认用户 & 配额。
3. 读取模型信息，匹配成本价 & 售价。
4. 将请求转发至云雾真实地址（基于用户选择的 Base URL 或系统自动选择）。
5. 流式响应：使用 `fetch` + `ReadableStream` 直接透传。
6. 结束后记录 `usage_logs`，扣减积分（钱包事务 + `transactions`）。
7. 返回 `x-nexapi-credits-remaining` 头部（可选）。

### 2.2 计费公式
- 成本（CNY）：`cloud_cost_per_1k * (prompt_tokens + completion_tokens)/1000`
- 售价（CNY）：`cost * 5`（可按模型表 `sellPriceCnyPer1K` 覆盖）
- 积分：`售价 * 100`（因为 1 元 = 100 积分）
- 事务保障：使用数据库事务（或 Supabase RPC）同时写入 `usage_logs`、`wallets`、`transactions`，防止扣费与日志不同步。

### 2.3 支付宝集成
- 使用 `alipay-sdk` Node 包：
  - `PaymentService.createOrder(userId, amountCny)` → `recharge_orders` 写入 pending，调用 SDK 生成 `payUrl`（电脑网站支付 / 当面付）。
  - 回调 `/api/nexapi/webhooks/alipay`：
    1. 读取通知参数，使用支付宝公钥验签。
    2. 若 `trade_status` ∈ `TRADE_SUCCESS/TRADE_FINISHED`，将订单标记为 `paid`，增加 `wallets.balanceCredits += credits`，写入 `transactions`。
    3. 返回 `success` 字符串。
  - 同步通知（前端轮询 GET）用于刷新 UI。
- 配置：`.env` 增加 `ALIPAY_APP_ID`, `ALIPAY_APP_PRIVATE_KEY`, `ALIPAY_APP_PUBLIC_KEY`, `ALIPAY_ENDPOINT` 等。

---

## 3. 前端路由/页面

| 路径 | 说明 |
|------|------|
| `app/(site)/nexapi/page.tsx` | 官网 NexAPI 介绍页，含“模型广场”预览、进入控制台 CTA。|
| `app/(main)/nexapi/layout.tsx` | 控制台父布局，左侧卡片导航。|
| `app/(main)/nexapi/page.tsx` | 控制台首页（余额、线路、最近调用）。|
| `app/(main)/nexapi/keys/page.tsx` | API key 管理。|
| `app/(main)/nexapi/usage/page.tsx` | 调用日志。|
| `app/(main)/nexapi/recharge/page.tsx` | 充值中心。|
| `app/(main)/nexapi/models/page.tsx` | 模型广场（可与官网共享组件）。|

### 3.1 UI 组件
- `NexApiSidebar`：位于控制台左侧，列出“概览 / API Key / 模型 / 调用记录 / 充值 / 线路状态”。
- `BalanceCard`：展示积分余额 + 充值按钮。
- `RouteStatusCard`：显示每条线路的 RTT、可用性、复制按钮。
- `ModelCard`：在模型广场中使用，包含积分价格、能力标签、复制 Endpoint。
- `RechargeDialog`：输入金额 → 创建订单 → 展示支付宝二维码/链接 → 轮询支付状态。

### 3.2 国际化
- `siteContent.nav` 新增 `nexapi` 文案；`Sidebar` 及控制台页面同样更新中英文文案。

---

## 4. Apifox 脚本工作流
1. 目录：`scripts/nexapi/build-apifox.ts`
2. 步骤：
   - 读取源 JSON（云雾版本）。
   - 替换 `"云雾API"` → `"NexAPI"`、`yunwu.ai` 等 URL → `aiapi.atomx.top`（保留多线路列表，替换为 `https://aiapi.atomx.top`, `https://aiapi.nextide.top`, `https://aiapi.atomx.top/v1/chat/completions` 等）。
   - 下载 `https://api.apifox.com/api/v1/...` 图像到 `public/nexapi-apifox/<hash>.png`。
   - 更新 JSON 中的图片链接指向 `/nexapi-apifox/<hash>.png`（部署后对应 CDN）。
   - 输出文件：`artifacts/nexapi-apifox.json`。
3. 生成导入指南：`docs/04-features/nexapi-apifox-guide.md`，内容包含：
   - 如何导入 JSON
   - 如何配置环境变量（Base URL、API Key）
   - 如何分享配置给客户

---

## 5. 任务拆分 & 先后顺序
1. **数据库与迁移**
   - 更新 `prisma/schema.prisma`，生成迁移。
   - 补充数据种子脚本（初始化模型价格、用户钱包）。
2. **服务层**
   - `walletService`, `pricingService`, `routeService`, `paymentService`, `apifoxBuilder`。
3. **API Route Handlers**
   - 先实现 `/api/nexapi/keys`, `/api/nexapi/console/summary`, `/api/nexapi/routes/status` 作为 MVP。
   - 再实现代理 `/api/nexapi/proxy/*` 与支付宝相关 endpoints。
4. **前端**
   - 更新 `SiteHeader` & `siteContent` 添加 NexAPI 导航。
   - 实现官网 NexAPI 介绍页。
   - 构建控制台页面及组件。
5. **脚本与文档**
   - Apifox 构建脚本 + 导入指南。
   - 使用说明、充值流程文档。
6. **测试计划**
   - 单元：计费函数、钱包扣费、支付宝验签 mock。
   - 集成：代理请求（含 SSE）、充值 → 钱包到账。
   - E2E：Playwright 脚本覆盖 NexAPI 控制台关键流程。

---

## 6. 未决事项
- 云雾接口的实时线路监控数据来源：暂定本地 `fetch` Ping，后续可调用自建监控服务。
- 多级代理的 UI/计费策略将在阶段 3 后半或阶段 4 单独实现，当前数据库仅预留结构。
- 旧 `ApiKeyModal` 如何处理：阶段 3 中将其替换为“跳转 NexAPI 控制台”的提示。

---

> 阶段 2 完成，允许进入阶段 3（实现）。
