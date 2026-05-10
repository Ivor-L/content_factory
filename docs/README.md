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
| [web-scale-runbook.md](./03-deployment/web-scale-runbook.md) | Web 多副本扩容 Runbook：Docker Compose + Nginx 负载均衡、压测复验与回滚 |
| [20260506-nextide-agent-runtime-deploy-checklist.md](./20260506-nextide-agent-runtime-deploy-checklist.md) | NexTide Agent Runtime 部署安全清单：迁移、鉴权、积分、回调与产物导出检查 |

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
| [miniapp-viral-breakdown-workflow.md](./05-n8n/miniapp-viral-breakdown-workflow.md) | 小程序首页爆款拆解工作流：ffmpeg 分镜网格、OSS 上传、中文结构与复刻提示词 |

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
| [20260506-online-load-test-plan.md](./07-testing/20260506-online-load-test-plan.md) | 线上压力测试执行计划：范围、阶段、指标、终止条件与交付物；脚本见 `tests/load/` |
| [20260506-online-load-test-runbook.md](./07-testing/20260506-online-load-test-runbook.md) | 2026-05-07 线上压测 Runbook：2 小时窗口、100 并发、预算与执行命令 |
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
| [20260504-miniapp-xhs-collect-web-sync-plan.md](./20260504-miniapp-xhs-collect-web-sync-plan.md) | 小程序小红书采集同步 Web 爆款内容：复用 viral references 数据源并隔离个人 sourceId |
| [20260504-miniapp-xhs-image-ocr-retry-plan.md](./20260504-miniapp-xhs-image-ocr-retry-plan.md) | 小程序小红书图文单张 OCR 失败项点击重试计划 |
| [20260504-miniapp-ai-image-work-status-plan.md](./20260504-miniapp-ai-image-work-status-plan.md) | 小程序 AI 作图生成状态提示、后台任务与作品沉淀计划 |
| [20260505-miniapp-ai-image-workflow-cleanup-plan.md](./20260505-miniapp-ai-image-workflow-cleanup-plan.md) | 小程序 AI 作图 n8n 工作流通用化：移除内置 prompt 尾缀并改由前端参数控制 |
| [20260504-miniapp-one-click-remix-stage-plan.md](./20260504-miniapp-one-click-remix-stage-plan.md) | 小程序一键复刻入口合并、上传预览与三阶段详情页计划 |
| [20260504-miniapp-referral-and-points-api-plan.md](./20260504-miniapp-referral-and-points-api-plan.md) | 小程序分享赚钱与算力消耗接口补齐计划 |
| [20260504-miniapp-product-analysis-plan.md](./20260504-miniapp-product-analysis-plan.md) | 小程序产品上传分析与产品库结果查看计划 |
| [20260505-miniapp-product-detail-edit-delete-plan.md](./20260505-miniapp-product-detail-edit-delete-plan.md) | 小程序产品详情页、编辑删除与上传图片竖构图 |
| [20260505-miniapp-skeleton-storyboard-reference-duration-plan.md](./20260505-miniapp-skeleton-storyboard-reference-duration-plan.md) | 小程序 3D 骨骼分镜角色引用、时长、语言与生成中占位修复 |
| [20260505-miniapp-remix-subject-replace-plan.md](./20260505-miniapp-remix-subject-replace-plan.md) | 小程序智能复刻第二阶段主体替换、图片编辑与生图工作流适配 |
| [20260506-miniapp-remix-video-generation-page-plan.md](./20260506-miniapp-remix-video-generation-page-plan.md) | 小程序智能复刻视频生成页拆分：网格图替换回写、复刻底栏收敛与独立片段视频生成 |
| [20260506-miniapp-referrals-records-points-fix-plan.md](./20260506-miniapp-referrals-records-points-fix-plan.md) | 小程序分享有礼接口、记录页性能与算力记录名称优化 |
| [20260506-nextide-skills-runtime-plan.md](./20260506-nextide-skills-runtime-plan.md) | NexTide Skills Runtime：将 SaaS、小程序、n8n 与闭源内容生产能力抽象为 Agent skills 的计划书 |
| [20260506-nextide-skills-runtime-delivery.md](./20260506-nextide-skills-runtime-delivery.md) | NexTide Skills Runtime MVP 交付说明：已接入 capability、CLI、skills、调用示例与限制 |
| [20260506-nextide-agent-runtime-release-notes.md](./20260506-nextide-agent-runtime-release-notes.md) | NexTide Agent Runtime Phase 2 发布说明：能力、安全、积分、CLI、Skills、部署与后续计划 |
| [20260507-nextide-skills-runtime-phase2-plan.md](./20260507-nextide-skills-runtime-phase2-plan.md) | NexTide Skills Runtime Phase 2：Agent Run Store、长任务状态闭环与后续产品化计划 |
| [20260506-nextide-skills-runtime-next-dev-plan.md](./20260506-nextide-skills-runtime-next-dev-plan.md) | NexTide Skills Runtime 新开发计划与当前进度：合并 ClipcatSkill 学习、线上更新、积分流水单表、TikTok Commerce Surface 与 Sprint 计划 |
| [20260506-online-load-test-performance-fix-plan.md](./20260506-online-load-test-performance-fix-plan.md) | 线上压测后性能修复计划：任务列表纯读化、索引补齐与复验标准 |
| [20260508-miniapp-remix-video-credit-confirm-plan.md](./20260508-miniapp-remix-video-credit-confirm-plan.md) | 小程序智能复刻第三阶段生视频积分确认、生成中状态持久展示计划 |
| [20260509-miniapp-smart-copy-entry-plan.md](./20260509-miniapp-smart-copy-entry-plan.md) | 小程序智能文案入口：隐藏变现广场入口并复用 Web 智能创作链路 |
| [20260509-miniapp-note-rewrite-result-page-plan.md](./20260509-miniapp-note-rewrite-result-page-plan.md) | 小程序图文笔记仿写结果页：独立页面、生成图片回流与二维码图片展示 |
| [20260511-miniapp-hot-rewrite-result-generation-state-plan.md](./20260511-miniapp-hot-rewrite-result-generation-state-plan.md) | 小程序爆款图文仿写结果页生成状态优化：图片区分原文案/仿写文案、生成状态回流与按钮语义统一 |
| [20260511-miniapp-generation-submit-layout-plan.md](./20260511-miniapp-generation-submit-layout-plan.md) | 小程序数字人、图片生成、视频生成提交按钮底部吸附与文案输入面板布局调整 |
| [20260509-miniapp-infographic-direct-n8n-and-credits-fix-plan.md](./20260509-miniapp-infographic-direct-n8n-and-credits-fix-plan.md) | 小程序信息图直连 n8n、作品多图展示与积分 0 元配置兜底修复 |
| [20260509-my-works-creative-import-knowledge-plan.md](./20260509-my-works-creative-import-knowledge-plan.md) | Web 我的作品智能创作详情：推荐标题与正文导入知识库 |
| [20260510-miniapp-skeleton-story-branch-plan.md](./20260510-miniapp-skeleton-story-branch-plan.md) | 小程序 3D 骨骼剧情/带货分支升级：显式类型选择、剧情字段与 n8n 纯剧情 prompt |
| [20260510-miniapp-storyboard-auto-edit-plan.md](./20260510-miniapp-storyboard-auto-edit-plan.md) | 小程序智能复刻与 3D 骨骼分镜板一键剪辑配置：音色、字幕、BGM 与积分接入 |
| [20260510-miniapp-hot-video-copy-actions-plan.md](./20260510-miniapp-hot-video-copy-actions-plan.md) | 小程序爆款视频口播动作：文案复制、一键二创、数字人视频与视频采集展示修复 |
| [20260510-miniapp-remix-video-detail-and-stage-nav-plan.md](./20260510-miniapp-remix-video-detail-and-stage-nav-plan.md) | 小程序智能复刻第三阶段视频详情、重生成配置与阶段导航计划 |
| [20260504-character-library-view-edit-delete-plan.md](./20260504-character-library-view-edit-delete-plan.md) | Web 角色库查看/编辑/删除与创建表单交互优化计划 |
| [20260504-style-library-image-performance-plan.md](./20260504-style-library-image-performance-plan.md) | 风格库图片加载性能优化：缩略图生成、列表优先加载与懒加载 |
| [20260504-xhs-markdown-table-render-plan.md](./20260504-xhs-markdown-table-render-plan.md) | 小红书卡片 Markdown 表格渲染：Web/小程序预览、后端导出与 AI 排版对齐 |
| [20260504-xhs-rewrite-prompt-unification-plan.md](./20260504-xhs-rewrite-prompt-unification-plan.md) | 小红书一键仿写 Prompt 统一：Web/小程序共用标题公式、正文改写与 Gemini generateContent 模型 |
| [20260504-miniapp-remix-upload-optimization-plan.md](./20260504-miniapp-remix-upload-optimization-plan.md) | 小程序爆款复刻视频上传优化：OSS 表单直传、进度显示与服务端上传兜底 |
| [20260504-miniapp-infographic-text-and-swiper-plan.md](./20260504-miniapp-infographic-text-and-swiper-plan.md) | 小程序信息图正文入参与多图滑动页码展示修复 |
