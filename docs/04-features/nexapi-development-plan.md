# NexAPI 开发蓝图（NexTide API 体系）

最后更新：2026-03-26
负责人：Codex（协助）

---

## 0. 快速索引
- **品牌与域名**：NexTide / `aiapi.atomx.top`（主）、`aiapi.nextide.top`（备）
- **计费模型**：人民币；1 元 = 100 积分；模型售价 = 云雾成本价 × 5
- **支付渠道**：支付宝（商户已开通，需接入当面付/统一下单）；后续可扩展其他渠道
- **上线模块**：NexAPI 导航 → API 控制台、模型广场；积分充值、秘钥管理、调用日志、多线路代理
- **自动化资产**：定制 Apifox JSON + 图片替换脚本 + 导入指南

---

## 1. 背景 & 目标
1. 自建 NexTide API 门户，摆脱对云雾官方前端的依赖。
2. 沿用现站的登录体系（邮箱）与 UI 风格，保证“账户通用”。
3. 构建完整的积分/充值/秘钥管理链路，支持人民币结算和未来多级代理。
4. 允许在 NexAPI 中一键切换云雾多线路，确保可用性。
5. 提供品牌化的 Apifox 配置，方便客户快速集成。

---

## 2. 信息基线
| 项目 | 说明 |
|------|------|
| 品牌名称 | NexTide |
| 主域名 | `aiapi.atomx.top` |
| 备域名 | `aiapi.nextide.top` |
| 线路代理 | 需反向至：`https://yunwu.ai`、`https://yunwu.zeabur.app`、`https://api.apiplus.org`、`https://api.wlai.vip`、`https://api3.wlai.vip` |
| 登录方式 | 邮箱（与官网一致） |
| 计费单位 | 人民币，1 元 = 100 积分 |
| 定价策略 | `售价 = 云雾成本 × 5`，需可调 |
| 支付 | 支付宝（应用公钥、支付宝公钥已提供） |
| 多级代理 | 若上游已放开则开放，需支持父级配额与子级 key |
| Apifox | 交付“JSON + 替换脚本 + 操作手册” |

支付宝密钥：
- **应用公钥**：`MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqeF7pKMKkmaBk5yTAz7IBN/DCpHT2DA+tBFq/cmNJO2OCKzp/90P0iemu0GQwwt4S8lgoXCU3bcQREpzMSrJynA2WIfy4trLXKAO9MCNEk5sxy0h+/qlmUrRmK+/Ji1ltiyv8J4KSiVMKsymKH2Y9bPT24FOdZdZOdxml0ZscbzwJOth5B/D3LyScPFn17zdCjGTT9+8ZcFEhk75TLuv1k/6z0Cs8BtGAuTo/lmFbrrfEn2dq2XXVeQKlkHJrxC3PCeD1PmRjU0O4sLEx5recHPpJ74wz9bkNrT8nTKXPdwfq+mTOnpka46evqc8tMZ7SuOxR59wYnAnKS9/sr0EKwIDAQAB`
- **支付宝公钥**：`MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgkTJ6oFod1V0Qhmgr1WctZNqs6F00FcwjlOBXYGxZLbiaPBPMb02LDa1tq04apAm0cE2Sijmm5oAA4Quwodt2hINu1R0650S3Zz5YzVmN7yy98XO8m/9p9zwOeawrWE+UUluvaVQCEeWEngi5pNfVw1M2/TP7kvlV6k81rL6qeGALSho+ydQA8aVNREejwtFXg66vHwpJZbiYnn+A7LJOQPeuIlQOZMxy7Fn2nNZK1A4W2SH5N6KuwkpvVS/SkKTUaLkfRv9l1ZuAn1iWnYbsDxSFlOHWEU5ocP5Ly/OVub1cSMXTEkzwAxXD7i0FBzvLDpzCkfsLS0wCWi9XV8uhwIDAQAB`

---

## 3. 功能概览
### 3.1 NexAPI 导航
- 官网页面导航新增 “NexAPI” 类目，进入后包含：
  1. **API 控制台**：积分余额、秘钥管理、调用记录、充值入口、多线路状态。
  2. **模型广场**：展示所有可用模型、简介、价格（人民币/积分）、API endpoint、是否支持函数/流式、线路兼容情况。

### 3.2 控制台功能
- 余额/积分展示，实时刷新。
- API Key 列表（创建/吊销，可设多 key）。
- 使用记录（按模型、时间、tokens、积分）。
- 积分充值：支付宝当面付/PC 网关，生成支付链接和轮询订单状态。
- 多线路切换：展示各线路延迟/状态，一键复制 Base URL。
- 多级代理（可选）：父级管理子 key、设置折扣、查看子用户用量。

### 3.3 模型广场
- 数据源来自数据库 `model_prices` 表（包含 `model_id`, `display_name`, `capabilities`, `base_cost`, `sell_price`, `available_routes`, `doc_links`).
- 支持搜索、按类型过滤（聊天、音频、图像、视频、工具）。
- 点击模型打开详情：参数示例、调用代码片段、Apifox 节点链接。

