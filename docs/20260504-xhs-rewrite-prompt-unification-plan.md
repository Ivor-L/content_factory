# 小红书一键仿写 Prompt 统一计划

## 目标

- Web 端与小程序端的一键仿写统一使用同一套标题、正文、图片文案生成规则。
- 标题统一使用 75 个小红书标题公式，不再出现 Web 与小程序标题风格不一致。
- 仿写模型统一切换到 Gemini `generateContent` 接口：
  `/v1beta/models/gemini-3.1-flash-lite-preview:generateContent`。

## 范围

- 后端共享仿写 prompt 与响应解析。
- 小程序现有 `/api/image-text-replication/[id]/rewrite` 保持入口不变。
- Web 图文复刻在触发 n8n 生图前先执行同一套仿写，使用仿写后的标题和正文进入视觉生成。
- Markdown 卡片弹窗的“AI生成标题正文”同步复用统一仿写模型与标题公式规则。

## 最小调研结论

### 方案 A：只复制小程序 prompt 到 Web

- 优点：改动较小。
- 缺点：两份 prompt 后续容易再次漂移；模型切换、JSON 解析和兜底逻辑重复。
- 结论：不采用。

### 方案 B：抽出共享仿写服务

- 优点：小程序和 Web 共用同一 prompt builder、模型调用、JSON schema 和兜底逻辑。
- 缺点：Web 生成链路需要多一次 LLM 调用。
- 结论：采用。文案仿写先统一，视觉生成继续由原图文复刻工作流负责。

## 兼容性

- Next.js：新增纯服务端 `lib` 模块，可被 API Route 复用。
- Prisma：不新增字段，不涉及迁移。
- Supabase：不涉及存储结构变更。
- n8n：Web 仍按原字段触发，只是 `title/text` 改为仿写后的内容。
- 小程序：保留现有 API 路径和返回结构，不需要前端换接口。

## 风险

- Gemini `generateContent` 返回结构与 OpenAI Chat Completions 不同，需要兼容 `candidates[].content.parts[].text`。
- Web 生成链路新增仿写调用，失败时应返回明确错误，不触发后续扣费后的错误链路扩散。
- Markdown meta 的标题长度原本是 12-28 字，统一标题公式后会改为小红书标题公式优先，长度由后处理裁剪兜底。

## 回滚

- Web 可回滚为直接使用 `sourceTitle/sourceText` 触发 `/generate`。
- 小程序可将 `/rewrite` 回退为原 `callRewriteModel` 内联 prompt。
- Markdown meta 可回退为原 `/api/xhs-layout/meta` system/user prompt。

## 验收标准

- 小程序 `/api/image-text-replication/[id]/rewrite` 与 Web `/api/image-text-replication/[id]/generate` 都使用共享仿写模块。
- Web Markdown “AI生成标题正文”使用同一标题公式规则。
- `npm run lint` 通过。
- `npm run typecheck` 通过。

