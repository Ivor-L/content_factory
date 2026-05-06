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
2. 代理层验证身份：Web 端从 `Authorization: Bearer <access_token>` 获取当前用户；小程序可用 `X-User-Api-Key`
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

- 鉴权：Web 端携带 `Authorization: Bearer <supabase_access_token>`；小程序可携带 `X-User-Api-Key`
- 用户 `api_key` 获取优先级：
  1) 从登录态解析当前用户并读取 `profiles.api_key`
  2) 兜底：从请求头 `X-User-Api-Key` 读取（主要用于小程序和设置页刚保存但 profiles 读取受限/延迟时）

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

- 鉴权：Web 端携带 `Authorization: Bearer <supabase_access_token>`；小程序可携带 `X-User-Api-Key`
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

## 7. 积分配置管理（Admin）

### 7.1 设计思路

积分费用分两层：

| 层 | 职责 | 系统 |
|---|---|---|
| **积分配置**（本系统 DB） | 定义每个功能/模型收多少积分 | `credit_configs` 表 |
| **积分余额 + 扣费执行** | 实际扣减用户余额、查询余额 | 外部 `api.atomx.top` |

### 7.2 数据库模型

表名：`credit_configs`（`public` schema）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | String | 主键（cuid） |
| `featureKey` | String | 唯一标识，格式：`"category"` 或 `"category:modelKey"` |
| `featureName` | String | 展示名称，如"Canvas 视频 · Veo3" |
| `category` | String | 功能分组，如 `canvas_video`、`storyboard` |
| `model_key` | String? | 模型标识，固定费用功能为 null |
| `amount` | Int | 每次消耗积分数（正整数） |
| `enabled` | Boolean | 是否启用，禁用后不参与计费 |
| `description` | String? | 说明文字 |

### 7.3 后台计价 Key 规则

运行时统一从 `credit_configs` 读取价格。支持功能级兜底价和模型/工作流级差异价：

1. `featureKey:normalizedModelKey`
2. `featureKey:rawModelKey`
3. `featureKey`
4. 代码里的 `defaultAmount`

例如同一个生视频功能可以同时配置；其中 Seedance 这条链路支持用户选择时长，后台 `amount` 表示每秒单价，扣费时按 `单价 × 秒数` 计算：

| featureKey | 说明 |
|---|---|
| `storyboard_video` | 分镜视频功能兜底价 |
| `storyboard_video:veo3.1-fast` | Veo 3.1 Fast 单独价格 |
| `storyboard_video:bytedance/seedance-2` | Seedance 2 每秒价格 |
| `storyboard_video:bytedance/seedance-2-fast` | Seedance 2 Fast 每秒价格 |
| `storyboard_video:bytedance/seedance-2.0` | Seedance 2.0 兼容写法每秒价格 |
| `storyboard_video:bytedance/seedance-2.0-fast` | Seedance 2.0 Fast 兼容写法每秒价格 |

同一个生图功能可以配置：

| featureKey | 说明 |
|---|---|
| `canvas_image_generation` | Canvas 生图兜底价 |
| `canvas_image_generation:nano-banana-pro` | Canvas Nano Banana Pro 价格 |
| `miniapp_canvas_image:image2` | 小程序 image2 工作流价格 |

### 7.4 默认积分配置

