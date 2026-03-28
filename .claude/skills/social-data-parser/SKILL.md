---
name: social-data-parser
description: 当用户要求解析、清洗外部平台（如小红书等社交媒体）的 API 返回数据，提取标题、图片及互动指标，或处理 viral-references/replication 相关数据结构时触发
allowed-tools: Read, Edit, Write, Grep, Glob
---

# 社交媒体数据清洗技能包

## 项目相关模块

- 爆款媒体数据：`lib/viralReferenceMedia.ts`
- 爆款创作者 API：`app/api/viral-creators/`
- 爆款参考 API：`app/api/viral-references/`
- 图文复刻 API：`app/api/image-text-replication/`
- 内容复刻 API：`app/api/replication/`

---

## 标准执行步骤

### 解析社交平台数据

1. **确认数据来源**：通过云雾 API 获取的平台数据，原始响应结构在 `docs/` 目录中查阅
2. **读取现有解析逻辑**：先阅读 `lib/viralReferenceMedia.ts` 了解当前字段映射
3. **提取核心字段**：
   - 标题：`title` / `desc` / `note_card.title`（各平台字段名不同）
   - 封面图：优先取 CDN URL，注意部分平台返回加密 URL 需二次处理
   - 互动指标：点赞（`liked_count`）、收藏（`collected_count`）、评论（`comment_count`）
   - 作者信息：`author.nickname`、`author.avatar`
4. **标准化输出结构**：统一转换为项目内部数据模型（参考 Prisma Schema 中的对应 Model）
5. **写入数据库**：通过 Prisma Client 存储，注意 upsert 避免重复

### 新增平台数据源

1. 在 `lib/viralReferenceMedia.ts` 中新增平台的解析函数
2. 在对应 API 路由中调用解析函数，不在路由层直接处理原始数据
3. 添加 zod Schema 校验原始数据结构，防止平台 API 变更导致崩溃

---

## 踩坑记录

> 持续更新，遇到新坑在此补充

- **图片 URL 有效期**：部分平台（如小红书）的图片 URL 有时效性，需在获取后尽快转存到 Supabase Storage，不要直接存原始 URL 入库。
- **数字格式问题**：互动数据可能返回字符串（`"1.2万"`），需在清洗时转换为数字。
- **字段缺失处理**：部分内容（如无封面的纯文字帖）某些字段为 `null`，解析时加默认值，不要 `?.` 链式调用后直接存 `undefined`。
- **分页数据合并**：批量抓取时注意去重（以平台原始 `id` 为唯一键），避免同一内容多次写入。

---

## 参考文件

- 云雾 API 文档：`docs/云雾API 接口对接3.17 .apifox.json`
- 数据模型：`prisma/schema.prisma`（查找 ViralReference / Creator 相关 Model）
