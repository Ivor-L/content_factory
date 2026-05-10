# 小程序生成页提交按钮布局调整计划

## 目标

- 数字人、图片生成、视频生成页面的提交按钮统一改为底部吸附样式，参考智能文案页。
- 文案输入面板保持在表单内容区域内，不再与提交按钮合并。
- 图片生成页的 AI 作图、信息图文案输入面板放在表单项下方，不再吸附底部。

## 范围

- `digital_human_miniapp/taro/src/subpages/generate/index.tsx`
- `digital_human_miniapp/taro/src/subpages/generate/index.sass`
- `digital_human_miniapp/taro/src/subpages/image-generate/index.tsx`
- `digital_human_miniapp/taro/src/subpages/image-generate/index.sass`

## 里程碑

1. 调整数字人/视频生成页：提交按钮脱离脚本输入面板，统一渲染在页面级 fixed submit。
2. 调整图片生成页：AI 作图/信息图输入面板改为普通表单卡片，提交按钮改为页面级 fixed submit。
3. 执行 lint、typecheck、Taro weapp build，并用 weapp-dev-mcp 验证关键页面与日志。

## 风险

- 固定底栏可能遮挡页面末尾内容，需要同步调整页面底部 padding。
- Textarea 从 fixed 切到普通布局后，键盘顶起行为可能变化，需要在微信开发者工具里验证输入与滚动。

## 回滚

- 回退上述 4 个小程序页面文件即可恢复旧布局。

## 验收标准

- 数字人、视频生成、图片生成页面底部均有独立吸附提交按钮。
- 文案输入面板内不再包含提交按钮。
- 图片生成页 AI 作图/信息图输入面板显示在表单区域下方。
- 小程序构建通过，weapp-dev-mcp 日志无异常。
