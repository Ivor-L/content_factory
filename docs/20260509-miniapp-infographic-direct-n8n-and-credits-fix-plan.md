# 小程序信息图直连 n8n 与积分修复计划

## 目标

- 小程序信息图生成不再先创建图文复刻任务或触发标题/正文仿写，直接把标题、正文、模板、张数提交给文本转图 n8n 工作流。
- 作品页能展示同一信息图任务生成的全部图片数量和封面来源。
- Web 图文复刻/文本转图在后台积分配置为 0 或异常时不再向积分服务提交 0。

## 范围

- 小程序 `image-generate` 信息图提交链路。
- Web `/api/xhs-text2img/plan` 与任务汇总图片元数据。
- 积分配置读取兜底逻辑。

## 调研结论

- 方案 A：小程序继续调用 `/api/image-text-replication/start` 再 `/generate`。兼容现有图文复刻，但会进入仿写链路，不符合“只提交给 n8n”。
- 方案 B：小程序直接调用 `/api/xhs-text2img/plan`。该接口已完成扣费、创建作品、提交 n8n、回调写入多图，兼容 Next.js/Prisma/Supabase/n8n。采用此方案。

## 实施

1. 小程序新增文本转图 API 封装，并在信息图按钮中直接调用。
2. 后端创建任务和同步 summary 时保留 `xhsLayout.images` 等多图元数据。
3. 积分价格读取过滤非正数，回落到代码默认价，避免外部积分 API 收到 0。

## 风险与回滚

- 风险：部分模板缺少风格 JSON。回滚方式是仅恢复小程序提交入口到旧图文复刻接口。
- 风险：已有 0 积分配置被代码默认价覆盖。回滚方式是恢复 `creditCosts` 原逻辑并在后台修正配置。

## 验收标准

- 小程序信息图点击生成后只创建 `poster/text2image` 任务，并进入作品页后台生成。
- 生成 3 张时，作品页卡片显示 `3页`，详情可读到全部图片 URL。
- Web 图文复刻不再报 `ERR_INVALID_AMOUNT Amount must be greater than 0`。
- `npm run lint`、`npm run typecheck` 通过；小程序改动使用 weapp-dev-mcp 验证。