### 3.4 Apifox 定制
- Node/TS 脚本读取 `docs/云雾API 接口对接3.17 .apifox.json`，替换：
  - 名称 → “NexAPI” / “NexTide API”。
  - 所有 Base URL → `https://aiapi.atomx.top`、`https://aiapi.atomx.top/v1`（可扩展多线路）。
  - 所有云雾图片 → 上传到自有 OSS/CDN（路径 TBD），并替换链接。
- 生成 `artifacts/nexapi-apifox.json` 和操作指南 Markdown。

---

## 4. 架构设计（草案）
```
[Client/UI]
 ├─ NexAPI 导航（app/(site)）
 ├─ API 控制台（app/(main)/nexapi/console）
 └─ 模型广场（app/(main)/nexapi/models)

[Server / Next.js Route Handlers]
 ├─ /api/nexapi/proxy/*   # 云雾转发层 (REST + SSE)
 ├─ /api/nexapi/keys      # 用户 API key CRUD
 ├─ /api/nexapi/usage     # Token & 积分日志
 ├─ /api/nexapi/recharge  # 创建充值订单（支付宝）
 └─ /api/nexapi/webhooks  # 支付宝回调、余额同步

[Services]
 ├─ AuthService (邮箱登录、账户通用)
 ├─ WalletService (积分=人民币×100)
 ├─ PricingService (成本价 → 售价)
 ├─ RouteService (线路健康状态/切换)
 ├─ AgentService (多级代理、折扣)
 ├─ ApifoxBuilder (JSON 替换、图床迁移)
 └─ PaymentService (支付宝 SDK、签名校验)

[Data]
 ├─ users / profiles（沿用现有）
 ├─ api_keys (id, user_id, key, status, quota)
 ├─ wallets (user_id, balance, currency)
 ├─ transactions (id, user_id, type, amount, channel, meta)
 ├─ usage_logs (id, user_id, model_id, tokens_in/out, credits)
 ├─ model_prices (model_id, cost_cny, price_cny, capabilities, routes)
 ├─ recharge_orders (id, user_id, amount_cny, status, alipay_trade_no)
 └─ agent_relations / agent_wallets（可选）
```

---

## 5. 迭代步骤（必须顺序执行）
| 阶段 | 目标 | 主要输出 |
|------|------|----------|
| 1. 现状审计 | 盘点现有 Auth/积分/支付/站点导航，列风险 | 《系统现状评估》
| 2. 架构定稿 | 确认数据表、API 契约、UI 架构 | 《技术方案 v1》、ER 图、界面线框
| 3. 后端实现 | Auth 扩展、钱包、代理、支付、Apifox 脚本 | 可运行 API + 脚本
| 4. 前端实现 | NexAPI 导航、控制台、模型广场、充值 UI | 可交互页面
| 5. 测试与交付 | QA、部署、Apifox 操作手册 | 测试报告、部署指南、分享链接

> 当前进度：阶段 1 未开始

---

## 6. UI 约束
- 延续现有官网的排版、色板、字体、动效；围绕 NexTide 品牌元素（Logo、渐变）扩展。
- NexAPI 导航项位于顶栏主导航，与其他产品同层级。
- 模型广场卡片需要包含：模型名、标签（聊天/音频等）、积分价、线路可达性（图标）、“复制 Endpoint”按钮。
- 控制台页采用左右布局：左侧卡片导航，右侧内容。需包含：
  - 余额积分卡（含充值 CTA）
  - API Key 列表（表格 + 创建对话框）
  - 调用记录（时间轴/表格，可过滤模型）
  - 线路面板（状态灯 + Base URL）
  - 充值记录（订单状态 + 支付宝链接）

---

## 7. Apifox 脚本设计
- `scripts/nexapi/build-apifox.ts`
  - 输入：`docs/云雾API 接口对接3.17 .apifox.json`
  - 步骤：
    1. 解析 JSON，深度遍历字符串字段。
    2. 替换品牌名称、Base URL（含 Markdown 描述、代码片段）。
    3. 匹配 `https://api.apifox.com/api/v1/` 图片 URL，下载到 `public/nexapi-apifox/` 并返回自有 CDN 地址（部署后可替换为 OSS）。
    4. 输出 `artifacts/nexapi-apifox.json`。
  - 额外输出：`docs/04-features/nexapi-apifox-guide.md`（导入、环境配置、分享流程）。

---

## 8. 依赖 & 风险
- 需要确认现有数据库（Supabase/Postgres）是否可自定义新表；若迁移困难需拆分服务。
- 支付宝 SDK 需 Node 服务端，可复用 `alipay-sdk` npm 包；阿里云服务器需配置 HTTPS + 外网可回调。
- 多线路代理涉及证书与超时配置，需在 Nginx/Node 层开启 HTTP/2 + SSE 透传。
- 图片替换涉及大量下载，需注意 Apifox 资源访问权限与备份。

---

## 9. 下一步执行
1. **阶段 1 - 现状审计**
   - [ ] 浏览 `app/(site)`、`components/Navbar`，确认导航改造点。
   - [ ] Review `app/api/integration/credits` 与相关服务，记录与新积分体系的差异。
   - [ ] 核查数据库 schema/Prisma 定义，确认可扩展字段。
   - [ ] 输出评估文档，列出阻塞项。
2. 阶段 2 起将在阶段 1 完成后启动。

---

（文档后续迭代时更新“当前进度”与 Checklist）
