# Content Factory Web (AtomX)

An AI-powered content generation platform built with **Next.js (App Router)**, **TypeScript**, **Prisma**, and **Supabase**. This application integrates advanced AI workflows (via n8n) to provide services like script generation, digital human creation, and video content replication.

## 🚀 Features

- **AI Content Generation**: Automated workflows for generating scripts, storyboards, and video content.
- **Digital Human Integration**: Create and manage digital avatars for video production.
- **Multi-Model Support**: Integration with leading AI models (Gemini, Kling, Sora, etc.) showcased via ModelTicker.
- **Global Reach**: Native multi-language support (English/Chinese) with auto-detection.
- **Modern UI/UX**:
  - Responsive design using **Tailwind CSS**.
  - Smooth animations with **Framer Motion**.
  - Dark/Light mode support via **next-themes**.
- **Robust Backend**:
  - **Supabase** for authentication and storage.
  - **Prisma ORM** for type-safe database access (PostgreSQL).
  - **n8n** integration for complex automation workflows.

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: PostgreSQL (via Supabase), SQLite (for local dev/testing)
- **ORM**: [Prisma](https://www.prisma.io/) (with driver adapters)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/), clsx, tailwind-merge
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animation**: [Framer Motion](https://www.framer.com/motion/)
- **Automation**: n8n Workflows

## 📚 Documentation

Start here:

- [Docs Index](docs/README.md)

Detailed documentation for specific systems:

- [Credit System Integration](docs/CREDIT_SYSTEM.md): API reference and integration details.
- [Workflow Reference](docs/WORKFLOWS.md): List of n8n workflows and webhooks.
- [Database Schema](docs/DATABASE.md): Prisma schema and Supabase configuration.
- [Environment & Secrets](docs/ENV_AND_SECRETS.md): Local env, Vibe credentials, and security notes.
- [Deployment Guide](DEPLOY.md): Deployment instructions.
- [Environment Configuration](ENV_CONFIG.md): Environment variable setup.

## 📦 Prerequisites

- **Node.js**: Latest LTS version recommended.
- **npm** or **yarn**: Package manager.
- **Supabase Account**: For database and authentication services.

## ⚡ Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd content-factory-web
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment Configuration

Refer to `ENV_CONFIG.md` for a detailed list of required environment variables. Create a `.env` file in the root directory:

```bash
cp .env.example .env  # If .env.example exists, otherwise create manually
```

Key variables include:
- `DATABASE_URL`: Connection string for the PostgreSQL database (e.g., `postgres://user:pass@host:5432/dbname`).
- `DIRECT_URL`: Direct connection string for migrations (required if using a connection pooler).
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous API key.

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📂 Project Structure

```
content-factory-web/
├── app/                  # Next.js App Router directory
│   ├── (auth)/           # Authentication routes (login, register)
│   ├── (main)/           # Core application routes (dashboard, generation, etc.)
│   ├── (site)/           # Marketing/Landing page routes
│   ├── actions/          # Server Actions for form handling & data mutation
│   ├── api/              # REST API endpoints
│   └── globals.css       # Global styles
├── components/           # Reusable UI components
├── lib/                  # Utility functions and library configurations (Prisma, Supabase)
├── docs/                 # Long-term developer documentation
├── prisma/               # Database schema and migrations
├── scripts/maintenance/  # Maintenance & troubleshooting scripts (local tools)
├── workflows/            # n8n workflow exports (reference & debugging)
├── public/               # Static assets
└── .trae/                # Project documentation and specifications
```

## 🔧 Utility Scripts

Maintenance and troubleshooting scripts are located in `scripts/maintenance/` (not in the project root).
These scripts usually read local credentials from `.vibe/credentials.env` (ignored by git).

To run these scripts, use `node` or `ts-node`:

```bash
npx node scripts/maintenance/fix_network.js
# or
npx tsx scripts/maintenance/verify-db.ts
```

## 🧵 Asset Processing Worker

Asset uploads（历史文案、案例故事、视觉风格）会进入 pg-boss 队列，由独立 worker 调用云雾 API 完成解析。

1. 配置 `.env.local` / `.env.production`：
   - `CLOUD_API_KEY`、`CLOUD_API_BASE_URL`
   - 可选：`CLOUD_DEFAULT_MODEL`、`CLOUD_HISTORY_MODEL`、`CLOUD_STORY_MODEL`、`CLOUD_STYLE_MODEL`
   - 若需要独立队列库：`QUEUE_DATABASE_URL`（默认沿用 `DATABASE_URL`）
2. 保证数据库 & Supabase Storage 可访问后启动 worker：

```bash
npm run workers:assets
```

队列名称：

- `assets.history.process`
- `assets.stories.process`
- `assets.styles.process`

worker 会把 Yunwu 的结构化结果写回 `history_docs` / `story_assets` / `style_presets`，并把解析文件存入 Supabase Storage 方便审计。

## ✍️ Content Creation Flow

「内容创作」入口已集中在首页 Dashboard（需要租户开启 `contentCreation` 功能），并统一写回「我的项目」。使用步骤：

1. 在资产库上传历史文案、案例、风格，并等待解析 worker 完成处理。
2. 打开 `/dashboard`，在「智能创作」入口点击 **立即创建**，录入创意背景/渠道/目标字数，即可生成任务（默认进入「诊断」阶段）。
3. 任务创建后会自动跳转至 `/my-works?taskId=...`，在「我的项目」弹窗内查看阶段进度、下载图文结果或删除任务。
4. 每个阶段仍可：
   - 点击 **AI 生成**，由 Yunwu API 自动输出结构化结果；
   - 在「阶段记录」里补充人工笔记，并保存；
   - 关联/移除历史文案、案例、风格，以影响后续提示词。
5. 流程会根据诊断结果自动选择路线（观点清晰时跳过挖掘/选题）。最终在「内容产出」阶段生成完整 Markdown 文稿，可直接复制到发布渠道。

相关 API：

- `GET/POST /api/creative-tasks`：创建/列出任务
- `GET/PATCH/DELETE /api/creative-tasks/:id`：读取或修改任务
- `POST /api/creative-tasks/:id/generate`：按阶段触发 Yunwu 生成
- `POST /api/creative-tasks/:id/stage`：人工保存阶段记录
- `POST/DELETE /api/creative-tasks/:id/assets`：关联或移除素材
- `GET /api/voice-profiles`：查看/创建口吻画像

## ♻️ Project Retention & Cleanup

- 「我的项目」中的创作任务会基于 `updatedAt` 自动保留 **5 天**，到期后后台会清除任务本身及其阶段记录，释放数据库与对象存储空间。
- 保留天数可通过环境变量 `CREATIVE_TASK_RETENTION_HOURS` 调整（默认 120 小时 / 5 天）。
- 部署时请将一个受信任的定时器（如 Vercel Cron、Supabase Scheduler、n8n）指向新建的内部接口：

  ```http
  POST /api/internal/cleanup/creative-tasks
  x-admin-token: <ADMIN_TOKEN>
  Content-Type: application/json

  {
    "retentionHours": 120,
    "limit": 200,
    "dryRun": false
  }
  ```

  - `x-admin-token` 必须等于 `ADMIN_TOKEN`，避免被公开访问。
  - 忽略 body 或设置 `dryRun: true` 可做试跑；`GET` 请求默认等价于 dry-run，并支持 `?hours=120&limit=50` 这样的查询参数。
  - 接口返回会携带被扫描/删除的任务 ID，可写入日志或告警系统。

## 🤝 Contributing

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add some amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

## 📄 License

[MIT](LICENSE)
