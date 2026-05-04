# 小程序小红书图文单张识别重试计划

## 目标

- 在“我的笔记”图文 OCR 结果中，将单张图片识别失败项展示为“失败失败，点击重试”。
- 用户点击失败项后，仅重试对应张数的图片识别，保留其他图片已经识别出的文案。
- 重试完成后刷新当前任务详情，继续支持复制文案与一键仿写。

## 范围

- 小程序端：`digital_human_miniapp/taro/src/subpages/hot-detail/` 的失败项展示、点击重试与局部 loading。
- API 封装：`digital_human_miniapp/taro/src/utils/miniapp-api.ts` 增加单张重试调用。
- 服务端：复用 `/api/image-text-replication/[id]/breakdown`，通过 `imageIndex` 进入单张重试分支。
- OCR 业务逻辑：`lib/imageTextMyNotes.ts` 增加保留现有结果的单张识别合并逻辑。

## 最小调研结论

方案 A：重跑整个 breakdown。
- 优点：复用现有代码，改动最少。
- 缺点：会覆盖所有结果，用户只想修某一张时成本高，也可能让已成功图片重新失败。

方案 B：新增单张 OCR 重试分支。
- 优点：只影响指定图片，保留已成功结果，符合“点击重试指定张数”的需求。
- 缺点：需要补一个合并分析结果的函数，并处理局部 UI loading。

结论：采用方案 B，并复用现有 endpoint，避免新增路由面。

## 兼容性

- Next.js Route Handler：现有 POST endpoint 可读取 JSON body，兼容旧调用空 body 的全量重跑。
- Prisma：不改 schema，不新增迁移，仅更新 `imageTextReplicationTask.analysisResult/status/errorMessage`。
- Supabase：无表结构变更。
- 小程序/Taro：使用现有 `request` 封装和页面 state，不引入新组件库。

## 风险与回滚

- 风险：单张重试期间全局状态短暂变为 `BREAKDOWN_PENDING`，底部按钮会进入解析态。
- 缓解：前端对正在重试的 index 显示局部“重试中...”，接口完成后主动刷新任务。
- 回滚：移除 `imageIndex` 分支和前端点击逻辑，旧的全量 breakdown 行为不受影响。

## 验收标准

- 失败项文案显示为“失败失败，点击重试”。
- 点击某一失败项只触发该 index 的识别请求，其他已识别内容保留。
- 重试成功后该项显示新识别文本；重试失败后仍可继续点击重试。
- `npm run lint`、`npm run typecheck` 通过。
- 小程序页面通过 `weapp-dev-mcp` 截图与日志检查。
