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
| [wechat-miniapp-development-guide.md](./04-features/wechat-miniapp-development-guide.md) | 小蚁AI 微信小程序开发说明（信息架构、能力映射、分阶段落地） |

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
| [20260424-xhs-parse-save-to-folder-plan.md](./20260424-xhs-parse-save-to-folder-plan.md) | 图文解析结果保存到知识库文件夹 |
| [20260424-home-agent-chat-unification-plan.md](./20260424-home-agent-chat-unification-plan.md) | 首页与 agent 对话统一到 NexTide 交互 |
| [20260425-content-factory-wiki-organizer-plan.md](./20260425-content-factory-wiki-organizer-plan.md) | 内容工厂 raw 导入与一键 LLM-Wiki 梳理 |
| [20260425-content-factory-fixed-output-format-plan.md](./20260425-content-factory-fixed-output-format-plan.md) | 内容工厂固定六段输出格式与下游排版消费对齐 |
| [20260501-auth-multi-identity-plan.md](./20260501-auth-multi-identity-plan.md) | 多身份登录体系改造（邮箱/微信/手机号）与迁移计划 |
| [20260501-miniapp-image-generate-page-plan.md](./20260501-miniapp-image-generate-page-plan.md) | 小程序图片生成页（AI作图/信息图/图文卡片）多功能切换方案 |
| [20260501-miniapp-digital-human-image-video-toggle-plan.md](./20260501-miniapp-digital-human-image-video-toggle-plan.md) | 小程序数字人创建页扩展：图片/视频双入口与后端任务分流方案 |
| [20260501-storyboard-orchestrator-plan.md](./20260501-storyboard-orchestrator-plan.md) | 分镜编排层（Storyboard Orchestrator）统一化方案与实施计划 |
| [20260502-monetization-square-config-center-plan.md](./20260502-monetization-square-config-center-plan.md) | 变现广场配置中心方案：后台可配置类目/类型/素材/动作与提示词 |
| [20260502-image-text-replication-parallel-and-xhs-html-plan.md](./20260502-image-text-replication-parallel-and-xhs-html-plan.md) | 图文复刻并行识别+顺序稳定、标准化MD入库、小红书卡片HTML渲染与二创基底强化 |
| [20260502-miniapp-image-text-replication-workflow-plan.md](./20260502-miniapp-image-text-replication-workflow-plan.md) | 小程序图文同款链路升级：我的分类沉淀、后台解析、一键仿写与卡片流程衔接 |
| [20260502-miniapp-hot-square-data-center-plan.md](./20260502-miniapp-hot-square-data-center-plan.md) | 小程序爆款数据中心：我的分类个人数据 + 后台分类配置与小红书搜索采集 |
| [20260502-miniapp-hot-square-xhs-collect-plan.md](./20260502-miniapp-hot-square-xhs-collect-plan.md) | 小程序爆款广场新增右下角采集入口：粘贴小红书链接并沉淀到“我的”分类 |
| [20260503-auth-unified-login-provision-plan.md](./20260503-auth-unified-login-provision-plan.md) | 统一 Web/小程序登录完成器：三端登录后自动建号、绑定身份并强制真实积分开户 |
| [20260503-miniapp-card-cover-config-plan.md](./20260503-miniapp-card-cover-config-plan.md) | 小程序图文卡片封面配置补齐：封面配置、预览与导出一致性 |
| [20260504-miniapp-hot-detail-favorite-and-parse-plan.md](./20260504-miniapp-hot-detail-favorite-and-parse-plan.md) | 小程序爆款详情收藏、解析态与详情页展示修复计划 |
| [20260504-miniapp-library-header-card-fit-plan.md](./20260504-miniapp-library-header-card-fit-plan.md) | 小程序素材库头部与卡片适配：对齐标准页并修复角色卡片溢出 |
| [20260504-miniapp-hot-video-collect-remix-plan.md](./20260504-miniapp-hot-video-collect-remix-plan.md) | 小程序爆款视频采集与复刻链路：提取文案、下载视频、选择复刻类型并预填参考视频 |
