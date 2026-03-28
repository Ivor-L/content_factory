# Content Factory Web — Claude 工作手册

## 构建与测试命令

```bash
npm run dev          # 开发服务器（Webpack，推荐，兼容性最好）
npm run dev:turbo    # 开发服务器（Turbopack，更快但可能有兼容问题）
npm run build        # 生产构建（自动执行 prisma generate）
npm run lint         # ESLint 全项目检查
npm run lint:app     # 仅检查 app/components/lib/hooks
npm run typecheck    # TypeScript 类型检查（不编译）
npx prisma studio    # 可视化数据库管理
npx prisma migrate dev  # 执行数据库迁移（需明确告知用户）
```

> `prebuild` / `predev` 会自动运行 `prisma generate`，无需手动执行。

---

## 目录架构指南

```
app/
├── (auth)/              # 登录 / 注册页面
├── (admin)/             # 后台管理页面
├── (main)/              # 核心业务页面（Canvas、数字人、内容工厂等）
│   └── canvas/hooks/    # Canvas AI 模型选择与编排逻辑
├── (site)/              # 对外展示/落地页
└── api/                 # Next.js API 路由
    ├── digital-human/   # 数字人视频生成（提交 + Webhook 回调）
    ├── knowledge-videos/# 知识视频队列
    ├── replication/     # 视频/图文复刻
    ├── viral-creators/  # 爆款创作者数据
    ├── image-text-replication/ # 图文复刻
    └── ai/videos/       # AI 视频生成（Veo/Sora/Grok）
        └── generations/ # 提交生成任务，注册轮询服务

components/              # 可复用 UI 组件（PascalCase 命名）
lib/                     # 核心业务逻辑层
├── n8n.ts               # n8n Webhook 调用封装
├── digitalHumanJob.ts   # 数字人任务调度
├── knowledgeVideos.ts   # 知识视频业务逻辑
├── knowledgeVideoQueue.ts # 视频队列管理
├── cloudLLM.ts          # LLM 调用封装（云雾API）
├── cloudImage.ts        # 图片生成封装（含 nano-banana-pro）
├── canvasCredits.ts     # Canvas 积分计费（含模型别名映射）
└── viralReferenceMedia.ts # 爆款媒体数据处理

prisma/                  # 数据库 Schema ⚠️ 禁止随意修改
workflows/               # n8n 工作流 JSON 配置 ⚠️ 禁止覆盖
workers/                 # 后台异步任务 Worker
scripts/                 # 构建脚本（不影响业务逻辑）
hooks/                   # React 自定义 Hooks
docs/                    # API 文档（云雾API Apifox 文件）
```

---

## 技术栈与代码规范

**语言与框架**
- TypeScript 严格模式，禁止 `any`，特殊情况需注释说明
- Next.js App Router，API 路由统一使用 `route.ts`
- Tailwind CSS，禁止内联 `style`，禁止引入额外 CSS 模块
- React 函数组件，Props 必须定义 TypeScript 接口

**命名规范**
- 组件文件：PascalCase（`DigitalHumanModal.tsx`）
- 工具函数/API 文件：camelCase（`digitalHumanJob.ts`）
- API 路由目录：kebab-case（`digital-human/`）

**数据库**
- ORM 统一使用 Prisma，禁止拼接裸 SQL 字符串
- 本地开发：SQLite（better-sqlite3），生产：PostgreSQL（Supabase）

**外部 API**
- LLM/图片/视频生成：统一走 **云雾API**（base URL 从环境变量读取）
- 视频异步任务：提交后调用轮询服务 `https://api.atomx.top/tools/veo/poll/async`
  注册参数：`task_id`、`api_key`、`webhook_url`、`context`
  兼容模型：Veo、Sora、Grok
- n8n 工作流：通过 `lib/n8n.ts` 封装调用，禁止在路由层直接 fetch n8n Webhook

**AI 模型当前版本（重要）**
- `nano-banana-pro` 映射至 `gemini-3.1-pro-preview`（原 `gemini-3-pro-preview` 已于 2026-03-26 下线）
- 模型别名映射位置：`lib/canvasCredits.ts` 和 `app/api/canvas/images/generations/route.ts`

---

## 禁止操作（红线规则）

1. **禁止修改 `.env` / `.env.local`** — 环境变量由部署环境注入，不得硬编码密钥
2. **禁止修改 `prisma/schema.prisma` 和 `prisma/schema.public.prisma`** — Schema 变更需人工 review 并手动执行迁移
3. **禁止删除或覆盖 `workflows/` 根目录下的 n8n JSON 文件** — 这些是生产工作流配置；`workflows/exports/` 是备份，可参考
4. **禁止修改 `docker-compose.yml` 和 `nginx.conf`** — 基础设施配置，变更需明确告知
5. **禁止在 `next.config.ts` 中放宽安全配置** — 不得关闭 TypeScript ignoreBuildErrors 以外的类型检查
6. **禁止升级 Prisma 主版本** — 当前 `^7.x`，跨主版本升级可能破坏 adapter 兼容性

---

## 关键业务模块速查

| 功能 | API 路由 | 核心逻辑文件 |
|------|----------|-------------|
| 数字人视频生成 | `app/api/digital-human/` | `lib/digitalHumanJob.ts` |
| 知识视频队列 | `app/api/knowledge-videos/` | `lib/knowledgeVideos.ts` |
| Veo/Sora 视频生成 | `app/api/ai/videos/` | 注册轮询 → `api.atomx.top` |
| n8n 工作流触发 | 各 API 路由 | `lib/n8n.ts` |
| 爆款内容复刻 | `app/api/replication/` | `lib/viralReferenceMedia.ts` |
| Canvas 图片生成 | `app/api/canvas/images/` | `lib/cloudImage.ts` |
| Canvas 模型配置 | `app/(main)/canvas/hooks/` | `useCanvasModels.ts` |
| 用户认证 | `app/(auth)/` | `lib/authServer.ts` |
| 积分计费 | — | `lib/canvasCredits.ts` |
