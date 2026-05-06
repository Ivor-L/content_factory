# AGENTS.md

Content Factory Web — Codex 的 Web 客户端项目，基于 Next.js + Prisma + Supabase。

> 架构细节见 [docs/01-overview/ARCHITECTURE.md](./docs/01-overview/ARCHITECTURE.md)，本文件只包含强制规则与执行流程。

## 开发规则（严格门禁）

### 1) 提交前测试门禁（必须）

**所有 commit 在本地一律执行以下顺序，不得跳步：**
1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`（若改动涉及构建链路、部署、依赖、环境变量、Next 配置、Prisma）

**判定规则：**
- 任一步骤失败：**禁止提交**
- 必须先修复再重跑，直到全部通过
- 不允许以“后续再修”为理由跳过门禁

### 2) UI 改动门禁（必须使用 CDP）

涉及 UI（组件、样式、布局、交互、路由页面）改动时，除测试门禁外，必须执行 CDP 验证：
- 启动：`npm run dev`
- 用 chrome-devtools MCP 打开 `http://localhost:3000` 对应页面
- 完成以下验证并留存证据（截图即可）：
  - 页面渲染正确
  - Console 无报错
  - 关键交互（点击/输入/切换）可用
  - 响应式检查：桌面 + 移动端视口

**判定规则：**
- 未完成 CDP 验证：**禁止提交**

### 3) 小程序开发门禁（必须使用 weapp-dev-mcp）

涉及微信小程序开发、页面调试、组件联调、交互验证时，必须使用 `weapp-dev-mcp` 进行测试和联调：
- 先用 `mp_ensureConnection` 确认微信开发者工具自动化会话可用
- 用 `mp_currentPage` 确认当前页面路径与测试目标一致
- 用 `mp_screenshot` 留存关键页面截图
- 用 `mp_getLogs` 检查 Console/运行日志无异常
- 按需使用 `element_tap`、`element_input`、`page_getData`、`page_callMethod` 等验证关键交互与页面数据
- 响应式或机型相关改动需在微信开发者工具内切换对应设备/视口后复测

**判定规则：**
- 未完成 `weapp-dev-mcp` 联调验证：**禁止提交**
- 微信开发者工具连接失败时，必须记录失败原因，不得以未验证状态提交

### 4) 数据库改动门禁（必须）

涉及 Prisma/Supabase schema、迁移、字段、约束、读写逻辑改动时，必须额外执行：
- `npx prisma migrate status`
- 校验 `prisma/schema.prisma` 与迁移目录的一致性（`prisma/migrations/`、`supabase/migrations/`）
- 本地最小读写回归（至少覆盖新增/修改字段的写入与读取）

**判定规则：**
- 迁移状态异常或一致性未确认：**禁止提交**

### 5) 新增功能先调研（必须）

新增功能或技术方案变更前，必须先完成最小调研结论：
- 备选方案对比（至少 2 种）
- 兼容性结论（Next.js/Prisma/Supabase/n8n/第三方 API）
- 风险与回滚策略
- 不确定点的 POC 结果

**判定规则：**
- 未完成调研直接编码：**禁止进入实现阶段**

### 5.1) 积分配置接入（必须）

所有 Web 端、小程序端、Agent/Skill 新增的付费功能、AI 生图、生视频、音频、LLM 分析、数据采集、n8n/RunningHub/第三方模型调用，必须接入后台「积分配置」。

**新增功能约束：**
- 任何新开发的付费功能，默认就必须接入后台配置，不得先硬编码价格后补。
- 在功能进入开发前，就要先预留稳定 `featureKey`；若存在多模型或多工作流差异价，必须同时设计 `featureKey:modelKey`。
- Agent capability 新增时，必须同步补 `featureKey`，并在需要差异定价时补 `creditModelKey`。

**实现规则：**
- 每个付费能力必须定义稳定的 `featureKey`，并在后台 `/admin/credits` 或 `scripts/seed-credit-configs.ts` 中配置默认项。
- 业务代码禁止硬编码最终扣费金额；统一使用 `deductConfiguredCredits()`，或在 Canvas 已有链路中使用 `getCreditCostForModel()` + `deductCanvasCredits()`。
- 扣费必须写入 `creditUsageLog`；优先使用 `deductConfiguredCredits()`，它会统一完成扣费和日志。
- 如果同一功能支持多个模型/工作流且价格不同，后台配置使用 `featureKey:modelKey`。解析顺序是：`featureKey:normalizedModelKey` → `featureKey:rawModelKey` → `featureKey` → 代码默认值。
- Agent capability 必须声明 `featureKey`；模型或工作流价格不同的能力还必须声明 `creditModelKey`，用于 quota preflight 命中模型级价格。
- 扣费失败必须阻断付费任务继续触发，并返回 402；异步回调后扣费的历史链路必须保证幂等，避免重复扣费。
- 智能复刻、图文复刻、分镜板这类复合流程，必须按阶段拆价，不得只挂一个总价 key。
- 新开发的功能必须先接入后台配置，再接业务路由；如果暂时没有后台配置，视为未完成。

