# Content Factory Web (AtomX)

An AI-powered content generation platform built with **Next.js 15**, **TypeScript**, **Prisma**, and **Supabase**. This application integrates advanced AI workflows (via n8n) to provide services like script generation, digital human creation, and video content replication.

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

Detailed documentation for specific systems:

- [Credit System Integration](docs/CREDIT_SYSTEM.md): API reference and integration details.
- [Workflow Reference](docs/WORKFLOWS.md): List of n8n workflows and webhooks.
- [Database Schema](docs/DATABASE.md): Prisma schema and Supabase configuration.
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
├── prisma/               # Database schema and migrations
├── public/               # Static assets
└── .trae/                # Project documentation and specifications
```

## 🔧 Utility Scripts

The project root contains several utility scripts (`fix_*.js`, `test-*.ts`) for maintenance and troubleshooting:

- `fix_connections.js`: Utilities to diagnose and fix database connection issues.
- `fix_n8n_ssl.js`: Handles SSL certificate fixes for n8n integration.
- `check-tables.ts`: Verifies database table structure.
- `test-tunnel.js`: (Legacy) Tests the SSH tunnel connectivity.

To run these scripts, use `node` or `ts-node`:

```bash
node fix_network.js
# or
npx tsx check-tables.ts
```

## 🤝 Contributing

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add some amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

## 📄 License

[MIT](LICENSE)
