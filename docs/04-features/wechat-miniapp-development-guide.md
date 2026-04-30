# 小蚁AI 微信小程序开发说明（基于 Content Factory Web）

最后更新：2026-04-30
适用仓库：`content-factory-web`

---

## 1. 目标与范围

本文档用于指导「小蚁AI」微信小程序从 0 到 1 落地，要求：

- 复用当前 Web 应用（Next.js + Prisma + Supabase + n8n）已有能力；
- 按既定信息架构实现核心业务闭环；
- 明确哪些能力可直接复用、哪些需要新增；
- 提供可执行的分阶段开发与验收标准。

本期默认目标为 **MVP + 可扩展架构**，先跑通主链路，再逐步补齐高级玩法。

---

## 2. 信息架构（按你提供的结构图）

### 2.1 一级导航

1. 首页
2. 爆款广场
3. 资产
4. 作品
5. 我的

### 2.2 二级功能拆解

1. 首页
- 写文案
- 做图文
- 做视频

2. 爆款广场
- 分类：保险 / 法律 / 金融 / 教育 / 心理 / AI / 餐饮 / 美业
- 一键创作
- 创作图文：长文卡片 / 信息图
- 创作视频：
  - 数字人（图片驱动 / 视频驱动 / 动作迁移+对口型）
  - 脱口秀视频
  - 剧情视频

3. 资产
- 模板
- 角色
- 产品
- 风格预设

4. 作品
- 图文
- 视频
- 文案

5. 我的
- 名字
- 头像
- 用户 id
- 积分
- 邀请赚钱

---

## 3. 现有能力盘点（当前仓库）

### 3.1 已有小程序基础（POC 已验证）

仓库已有 `digital_human_miniapp/taro`，包含：

- 小程序端技术栈：Taro + React + TypeScript；
- 页面骨架：登录、首页、形象库、生成、记录、我的；
- 微信登录与绑定流程（`/api/auth/wechat/login`、`/api/auth/wechat/bind`）；
- 数字人形象 CRUD（`/api/characters`）；
- 上传能力（`/api/upload`）；
- 数字人任务创建与记录（`/api/digital-human/videos`）。

### 3.2 后端可复用能力

- 用户鉴权：`lib/authServer.ts` 支持 Token 与 `X-User-Api-Key`；
- 微信用户绑定：`profiles.wechat_openid` 字段已存在；
- 内容任务：`creative-tasks`、`taskSummary`、`storyboard`、`replication`、`scripts` 等接口已具备；
- 爆款内容：`/api/viral-references` 已支持分类、搜索、分页；
- 工作流编排：n8n webhook 回调链路齐全（图文/视频/数字人）。

结论：当前仓库可直接承载小程序后端，无需新建独立服务。

---

## 4. 技术方案调研结论（先调研后开发）

### 4.1 备选方案对比

| 方案 | 描述 | 优点 | 风险/缺点 |
|---|---|---|---|
| A. 原生小程序 | 原生 WXML/WXSS/JS | 原生能力最全，包体控制好 | 与现有 React 生态割裂，研发效率偏低 |
| B. Taro（推荐） | React 语法编译到微信小程序 | 与当前前端团队技能一致，已有 POC 可复用 | 需注意包体与组件兼容 |
| C. uni-app | Vue/跨端方案 | 跨端生态成熟 | 与当前 React 体系不一致，迁移成本高 |

### 4.2 选型结论

采用 **Taro（方案 B）**，原因：

- 仓库已有可运行 Taro 原型，已验证微信登录与数字人链路；
- 与现有 React/TS 工程一致，上手快；
- 可平滑复用 Web 端后端 API 与鉴权模式。

### 4.3 兼容性结论

- Next.js：兼容，可继续作为 BFF/API 层；
- Prisma：兼容，继续作为主数据访问层；
- Supabase：兼容（Auth + Postgres + Storage）；
- n8n：兼容，继续处理重任务异步编排；
- 第三方生成服务：兼容，保持由 n8n/现有服务端封装调用。

