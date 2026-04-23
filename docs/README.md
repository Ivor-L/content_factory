# 文档索引

> 所有文档按模块分类存放，新增文档请放入对应目录。

---

## 01 · 入门 & 架构 [`01-overview/`](./01-overview/)

| 文件 | 说明 |
|------|------|
| [README.md](./01-overview/README.md) | 文档导航总览 |
| [ARCHITECTURE.md](./01-overview/ARCHITECTURE.md) | 系统架构、技术栈、模块划分、核心数据流 |

---

## 02 · 开发指南 [`02-development/`](./02-development/)

| 文件 | 说明 |
|------|------|
| [DEVELOPMENT.md](./02-development/DEVELOPMENT.md) | 本地环境搭建、启动步骤、常用脚本 |
| [DATABASE.md](./02-development/DATABASE.md) | 数据库 Schema、Prisma 模型、迁移流程 |
| [ENV_AND_SECRETS.md](./02-development/ENV_AND_SECRETS.md) | 环境变量清单与密钥管理 |

---

## 03 · 部署 [`03-deployment/`](./03-deployment/)

| 文件 | 说明 |
|------|------|
| [DEPLOY_CLOUDFLARE_SITE_ONLY.md](./03-deployment/DEPLOY_CLOUDFLARE_SITE_ONLY.md) | 官网页面单独部署到 Cloudflare Workers |
| [MULTI_TENANT_DEPLOY.md](./03-deployment/MULTI_TENANT_DEPLOY.md) | 多租户功能部署、数据库迁移、租户初始化 |

---

## 04 · 功能模块 [`04-features/`](./04-features/)

| 文件 | 说明 |
|------|------|
| [WORKFLOWS.md](./04-features/WORKFLOWS.md) | 所有 n8n 工作流与功能的映射关系 |
| [CREDIT_SYSTEM.md](./04-features/CREDIT_SYSTEM.md) | 积分/余额系统架构、API 代理层 |
| [storyboard-realtime.md](./04-features/storyboard-realtime.md) | Supabase Realtime 实时推送架构（替代轮询） |
| [viral-reference-sync.md](./04-features/viral-reference-sync.md) | 爆款内容引用同步（Chrome 插件 + API） |
| [hot-clone-recipe-prompt-config.md](./04-features/hot-clone-recipe-prompt-config.md) | 热克隆视频复制 Prompt 配置与运行时覆盖 |
| [one-click-replication-test.md](./04-features/one-click-replication-test.md) | 一键复制功能测试报告 |

---

## 05 · n8n 集成 [`05-n8n/`](./05-n8n/)

| 文件 | 说明 |
|------|------|
| [N8N_INTEGRATION.md](./05-n8n/N8N_INTEGRATION.md) | n8n 集成指南、触发端点、回调模式、新增工作流方法 |
| [n8n-workflow-sync.md](./05-n8n/n8n-workflow-sync.md) | n8n 线上工作流与仓库快照同步手册 |
| [n8n-storyboard-breakdown-fix.md](./05-n8n/n8n-storyboard-breakdown-fix.md) | 分镜拆解工作流修复（Gemini 场景检测） |
| [writing-style-workflow-refactor.md](./05-n8n/writing-style-workflow-refactor.md) | 写作风格提取工作流重构（去除飞书依赖） |

---

## 06 · Canvas 系统 [`06-canvas/`](./06-canvas/)

| 文件 | 说明 |
|------|------|
| [canvas-system-upgrade-blueprint.md](./06-canvas/canvas-system-upgrade-blueprint.md) | Canvas 升级蓝图：演进为统一创作 OS |
| [canvas-node-unification.md](./06-canvas/canvas-node-unification.md) | 节点统一重构方案（单卡片 + 可展开面板） |
| [canvas-upstream-api-contract.md](./06-canvas/canvas-upstream-api-contract.md) | Canvas 上游 API 接口契约（聊天、图片、视频） |

---

## 07 · 测试 & 审计 [`07-testing/`](./07-testing/)

| 文件 | 说明 |
|------|------|
| [TEST_PLAN.md](./07-testing/TEST_PLAN.md) | QA 测试计划、测试套件、风险清单 |
| [CLEANUP_AUDIT_2026-03-24.md](./07-testing/CLEANUP_AUDIT_2026-03-24.md) | 2026-03-24 仓库清理审计报告 |

---

## 08 · Prompts [`08-prompts/`](./08-prompts/)

| 文件 | 说明 |
|------|------|
| [style-preset-analysis.md](./08-prompts/style-preset-analysis.md) | Gemini 风格 DNA 提取 Prompt 模板 |

---

## 其他资源

- [`image/`](./image/) — 文档插图
- [`云雾API 接口对接3.17.apifox.json`](./云雾API%20接口对接3.17%20.apifox.json) — 云雾 API Apifox 配置文件

---

## 执行计划

| 文件 | 说明 |
|------|------|
| [20260424-chat-conversation-lifecycle-plan.md](./20260424-chat-conversation-lifecycle-plan.md) | 聊天会话生命周期改造：支持删除历史、新增懒创建 |
