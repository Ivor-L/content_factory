# 积分（Credits）系统文档

本项目的“积分/余额”来自外部积分系统。为了避免把外部 `api_key` 暴露给前端，同时统一鉴权与错误处理，项目在 Next.js 内部实现了一个代理层（`/api/integration/credits`），并在 UI（设置页 + 侧边栏）展示余额。

---

## 1. 核心概念

### 1.1 名称与展示

- 名称：积分 / Credits（UI 仅展示数值，不展示“Credits”文字）
- 单位：整数
- 格式：千分位（`toLocaleString()`）
- 徽章样式：深色底（`#1F1F1F`）+ 白字 + 黄色闪电（`#FFC107`）

### 1.2 关键数据

- **外部 `api_key`**：每个用户在外部积分系统的身份标识。
- **Supabase `profiles.api_key`**：用于把外部 `api_key` 绑定到当前登录用户。

---

## 2. 架构与数据流

### 2.1 余额查询（UI -> 代理 -> 外部系统）

1. 前端（设置页/侧边栏）调用：`GET /api/integration/credits`
2. 代理层验证 Supabase 登录态：从请求头 `Authorization: Bearer <access_token>` 获取当前用户
3. 代理层读取 `profiles.api_key`
4. 代理层请求外部积分系统获取余额
5. 前端拿到 `balance` 后渲染 UI

### 2.2 扣费（UI -> 代理 -> 外部系统）

1. 前端调用：`POST /api/integration/credits`
2. 代理层同样从登录态获取用户，并注入对应的外部 `api_key`
3. 外部系统扣费后返回
4. 前端触发“全局积分刷新事件”，侧边栏自动更新

---

## 3. 内部代理接口（Next.js）

实现文件：`app/api/integration/credits/route.ts`

### 3.1 Base URL 选择与兼容

- 外部积分系统 Base URL 通过环境变量 `POINTS_API_BASE` 配置。
- 默认会回退到 `https://api.atomx.top`。
- 若请求返回 HTML（通常是 404 页面），会认为该 base 不正确并自动尝试下一个。

### 3.2 `GET /api/integration/credits`（查询余额）

- 鉴权：必须携带 `Authorization: Bearer <supabase_access_token>`
- 用户 `api_key` 获取优先级：
  1) 从 Supabase `profiles.api_key` 读取
  2) 兜底：从请求头 `X-User-Api-Key` 读取（主要用于设置页刚保存但 profiles 读取受限/延迟时）

- 外部请求策略（按顺序尝试）：
  1) `GET /api/balance/check?api_key=<key>&amount=0`
  2) 若不 OK 再尝试 `GET /api/balance/check?apiKey=<key>&amount=0`
  3) 若 `GET` 返回 `405`，则自动 fallback 到 `POST /api/balance/check`（body 使用同名字段）
  4) 若余额接口不可用/失败，则 fallback：`GET /usage/events?apiKey=<key>&page=1&size=1` 并解析最新一条的 `balanceAfter`

- 成功响应（示例）：
  ```json
  {
    "ok": true,
    "balance": 28550,
    "source": "balance_check",
    "base": "https://api.atomx.top",
    "raw": {}
  }
  ```

- 失败响应（示例）：
  ```json
  {
    "error": "Failed to fetch credits",
    "status": 404,
    "details": "<html>...",
    "base": "https://points.atomx.top"
  }
  ```

### 3.3 `POST /api/integration/credits`（扣费）

- 鉴权：必须携带 `Authorization: Bearer <supabase_access_token>`
- 请求体：
  ```json
  {
    "amount": 1,
    "reason": "content_factory_deduct",
    "workflow_id": "content-factory-web"
  }
  ```

- 代理层会注入：
  - `api_key`（来自 `profiles.api_key` 或 header 兜底）
  - `workflow_name: "Content Factory Web"`

---

## 4. Supabase 存储

- 表：`profiles`
- 字段：`api_key`（text）
- 作用：把“外部积分系统的 api_key”绑定到当前 Supabase 用户。

读取策略：
- 若后端配置了 `SUPABASE_SERVICE_ROLE_KEY`，则使用 Service Role 读取 `profiles`（避免 RLS 导致读取失败）。
- 若未配置，则使用当前用户 `access_token` 以 RLS 方式读取。

---

## 5. 前端展示与刷新机制

### 5.1 展示位置

- 设置页（API 配置卡片）：`app/(main)/settings/page.tsx`
  - 展示“剩余积分”
  - 支持手动刷新

- 侧边栏用户区：`components/Sidebar.tsx`
  - 显示积分徽章（深色底 + 黄闪电 + 数值）
  - 不显示“Credits”文字

### 5.2 全局刷新事件（推荐扩展方式）

实现文件：`lib/creditsBus.ts`

- 事件名：`atomx:credits-refresh`
- 触发：`emitCreditsRefresh()`
- 监听：`onCreditsRefresh(handler)`

侧边栏会订阅该事件，收到后调用 `/api/integration/credits` 重新拉取余额。

### 5.3 自动刷新触发点（当前已接入）

- 登录态变化自动刷新：`components/Sidebar.tsx`
  - `SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED`：刷新余额
  - `SIGNED_OUT`：清空余额

- 业务动作后刷新（扣费/生成类动作成功后触发）：
  - 设置页保存/刷新后：`app/(main)/settings/page.tsx`
  - 爆款复刻提交成功后：`app/(main)/replication/ReplicationForm.tsx`
  - 首页故事板任务创建成功后：`app/(main)/dashboard/components/HomeContent.tsx`
  - 生成脚本成功后：`app/(main)/generation/script/Form.tsx`
  - 生成卖点成功后：`app/(main)/generation/selling-points/Form.tsx`

如果后续新增“会扣费/会消耗积分”的入口，建议在成功回调里调用一次 `emitCreditsRefresh()`，即可让侧边栏余额自动更新。

---

## 6. 外部积分系统接口参考（实际使用到的部分）

**Base URL**：通常为 `https://api.atomx.top`（也可由 `POINTS_API_BASE` 覆盖）

### 6.1 `POST /api/credits/deduct`

- Body：`api_key`, `amount`, `reason`, `workflow_id`, `workflow_name`
- 典型响应：
  ```json
  {
    "ok": true,
    "data": { "balanceAfter": 9800, "deducted": 100 }
  }
  ```

### 6.2 `GET /usage/events`

- Query：`apiKey`, `page`, `size`
- 典型响应：
  ```json
  {
    "ok": true,
    "data": { "data": [{ "balanceAfter": 9990, "delta": -10 }], "total": 100 }
  }
  ```

---

## 7. 常见问题（Troubleshooting）

- 设置页/侧边栏出现 HTML（`<!DOCTYPE html>`）而不是 JSON：
  - 基本可以确定 `POINTS_API_BASE` 指向了网页域名或反代错误；推荐使用 `https://api.atomx.top`。

- 余额一直是 `-`：
  - 未登录，或 `profiles.api_key` 未绑定；先去设置页保存用户的 `api_key`。

- 扣费后余额不更新：
  - 确认对应入口在成功回调里调用了 `emitCreditsRefresh()`。