### 4.4 POC 结果（已验证）

- 已验证微信 `code -> openid` 登录流程；
- 已验证 openid 与现有账号 API Key 绑定；
- 已验证上传素材、创建数字人任务、查询生成记录；
- 已验证小程序 tab 架构可用。

---

## 5. 总体架构设计（小程序版）

```
微信小程序（Taro）
  -> Next.js API（鉴权、参数校验、任务入库）
    -> Prisma / Supabase Postgres（业务数据）
    -> Supabase Storage（素材存储）
    -> n8n Workflow（异步生成与回调）
      -> 第三方 AI 服务（文案/图文/视频）
```

设计原则：

1. 小程序只做轻交互与任务触发，不直接对接第三方 AI；
2. 重任务统一走服务端与 n8n，便于风控、限流、审计；
3. 所有任务结果统一回写数据库，小程序只读任务状态与结果。

---

## 6. 功能映射：复用 vs 新增

### 6.1 首页（写文案 / 做图文 / 做视频）

- 复用：
  - 文案：`/api/creative-generate`、`/api/generation/script`、`/api/scripts/*`
  - 图文：`/api/image-text-replication/start`、`/api/xhs-text2img/plan`
  - 视频：`/api/digital-human/videos`、`/api/my-works/t2v`
- 新增建议：
  - `GET /api/miniapp/home/cards`（聚合首页能力入口与推荐配置）

### 6.2 爆款广场

- 复用：
  - 列表/筛选：`GET /api/viral-references?category=&q=&cursor=&limit=`
  - 一键创作起点：`POST /api/image-text-replication/start`
- 新增建议：
  - 分类映射表（保险/法律等）与后台可配置推荐策略；
  - `POST /api/miniapp/hot-square/create`（统一路由到图文/视频任务）。

### 6.3 资产（模板/角色/产品/风格预设）

- 复用：
  - 角色：`/api/characters`
  - 产品：`/api/products`
  - 风格：`/api/canvas/presets`、`/api/assets/styles`
- 新增建议：
  - 模板中心接口：`/api/miniapp/templates`（可先由静态配置 + DB 混合）。

### 6.4 作品（图文/视频/文案）

- 复用：
  - 视频：`/api/digital-human/videos`、`/api/my-works/t2v`
  - 文案/图文：`/api/creative-tasks`、`/api/tasks`
- 新增建议：
  - `GET /api/miniapp/works`（聚合多任务源，统一分页与状态字段）。

### 6.5 我的（资料/积分/邀请）

- 复用：
  - 用户信息：`profiles` + 现有 session/key 上下文；
  - 积分：`/api/integration/credits`、`/api/integration/usage`
  - 邀请：`/api/referrals`
- 新增建议：
  - `GET /api/miniapp/me`（聚合用户信息、积分摘要、邀请数据）；
  - 邀请收益统计视图（后端聚合）。

---

## 7. 数据与鉴权设计

### 7.1 鉴权

1. 小程序端调用 `wx.login` 获取 `code`；
2. 服务端通过微信 `code2session` 换 `openid`；
3. 若已绑定 `profiles.wechat_openid`，返回 API Key + 用户信息；
4. 若未绑定，进入绑定页，用户输入 Web 端 API Key 完成绑定；
5. 后续请求头使用 `X-User-Api-Key`。

### 7.2 关键数据表（可复用）

- `public.profiles`（含 `wechat_openid`、`api_key`）
- `Character`
- `DigitalHumanVideo`
- `CreativeTask` / `TaskSummary`
- `ViralReferenceItem`

### 7.3 建议新增（按需）

- `miniapp_invite_events`：邀请行为与奖励事件；
- `miniapp_template_library`：模板库（行业、类型、可见性、排序）；
- `miniapp_user_preferences`：用户偏好（最近分类、默认模式等）。

---

## 8. 分阶段开发计划（MVP）

