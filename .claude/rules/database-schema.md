---
description: 数据库 Schema 与 Prisma 迁移操作规范
paths: "prisma/**"
---

# 数据库操作规范（高风险区）

## 核心约束
- **`prisma/schema.prisma` 和 `prisma/schema.public.prisma` 是红线文件**
- 未经用户明确授权，禁止添加、删除或重命名任何 Model 字段
- 禁止删除已有 Model，可标记废弃但保留结构

## 迁移流程
1. 修改 Schema 前，先向用户说明改动意图和影响范围
2. 用户确认后执行：`npx prisma migrate dev --name <描述>`
3. 迁移文件自动生成在 `prisma/migrations/`，提交到 Git
4. 生产部署时执行：`npx prisma migrate deploy`（不可用 `migrate dev`）

## 双 Schema 说明
- `schema.prisma`：本地 SQLite（开发环境）
- `schema.public.prisma`：Supabase PostgreSQL（生产环境）
- 两份 Schema 结构必须保持同步，改动时需同步更新
