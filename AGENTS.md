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

### 3) 数据库改动门禁（必须）

涉及 Prisma/Supabase schema、迁移、字段、约束、读写逻辑改动时，必须额外执行：
- `npx prisma migrate status`
- 校验 `prisma/schema.prisma` 与迁移目录的一致性（`prisma/migrations/`、`supabase/migrations/`）
- 本地最小读写回归（至少覆盖新增/修改字段的写入与读取）

**判定规则：**
- 迁移状态异常或一致性未确认：**禁止提交**

### 4) 新增功能先调研（必须）

新增功能或技术方案变更前，必须先完成最小调研结论：
- 备选方案对比（至少 2 种）
- 兼容性结论（Next.js/Prisma/Supabase/n8n/第三方 API）
- 风险与回滚策略
- 不确定点的 POC 结果

**判定规则：**
- 未完成调研直接编码：**禁止进入实现阶段**

### 5) Worktree 隔离（必须）

- 有 Worktree 时，所有改动仅允许发生在该 Worktree
- 严禁跨 Worktree 提交
- 严禁 `git push`（除非用户明确指示）
- 开发服务仅在当前 Worktree 启动
- 端口隔离：`PORT=3001 npm run dev`（或其他非默认端口）
- 合并回主分支必须由用户发起
- 合并前必须 `git status`，清理临时文件与调试残留

### 6) Commit 信息规范（必须）

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
