# 数据库文档 (Database Documentation)

本文档描述了 Content Factory Web 应用程序的数据库架构、Prisma 模型和 Supabase 集成。

## ⚠️ 重要说明：表名约定与双重表结构

由于历史原因和权限限制，数据库中存在两套表结构。请务必遵循以下约定：

### 1. 当前生效表 (Active Tables)
应用程序目前**仅使用**以下小写表名。所有新的开发和数据操作都应针对这些表：

| Prisma Model | 数据库表名 (Table Name) | 说明 |
| :--- | :--- | :--- |
| `Product` | **`products`** | 产品核心信息 |
| `Script` | **`scripts`** | 视频脚本 |
| `Character` | **`characters`** | 数字人角色 |
| `Replication` | **`replications`** | 复刻任务状态 |
| `StoryboardTask` | **`storyboard_tasks`** | 故事板任务 |
| `StoryboardSegment` | **`storyboard_segments`** | 故事板分镜 |
| `DigitalHumanVideo` | **`digital_human_videos`** | 数字人视频 |

### 2. 遗留表 (Legacy/Locked Tables) - 已清理
数据库中曾经存在以下 PascalCase 命名的表，这些表已被弃用。为了避免混淆，建议在数据库管理平台（如 Supabase Dashboard）中手动删除它们（如果它们还存在的话）。Prisma Schema 中已移除对这些表的引用。

*   `Product`
*   `Script`
*   `Character`
*   `Replication`
*   `StoryboardTask`
*   `StoryboardSegment`

**注意**: 这些表可能由 Supabase 仪表板或其他工具创建。我们已创建了新的小写复数形式的表（如 `products`）来接管业务逻辑。

---

## 概述

应用程序使用 **PostgreSQL** 作为主要数据库，并利用 **Prisma ORM** 进行数据访问和模式管理。用户身份验证和部分用户数据由 **Supabase** 管理。

## 关键文件

