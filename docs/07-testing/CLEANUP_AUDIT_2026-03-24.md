# 仓库清理审计（2026-03-24）

> 目标：先“梳理”，再“分级清理”。本文件仅做事实盘点与建议，不直接删除文件。

## 执行记录（2026-03-24）

已执行的低风险清理：
- 删除测试页面：`app/(main)/agent-test/page.tsx`
- 删除测试接口：`app/api/agent/chat-test/route.ts`
- 删除 debug 接口：
  - `app/api/debug/layout-data/route.ts`
  - `app/api/debug/task-detail/route.ts`
- 删除本地产物：
  - 根目录历史归档：`content-factory-web-20260318.tar`、`content-factory-web-20260318.tar.gz`
  - 根目录站点打包：`nextide-site-package-20260324-022441.zip`、`nextide-site-static-20260324-022441.zip`
  - 运行日志产物：`build.log`、`runs/worker-assets.log`、`runs/worker-assets.pid`、`runs/system-style-presets-backup-*.json`
- 删除扩展历史副本目录（中低风险）：
  - `workflows/nextide-extension-v0.1.2.backup-20260321`
  - `workflows/nextide-extension-v0.1.2.backup-20260321-2`
  - `workflows/nextide-extension-v0.1.2.backup-20260322`
  - `workflows/nextide-extension-v0.1.2.backup-20260323-latest`
  - `workflows/nextide-extension-v0.1.2.backup-20260323-pre-nextide0323`
  - `workflows/nextide-extension-v0.1.2.backup-20260323-working`
  - `workflows/nextide-extension-v0.1.2.prev`
  - 保留：`workflows/nextide-extension-v0.1.2`（当前构建源）
- 删除历史页面入口（仅保留 `/my-works`）：
  - `app/(main)/my-videos/page.tsx`
  - `app/(main)/workspace/page.tsx`
- 下线旧 AI Agent 功能（不影响主业务创建流）：
  - 删除路由接口：
    - `app/api/agent/chat/route.ts`
    - `app/api/agent/create-task/route.ts`
  - 删除前端组件：
    - `components/AgentDock.tsx`
    - `components/agent/*`
  - 业务联动替换：
    - `app/(main)/layout.tsx` 移除 `AgentDock` 挂载
    - `app/(main)/dashboard/components/HomeContent.tsx` 用直接“快捷创建按钮”替代 Agent 命令台
    - `components/ProductForm.tsx` / `components/ScriptForm.tsx` / `components/DigitalHumanModal.tsx` 移除 `FormAssistant` 注入

接口与文档影响排查（删除后）：
- 代码引用扫描：未发现业务代码继续引用 `/workspace` 或 `/my-videos`（仅审计脚本/审计文档仍保留历史记录）。
- 接口引用扫描：未发现业务代码继续引用 `/api/agent/chat-test` 或 `/api/debug/*`。
- 类型检查：`npm run typecheck` 通过。

## 1) 当前仓库结构判断

### 核心运行区（建议保留）
- `app/`
- `components/`
- `lib/`
- `hooks/`
- `contexts/`
- `prisma/`
- `supabase/`
- `public/`（其中 `public/extensions/*.zip` 被侧边栏下载入口直接使用）

### 已被 TS/ESLint 排除的非核心区（高概率旁路/副本）
证据：`tsconfig.json` 与 `eslint.config.mjs` 都忽略了以下目录。
- `workflows/**`
- `public/extensions/**`
- `nextide0323/**`
- `nextide-site/**`
- `digital_human_miniapp/**`
- `scripts/**`
- `workers/**`
- `runs/**`

这说明它们并不参与当前主应用的类型检查与 ESLint 主流程，适合作为“清理重点区”。

## 2) 体积热点（优先治理）

按目录大小（审计时）：
- `nextide-site` 约 `388M`
- `digital_human_miniapp` 约 `223M`
- `content-factory-web-20260318.tar` 约 `273M`
- `content-factory-web-20260318.tar.gz` 约 `272M`
- `workflows` 约 `24M`
- `nextide0323` 约 `3.7M`

补充：
- `node_modules`、`.next`、`.git` 虽大，但分别是依赖/构建缓存/Git元数据，属于正常体积来源，不建议作为业务清理对象。

## 3) 页面与接口“历史残留”候选

### 低风险候选（优先处理）
- （已处理）`app/(main)/agent-test/page.tsx`
- （已处理）`app/api/agent/chat-test/route.ts`
- （已处理）`app/api/debug/*`

### 中风险候选（确认后处理）
- （本项已执行）`workspace` 与 `my-videos` 页面入口已移除，仅保留 `/my-works`。

### 不建议误删
- `app/auth/callback/page.tsx`
  - 虽然内部引用少，但通常由第三方登录回调直接命中。
- `app/(site)/[tenant]/openclaw/page.tsx`
  - 是租户路径别名转发，删除可能影响租户 URL 兼容。

## 4) 扩展包与工作流副本

### 事实
- 当前打包脚本 `scripts/build-extension-packages.ts` 以
  `workflows/nextide-extension-v0.1.2` 为源，产出到 `public/extensions/*.zip`。
- `workflows/` 下存在多个 `nextide-extension-v0.1.2.backup-*` 与 `.prev` 目录，内容高度重复。

### 建议
- 只保留一份“当前可构建源”（`workflows/nextide-extension-v0.1.2`）。
- 其他备份目录迁移到仓库外（对象存储/网盘）或集中归档到 `workflows/archive/YYYYMMDD/`。

## 5) 建议执行顺序（从低风险到中风险）

1. 清理本地产物（根目录 tar/zip、`build.log`、`runs/*.log|*.pid`）。
2. 关闭/删除测试与 debug 页面/API（`agent-test`、`chat-test`、`api/debug`）。
3. 归档扩展历史副本（`workflows/nextide-extension-v0.1.2.backup-*`、`.prev`）。
4. 评估旁路项目是否迁出主仓库（`nextide-site`、`digital_human_miniapp`、`nextide0323`）。
5. 后续仅在外部回跳兼容需求出现时，再考虑补充 301/302 映射。

## 6) 工具

已提供只读审计脚本：

```bash
./scripts/maintenance/audit_clutter.sh
```

脚本只做报告，不会删除文件。
