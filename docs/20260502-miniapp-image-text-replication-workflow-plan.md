# 20260502 小程序图文同款创作链路升级计划

## 目标

将小程序「爆款广场 → 图文卡片一键创作同款」升级为完整闭环：
1. 在爆款广场新增「我的」分类，点击一键同款后先沉淀到「我的」；
2. 自动启动并行图片文案提取（支持关闭页面，后台继续解析）；
3. 我的详情页展示原图、原标题、原正文、图片提取文案；
4. 支持一键仿写（标题/正文/图片文案二创）；
5. 仿写完成后再加入作品，并可进入「图文卡片」或「信息卡片」生成流程。

## 范围

- 小程序前端
  - `digital_human_miniapp/taro/src/pages/hot-detail/*`
  - `digital_human_miniapp/taro/src/pages/work-detail/*`
  - `digital_human_miniapp/taro/src/pages/image-generate/*`
  - `digital_human_miniapp/taro/src/utils/miniapp-api.ts`
- 服务端 API
  - `app/api/image-text-replication/start/route.ts`
  - `app/api/image-text-replication/[id]/route.ts`
  - 新增 `app/api/image-text-replication/[id]/breakdown/route.ts`
  - 新增 `app/api/image-text-replication/[id]/rewrite/route.ts`

## 方案对比（最小调研）

### 方案 A：前端本地提取 + 本地仿写（仅展示，不回写）
- 优点：实现快；后端改动少。
- 缺点：刷新丢失；任务状态不可追踪；与作品体系割裂。

### 方案 B（采用）：后端任务化提取/仿写 + 前端轮询展示
- 优点：结果可持久化；可追踪状态；与已有 `creativeTask/taskSummary` 对齐。
- 缺点：新增 API 与状态处理逻辑，复杂度更高。

## 兼容性结论

- Next.js App Router：新增 route handler 兼容现有结构。
- Prisma/Supabase：不改 schema，使用 `creativeTask.metadata.custom.replication` 扩展字段。
- 小程序 Taro：沿用现有页面与请求封装，新增状态渲染与入口跳转。
- 既有图文生成链路：继续复用 `image-text-replication`、`xhs-layout` 与 `xhs-text2img`。

## 风险与回滚

- 风险 1：图片识别外部模型波动导致部分图片失败。
  - 处理：并行提取但容错单图失败，保留成功结果并提示。
- 风险 2：仿写结果格式不稳定。
  - 处理：后端强约束 JSON 输出并做兜底解析。
- 风险 3：前端轮询导致额外请求。
  - 处理：仅在图文复刻任务详情页轮询，并在终态停止。

回滚策略：
- 保留原有 `start` 能力；如新流程异常，前端可回退为“创建后返回作品列表”。
- 新增 API 独立，不影响其他任务类型。

## 分阶段里程碑

1. M1 API 能力：补齐 breakdown/rewrite 与任务详情字段。
2. M2 小程序链路：创建即跳详情 + 提取展示 + 一键仿写。
3. M3 生成入口：仿写结果进入图文卡片/信息卡片并预填。
4. M4 联调与验证：lint/typecheck + 手工链路回归。

## 验收标准

- 在爆款详情点击「一键同款创作」后，500ms 内进入对应「我的笔记」详情并开始后台解析。
- 详情页可看到提取进度与结果：原图、原标题、原正文、图片文案；关闭页面后再次进入可继续查看进度。
- 点击「一键仿写」后，页面展示二创标题/正文/图片文案。
- 点击「一键仿写」后创建作品并可跳转作品详情。
- 点击「生成图文卡片 / 生成信息卡片」可进入对应页面且自动带入二创内容。

## Tech Debt

- 当前依赖轮询，后续可切 Supabase Realtime 推送减少请求。
- 二创与提取的提示词可抽离为统一模板配置，便于运营调参。