## Phase 1：基础可用（1-2 周）

目标：跑通登录、主导航、核心创作入口。

交付：

1. 微信登录/绑定稳定版；
2. 5 个 tab 页面骨架（首页/爆款/资产/作品/我的）；
3. 首页三大入口（文案/图文/视频）打通；
4. 我的页展示用户信息 + 积分。

验收：

- 新用户可完成绑定并进入首页；
- 能发起至少一种文案任务与一种视频任务；
- 我的页可正确显示积分。

## Phase 2：主业务闭环（2-3 周）

目标：爆款到创作再到作品沉淀。

交付：

1. 爆款广场分类、搜索、详情；
2. 一键创作（图文/视频）统一入口；
3. 资产中心（角色、产品、风格）可管理；
4. 作品中心支持状态筛选、结果预览。

验收：

- 爆款广场任一素材可一键发起创作；
- 任务状态可追踪到完成或失败；
- 作品可二次复用。

## Phase 3：增长与运营（1-2 周）

目标：补齐积分与邀请增长闭环。

交付：

1. 邀请赚钱页面与收益记录；
2. 模板库上线（按行业推荐）；
3. 关键埋点与运营报表。

验收：

- 邀请链路可追踪；
- 模板使用率、转化率可统计。

---

## 9. 测试与发布要求

### 9.1 开发与联调

- 小程序端（Taro）：`npm run dev:weapp`
- Web API：`npm run dev`（建议使用非冲突端口）
- 小程序请求域名需配置为可访问的后端地址。

### 9.2 测试重点

1. 登录/绑定异常：code 失效、重复绑定、API Key 无效；
2. 大文件上传：图片/音频失败重试；
3. 异步任务状态：排队中、生成中、失败重试；
4. 积分扣减一致性：任务失败是否回滚/补偿；
5. 真机兼容：iOS/Android 小程序基础交互一致。

### 9.3 版本门禁（与仓库 AGENTS.md 一致）

涉及仓库代码提交前，至少执行：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`（涉及构建链路/依赖/配置时）

若有 UI 改动，需完成本地页面验证与关键交互检查；  
若有 DB 变更，需执行迁移状态检查与最小读写回归。

---

## 10. 风险与回滚策略

### 10.1 主要风险

1. 微信审核风险：涉及 AI 内容需补充内容安全策略；
2. 异步链路长：第三方服务波动导致生成超时；
3. 积分与计费一致性：回调重试可能导致重复扣费；
4. 包体体积：模板/素材过多导致首包超限。

### 10.2 缓解措施

1. 统一内容安全网关（敏感词/违规图检测）；
2. 任务幂等与回调幂等（按 taskId + status 转移校验）；
3. 积分扣减引入事务日志与补偿任务；
4. 分包加载 + CDN 静态资源下沉。

### 10.3 回滚策略

1. 小程序端：按版本回退到上一稳定包；
2. 服务端：新增接口走独立路由，异常时可灰度关闭；
3. 数据层：新增表与字段向后兼容，不破坏旧逻辑；
4. 工作流：n8n 版本保留快照，支持一键回切。

---

## 11. 建议目录结构（后续实施）

建议将现有 `digital_human_miniapp/taro` 升级为正式工程，例如：

```
miniapp/
  taro/
    src/
      pages/
        home/
        hot-square/
        assets/
        works/
        profile/
      services/
      store/
      components/
```

并在根仓库补充：

- `docs/04-features/wechat-miniapp-api-contract.md`（接口契约）
- `docs/07-testing/miniapp-test-cases.md`（小程序专项测试用例）

---

## 12. 本文档对应的下一步动作

1. 先按 Phase 1 建立正式小程序工程骨架（复用现有 Taro POC）；
2. 定义 `miniapp` 聚合接口（首页、作品、我的）；
3. 把爆款广场分类与一键创作链路优先打通；
4. 再进入 Phase 2 的资产与模板能力扩展。

