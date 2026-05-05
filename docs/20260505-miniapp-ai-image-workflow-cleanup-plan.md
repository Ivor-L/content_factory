# 小程序 AI 作图工作流通用化计划

## 目标

将 `workflows/storyboard_image_关键帧图片生成.json` 从分镜关键帧专用工作流改为通用 AI 作图工作流。工作流不再改写 prompt、不再追加固定尾缀，所有画面控制由小程序前端与服务端请求参数显式传入。

## 范围

- 小程序 AI 作图表单：补齐比例选择，并为后续控制项保留请求协议。
- 服务端小程序生图任务接口：透传 prompt、比例、参考图、负面约束与参考图说明。
- n8n workflow 快照：只负责字段标准化、图片下载、Gemini 请求体组装、上传与回调。

## 调研结论

方案 A：继续在 n8n 内硬编码提示词尾缀。
- 优点：改动少。
- 缺点：不同作图场景会互相污染，前端无法精确控制输出。

方案 B：n8n 改为通用薄工作流，控制项全部前置到前端/服务端。
- 优点：调用协议清晰，AI 作图、主体替换、信息图可共用；回滚只需恢复 workflow 快照。
- 缺点：前端需要逐步补更多控制项。

采用方案 B。本次先移除 n8n prompt 改写和硬编码尾缀，并保留兼容字段。

## 实施步骤

1. 更新小程序 AI 作图比例选择与提交参数。
2. 更新 `/api/miniapp/canvas/images/jobs`，向 n8n 透传 `aspect_ratio`、`negative_prompt`、`reference_image_instructions`。
3. 更新 `storyboard_image_关键帧图片生成.json`：
   - 输入整理不再把第一张参考图强制当产品图。
   - 组装请求体不再替换用户 prompt。
   - 只附加用户传入的参考图说明和负面约束。
4. 执行 lint/typecheck/build:weapp 与 weapp-dev-mcp 页面验证。

## 风险与回滚

- 风险：线上 n8n 未导入新快照时，服务端已传的新字段不会生效，但旧字段仍兼容。
- 风险：参考图语义减少后，主体替换类场景需要前端明确传说明。
- 回滚：恢复 `workflows/storyboard_image_关键帧图片生成.json` 原快照，并把服务端 webhook payload 回退为旧字段。

## 验收标准

- 小程序 AI 作图可以选择比例并提交到服务端。
- workflow 请求体中 prompt 与前端输入一致，不追加“无文字”等固定尾缀。
- workflow 仍可下载参考图、调用上游生图、上传图片并回调。
- `npm run lint`、`npm run typecheck`、`npm run build:weapp` 通过。
- weapp-dev-mcp 验证页面渲染、比例切换、日志无异常。

