# 小程序 AI 作图生成状态与作品沉淀计划

## 目标

- 点击 AI 作图「立即生成」后，立即提示：图片生产中，请在作品中查看生成结果。
- 用户可选择「去作品查看」或「继续生成」。
- AI 作图任务退出页面后仍保持生成状态，并在完成后出现在作品页。

## 范围

- 小程序 AI 作图页：`digital_human_miniapp/taro/src/subpages/image-generate/index.tsx`
- 小程序 API 封装：`digital_human_miniapp/taro/src/utils/miniapp-api.ts`
- 作品列表/详情图片读取：`digital_human_miniapp/taro/src/pages/works/index.tsx`、`digital_human_miniapp/taro/src/subpages/work-detail/index.tsx`
- 后端小程序 AI 作图任务入口：`app/api/miniapp/canvas/images/jobs/route.ts`

## 最小调研

### 方案 A：前端本地 storage 保存生成中状态

- 优点：改动小，不需要后端新增接口。
- 缺点：退出页面、换设备、刷新作品列表后状态不可靠；生成结果只在本机可见，无法满足作品页沉淀。

### 方案 B：后端先创建 TaskSummary/CreativeTask，再异步生成并回写结果

- 优点：作品页以服务端任务为准，退出页面也能保持状态；成功后图片自然进入作品列表与详情。
- 缺点：需要新增一个小的任务编排接口，并处理失败回写。

### 结论

采用方案 B。复用现有 `creative_tasks` + `task_summaries` 的 poster 作品聚合，不改数据库 schema；生成能力继续复用 `/api/canvas/images/generations`，降低兼容风险。

## 兼容性

- Next.js：Route Handler 使用 `after()` 执行响应后的异步生成，避免前端等待图片生成完成。
- Prisma：复用现有 `CreativeTask`、`TaskSummary` 模型，不新增迁移。
- Supabase：不新增表，不改变存储策略。
- Canvas 图片代理：继续走 `/api/canvas/images/generations`，沿用现有扣费与上游配置。

## 风险与回滚

- 风险：上游返回结构不含 URL 时任务会标记失败。
- 风险：后台生成失败后作品页会显示失败状态，需要用户重新生成。
- 回滚：移除新增 `/api/miniapp/canvas/images/jobs` 调用，前端恢复直接调用 `generateCanvasImages`。

## 验收标准

- 点击「立即生成」后出现弹窗，包含「去作品查看」和「继续生成」。
- 点击「去作品查看」后进入作品页，并能看到生成中的 AI 作图作品。
- 图片生成成功后，作品页卡片和详情页能展示生成图片。
- 退出 AI 作图页后，作品页仍能通过后端任务状态展示生成中/完成/失败。