| featureKey | 功能 | 默认积分 |
|---|---|---|
| `canvas_image_generation` | Canvas 图片生成兜底 | 1 |
| `canvas_image_generation:nano-banana` | Canvas 图片 · Nano Banana | 1 |
| `canvas_image_generation:nano-banana-pro` | Canvas 图片 · Nano Banana Pro | 2 |
| `canvas_video_generation` | Canvas 视频生成兜底 | 1 |
| `canvas_video_generation:veo3` | Canvas 视频 · Veo3 | 5 |
| `canvas_video_generation:veo3-fast` | Canvas 视频 · Veo3 Fast | 3 |
| `canvas_video_generation:sora2` | Canvas 视频 · Sora2 | 5 |
| `canvas_video_generation:grok3` | Canvas 视频 · Grok3 | 4 |
| `miniapp_canvas_image` | 小程序 AI 作图兜底 | 40 |
| `miniapp_canvas_image:image2` | 小程序 AI 作图 · image2 | 40 |
| `storyboard_split` | 分镜拆分 | 1 |
| `storyboard_video:veo3` | 分镜视频生成 · Veo3 | 5 |
| `storyboard_video:veo3-fast` | 分镜视频生成 · Veo3 Fast | 3 |
| `storyboard_video:veo3.1-fast` | 分镜视频生成 · Veo3.1 Fast | 3 |
| `storyboard_video:bytedance/seedance-2` | 分镜视频生成 · Seedance 2.0 | 4 / 秒 |
| `storyboard_video:bytedance/seedance-2-fast` | 分镜视频生成 · Seedance 2.0 Fast | 3 / 秒 |
| `storyboard_video:bytedance/seedance-2.0` | 分镜视频生成 · Seedance 2.0 | 4 / 秒 |
| `storyboard_video:bytedance/seedance-2.0-fast` | 分镜视频生成 · Seedance 2.0 Fast | 3 / 秒 |
| `storyboard_merge` | 成片剪辑 | 1 |
| `storyboard_subtitle` | 成片字幕生成 | 1 |
| `image_text_replication` | 图文复刻 | 2 |
| `image_text_replication:start` | 图文复刻 · 拆解建任务 | 1 |
| `image_text_replication:breakdown` | 图文复刻 · 图片拆解 | 5 |
| `image_text_replication:generate` | 图文复刻 · 图片生成 | 2 |
| `image_text_replication:extract-video-copy` | 图文复刻 · 视频文案提取 | 2 |
| `writing_style_extraction` | 写作风格提取 | 1 |
| `my_note_breakdown` | 我的笔记 · 图片解析 | 5 |
| `my_note_breakdown_retry` | 我的笔记 · 图片解析重试 | 1 |
| `my_note_rewrite` | 我的笔记 · 一键仿写 | 1 |
| `digital_human` | 数字人视频 | 3 |
| `digital_human:flow_digital_human` | 数字人标准工作流 | 30 |
| `digital_human:flow_digital_human16s` | 数字人短视频工作流 | 15 |
| `action_transfer` | 动作复刻兜底 | 30 |
| `action_transfer:flow_action_transfer_wan_animate` | 动作复刻 Wan Animate | 30 |
| `knowledge_video` | 知识视频 | 2 |
| `xhs_note_collect` | 小红书笔记采集 | 5 |
| `xhs_card_layout` | 小红书图文排版 | 1 |
| `xhs_infographic_generate` | 小红书信息卡片生成 | 10 |
| `xhs_vision_style_web` | 小红书视觉风格分析 | 8 |
| `social_instagram_collect` | Instagram 数据采集 | 5 |
| `social_facebook_collect` | Facebook 数据采集 | 5 |
| `social_comments_collect` | 社媒评论抓取 | 5 |
| `ai_agent:default` | AI 助手 · 默认模型 | 1 |
| `ai_agent:gpt-4o` | AI 助手 · GPT-4o | 3 |
| `ai_agent:claude-opus` | AI 助手 · Claude Opus | 5 |
| `ai_agent:deepseek-r1` | AI 助手 · DeepSeek R1 | 2 |

### 7.5 运行时读取（lib/creditCosts.ts）

```typescript
import { getCreditCostForModel } from "@/lib/creditCosts";
import { deductConfiguredCredits } from "@/lib/creditBilling";

const amount = await getCreditCostForModel("storyboard_video", "veo3.1-fast", 3);

await deductConfiguredCredits({
  apiKey,
  featureKey: "storyboard_video",
  modelKey: "veo3.1-fast",
  defaultAmount: 3,
  workflowId: "flow_storyboard_video",
  workflowName: "分镜视频生成",
});
```

- 首次调用从数据库加载全部配置，缓存 60 秒
- Admin 页面保存后立即调用 `invalidateCreditCostCache()`，下次请求重新加载

### 7.6 Admin 页面（/admin/credits）

路径：`app/(admin)/admin/credits/page.tsx`

功能：
- 按功能分组展示所有积分配置
- 点击"编辑"进入行内编辑模式，修改积分数和启用状态
- 保存后立即生效（60 秒内）
- 支持批量保存所有修改

### 7.7 Admin API

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/admin/credits` | 列出所有配置，按 category+featureKey 排序 |
| `POST` | `/api/admin/credits` | 新增一条配置 |
| `PATCH` | `/api/admin/credits/[id]` | 更新 amount / enabled / description |
| `DELETE` | `/api/admin/credits/[id]` | 删除配置 |

所有接口需要 admin 权限（`profiles.is_admin = true`）。

### 7.8 新增功能时的流程

1. 在 `scripts/seed-credit-configs.ts` 添加默认积分条目
2. 执行 `npx tsx scripts/seed-credit-configs.ts` 写入数据库（幂等，安全重复执行）
3. 在 API route 中用 `deductConfiguredCredits()` 扣费；如需自行组合 Canvas 旧链路，用 `getCreditCostForModel()` 读取费用
4. 不同模型/工作流价格不同，必须传入 `modelKey`
5. Agent capability 必须声明 `featureKey`；如果有模型/工作流价差，还要声明 `creditModelKey`
6. 新开发的功能先接后台配置，再写业务调用，禁止先硬编码价格后补
7. 如需在 admin UI 分组显示，在 `app/(admin)/admin/credits/page.tsx` 的 `CATEGORY_META` 中添加分类
8. 成片剪辑、字幕、分镜视频这类后链路功能，也必须各自挂到后台配置，不要合并成一个总价 key

---

## 8. 常见问题（Troubleshooting）

- 设置页/侧边栏出现 HTML（`<!DOCTYPE html>`）而不是 JSON：
  - 基本可以确定 `POINTS_API_BASE` 指向了网页域名或反代错误；推荐使用 `https://api.atomx.top`。

- 余额一直是 `-`：
  - 未登录，或 `profiles.api_key` 未绑定；先去设置页保存用户的 `api_key`。

- 扣费后余额不更新：
  - 确认对应入口在成功回调里调用了 `emitCreditsRefresh()`。
