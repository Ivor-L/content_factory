# 2026-05-04 小程序信息图正文入参与多图滑动展示修复计划

## 目标

- 小程序信息图生成只把用户正文传入图文复刻生成链路，风格名仅用于选择风格模板，不进入标题或正文。
- 小程序作品详情中，多张图文作品可左右滑动查看，并在图片底部显示当前页码。

## 范围

- 小程序信息图提交入口：`digital_human_miniapp/taro/src/subpages/image-generate/index.tsx`
- 图文复刻生成 API：`app/api/image-text-replication/[id]/generate/route.ts`
- 图文生成结果回调与任务摘要修复：`app/api/webhook/image-text-result/route.ts`、`lib/taskSummaryQueries.ts`
- 小程序作品列表/详情多图解析与展示：`digital_human_miniapp/taro/src/pages/works/index.tsx`、`digital_human_miniapp/taro/src/subpages/work-detail/index.tsx`

## 阶段

1. 修复入参：去除 `topicHint` 拼入正文的逻辑，小程序 `sourceTitle` 使用通用信息图标题。
2. 兼容多图结果：统一解析 `generated_images`、`generatedImages`、`generated_images_json`、`generatedImagesJson`。
3. 优化展示：作品详情使用 Swiper 展示多图，底部页码常驻，图片完整适配容器。
4. 验证：执行 lint/typecheck；若小程序自动化连接可用，使用 weapp-dev-mcp 截图与日志检查。

## 风险

- 旧任务的结果可能只写入 `creative_tasks.generated_images_json`，需要摘要查询时自动补齐 metadata。
- n8n 回调字段格式可能是字符串数组，也可能是对象数组 JSON 字符串，需要兼容解析。

## 回滚

- 若生成链路异常，回退生成接口中 `rewriteXhsNote` 的输入组装改动。
- 若展示异常，回退小程序作品页/详情页的图片解析与样式改动。

## 验收标准

- n8n 收到的 `text` 不再包含信息图模板/风格名，只包含正文。
- 多图作品详情可左右滑动，底部显示 `当前页/总页数`。
- 作品列表多页角标能按生成张数显示。
- `npm run lint`、`npm run typecheck` 通过。