**后台配置示例：**
- `storyboard_video`：分镜视频功能兜底价
- `storyboard_video:veo3.1-fast`：Veo 3.1 Fast 单独价格
- `storyboard_video:bytedance/seedance-2`：Seedance 2 每秒价格
- `storyboard_merge`：成片剪辑
- `storyboard_subtitle`：成片字幕生成
- `canvas_image_generation:nano-banana-pro`：Canvas 指定生图模型价格
- `miniapp_canvas_image:image2`：小程序 AI 作图 image2 工作流价格
- 变现广场 / 聚合广场 / 纯跳转入口（如 `monetization_*`）只作为导流链接，不单独进积分配置，也不进后台首页功能统计。

### 6) Worktree 隔离（必须）

- 有 Worktree 时，所有改动仅允许发生在该 Worktree
- 严禁跨 Worktree 提交
- 严禁 `git push`（除非用户明确指示）
- 开发服务仅在当前 Worktree 启动
- 端口隔离：`PORT=3001 npm run dev`（或其他非默认端口）
- 合并回主分支必须由用户发起
- 合并前必须 `git status`，清理临时文件与调试残留

### 7) Commit 信息规范（必须）

- 标题：Conventional Commits（`feat`/`fix`/`refactor`/`chore`/`docs`/`test`）
- Body 必须包含：
  - 改动内容（按模块/文件分组）
  - 改动原因
  - 影响范围
  - 验证结果（执行了哪些命令、是否通过）
- 修复 Bug 必须写根因；架构决策必须写理由

---

## 自检命令（强制基线）

**基线命令：**
- `npm run lint`
- `npm run typecheck`

**按改动类型追加：**
- 构建/部署/依赖/配置改动：`npm run build`
- UI 改动：`npm run dev` + CDP 全流程验证
- 小程序改动：`weapp-dev-mcp` 联调验证（连接、页面、截图、日志、关键交互）
- 数据库改动：`npx prisma migrate status` + 最小读写回归
- Worker/队列改动：`npm run workers:assets`（最小链路）

---

## 改动自查（提交前逐项打勾）

1. i18n 是否受影响：是否同步更新 `lib/i18n.ts`
2. 数据库是否受影响：是否更新 `prisma/schema.prisma`、`prisma/migrations/`、`supabase/migrations/`
3. 类型是否受影响：是否更新 `types/` 与对应 API/Zod 约束
4. 文档是否受影响：是否更新 `docs/` 对应文档及 `docs/README.md` 索引
5. 是否引入临时调试代码/日志：提交前是否清理
6. 是否保留无关改动：提交前是否剔除

---

## 发版

### 发版流程（标准）
1. 更新 `package.json` version
2. `npm install` 同步 lockfile
3. 执行：`npm run lint` → `npm run typecheck` → `npm run build`
4. 提交代码
5. 按部署目标执行 `DEPLOY.md` 与 `docs/03-deployment/` 指南
6. 服务器标准更新方式：在项目目录执行 `./scripts/deploy-safe.sh`
   - 该脚本内置：补齐缺失环境变量键（不覆盖已有值）→ 运行时环境校验 → `git pull --ff-only` → `docker compose up -d --build`

### 发版纪律（强制）
- 禁止自动发版
- `git push`、`git tag` 必须等用户明确指示
- 未完成测试门禁不得进入发版步骤

### 构建建议
- 构建前可执行：`rm -rf .next/`，避免历史缓存干扰

---

## 执行计划（中大型任务强制）

符合以下任一条件，必须先写执行计划再开工：
- 跨 3 个及以上模块
- 涉及 schema/迁移变更
- 需要分阶段交付

**计划要求：**
- 文档放 `docs/`，命名建议：`YYYYMMDD-<topic>-plan.md`
- 至少包含：目标、范围、分阶段里程碑、风险、回滚、验收标准
- 发现技术债务时，在计划中追加 `Tech Debt` 小节
- 新增计划后必须更新 `docs/README.md` 索引

---

## 提交模板（必须附测试证据）

```text
<type>: <summary>

Changes:
- 模块A: ...
- 模块B: ...

Why:
- ...

Impact:
- ...

Validation:
- [x] npm run lint
- [x] npm run typecheck
- [x] npm run build（如适用）
- [x] CDP 验证（如适用，附页面/交互说明）
- [x] weapp-dev-mcp 联调验证（如适用，附页面/交互/日志说明）
- [x] prisma migrate status（如适用）
- [x] worker 最小链路（如适用）

Root Cause (for fix):
- ...
```

---

## 文档

- [docs/README.md](./docs/README.md) — 文档总索引（先读）
- [docs/01-overview/ARCHITECTURE.md](./docs/01-overview/ARCHITECTURE.md) — 架构与数据流
- [docs/02-development/DEVELOPMENT.md](./docs/02-development/DEVELOPMENT.md) — 本地开发流程
- [docs/02-development/DATABASE.md](./docs/02-development/DATABASE.md) — 数据库与迁移规范
- [docs/07-testing/TEST_PLAN.md](./docs/07-testing/TEST_PLAN.md) — 测试与验收基线

**检索前先读对应目录的 README.md；增删文件后更新索引。**