- Prisma 客户端初始化： [prisma.ts](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/lib/prisma.ts)
- Prisma 模型权威来源： [schema.prisma](file:///Users/kaka/Desktop/软件开发/content-factory-web%203/prisma/schema.prisma)
- Supabase SQL 迁移：`supabase/migrations/*`

## 技术栈

- **数据库**: PostgreSQL
- **ORM**: Prisma (使用 `prisma-client-js` 和 `@prisma/adapter-pg`)
- **驱动**: `pg` (PostgreSQL 驱动)
- **认证**: Supabase Auth

## 连接配置

### Prisma Client (`lib/prisma.ts`)
- 使用 `PrismaPg` 适配器。
- 配置了 `Pool` 连接池，显式禁用了 SSL (`ssl: false`)，这通常是为了通过 SSH 隧道连接到远程数据库（此时隧道充当本地非 SSL 连接）。
- `DATABASE_URL` 环境变量用于指定连接字符串。

### Supabase Client (`lib/supabase.ts`)
- 初始化 Supabase 客户端以处理 Auth 和直接数据库查询（如 `profiles` 表）。
- 使用 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。

## Prisma Schema 模型详情

以下模型均映射到小写表名（参见上文“当前生效表”）。

### 核心业务模型

#### 1. Product (产品) -> `products`
存储产品的核心信息和卖点。
- `sellingPoints`: 存储完整卖点的 JSON 字符串。
- `sellingPointsText`: 卖点的纯文本摘要。
- `images`: 存储图片 URL 数组的 JSON 字符串。
- `analysisResult`: (遗留) 完整分析结果 JSON。
- `status`: 状态 (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`)。
- `progress`: 进度 (0-100)。

#### 2. Script (脚本) -> `scripts`
存储生成的视频脚本。
- `breakdown`: 脚本分镜的 JSON 字符串。
- `videoUrl`: 关联的原始视频 URL。

#### 3. Character (角色/数字人) -> `characters`
存储数字人角色的配置。
- `avatar`: 角色头像 URL。
- `voiceId`: 声音 ID 或 URL。

#### 4. Replication (复刻任务) -> `replications`
记录内容复刻的任务状态和结果。
- `type`: 任务类型 (`FULL`, `SELLING_POINTS`, `SCRIPT`)。
- `status`: 任务状态。
- `result`: 结果数据的 JSON 字符串。
- 关联: `Product`, `Script`。

### 故事板与生成模型

#### 5. StoryboardTask (故事板任务) -> `storyboard_tasks`
管理故事板生成的整个流程。
- `status`: 任务状态 (`ANALYZING`, `SCENE_CONFIRMATION`, `GENERATING`, `COMPLETED`, `FAILED`)。
- `videoUrl`: 上传的病毒视频 URL。
- `coverImage`: 视频封面图。
- 关联: `Product`, `Character`。
- 包含多个 `StoryboardSegment`。

#### 6. StoryboardSegment (故事板分镜) -> `storyboard_segments`
故事板中的单个场景片段。
- `order`: 顺序。
- `duration`: 持续时间。
- `imagePrompt`, `videoPrompt`: 生成提示词。
- `generatedImage`, `generatedVideo`: 生成结果 URL。
- `status`: 分镜生成状态。

#### 7. DigitalHumanVideo (数字人视频) -> `digital_human_videos`
生成的数字人视频记录。
- `type`: 类型 (`LIP_SYNC`, `VOICE_CLONE`)。
- `imageUrl`: 原始图片。
- `audioUrl`: 原始音频。
- `resultUrl`: 生成结果 URL。
- `status`: 生成状态。

## Supabase 集成

### Profiles 表 -> `profiles`
- **用途**: 存储用户特定的配置，特别是 `api_key`。
- **查询**: 通过 Supabase Client 直接查询 (`supabase.from('profiles').select('api_key')`)。
- **关联**: 通过 `id` 字段与 Supabase Auth 的 `user.id` 关联。

## 数据流与关系

1.  **用户认证**: 用户登录 -> Supabase Auth -> 获取 Token。
2.  **API 访问**: 后端验证 Token -> 查询 `profiles` 表获取 `api_key` -> 调用外部服务。
3.  **内容生成**:
    - 用户创建 `Product` -> 生成 `Script` -> 创建 `StoryboardTask` -> 生成 `StoryboardSegment` -> 最终合成视频。
    - `Replication` 用于记录整个流程的状态。

## 环境变量

- `DATABASE_URL`: PostgreSQL 连接字符串。
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase URL。
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anon Key。

## 迁移与变更流程（推荐）

本项目同时存在 Prisma schema 与 Supabase SQL migrations：

- Prisma：用于类型与模型约束（应用侧读写以 Prisma 为准）
- Supabase migrations：用于在实际数据库中增量创建/修改表、开启 RLS、补充字段等

建议后续开发遵循：

1) 先在 `prisma/schema.prisma` 里定义/修改模型
2) 再在 `supabase/migrations/` 增加对应 SQL 迁移（尤其是新增列、索引、RLS policy）
3) 确保 n8n 工作流里涉及写库的字段名与表名一致（参见 [WORKFLOWS.md](WORKFLOWS.md)）

## 历史文案运行时对象（Creative Runtime）

为支持“精准召回 + 最小注入”，历史文案现在需要写入结构化的运行时对象表：

| 表 / 字段 | 作用 |
| --- | --- |
| `history_doc_derivatives` | 保存 style_summary / writing_blocks / case_bank / applicability JSON 以及对应的对象存储路径 |
| `history_docs.latest_derivative_id` | 指向最新一次成功归一化的 derivative |

### 必须执行的步骤

1. **运行 SQL 迁移**：`supabase/migrations/20260317095500_add_history_doc_derivatives.sql`（创建 `history_doc_derivatives` + 外键）。在 Supabase CLI 或 `psql` 上执行：  
   ```bash
   supabase db push   # 如果使用 supabase cli  
   # 或者
   psql "$DATABASE_URL" -f supabase/migrations/20260317095500_add_history_doc_derivatives.sql
   ```
2. **同步 Prisma**：迁移完成后运行  
   ```bash
   npx prisma generate
   ```  
   同步新的模型/类型，避免 CI 构建失败。
3. **回填历史文案**：旧的 `history_docs` 需要重新跑资产 Worker（`npm run workers:assets` 或在 PG Boss 中重新投递 `historyDoc` job），以生成 `history_doc_derivatives` 记录并写入 `latest_derivative_id`。

完成以上步骤后，创作流水线才会读取新表中的运行时对象，Stage 03/04 才能稳定使用“最小注入”策略。
