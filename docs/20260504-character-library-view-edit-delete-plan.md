# 角色库查看编辑删除与创建表单优化计划

## 目标

- 角色库卡片支持点开查看详情。
- 编辑与删除动作收进详情弹窗，列表外层不直接暴露删除按钮。
- 新建/编辑角色时修复音频录制与移除交互，并优化上传、录音、头像构图和底部按钮布局。

## 范围

- Web 端角色库页面：`app/(main)/characters/CharacterList.tsx`
- 角色创建/编辑表单：`components/CharacterForm.tsx`
- 角色相关 i18n 文案：`lib/i18n.ts`

不涉及 Prisma/Supabase schema、迁移、鉴权策略、上传 API 合约调整。

## 调研结论

### 方案 A：沿用现有 `CharacterForm`，只在角色库页面外包一层详情弹窗

- 兼容性：与 Next.js、Prisma、Supabase、现有 Server Action 完全兼容。
- 优点：改动小，创建与编辑仍走 `createCharacter(formData)`。
- 缺点：如果不改表单内部 label 结构，音频控件点击仍可能误触文件选择。

### 方案 B：拆出独立详情/编辑抽屉，并重写角色表单上传控件

- 兼容性：与现有 API 兼容，但改动面更大。
- 优点：交互边界更清晰。
- 缺点：需要重做更多样式和状态，风险高于本次需求。

### 采用方案

采用方案 A，并对 `CharacterForm` 的音频区做局部结构修复：文件选择与录音使用显式按钮，隐藏 input 仅由按钮触发；录音使用浏览器 `MediaRecorder`，录制结果继续上传到现有 `/api/upload/audio`。

## 风险与回滚

- 风险：浏览器不支持 `MediaRecorder` 或用户未授权麦克风时无法录音。
- 应对：提供错误提示，不影响音频文件上传。
- 回滚：可回退 `CharacterList.tsx` 与 `CharacterForm.tsx` 的 UI 改动，数据库与 API 无需回滚。

## 验收标准

- 角色卡片点击后打开详情。
- 详情内可编辑、可触发删除确认；列表卡片不显示删除按钮。
- 新建角色表单里头像为竖构图。
- “选择音频文件”和“点击录音”前有图标。
- 录音按钮可开始/停止录音，关闭/移除音频不会误触文件选择。
- 创建/取消按钮上下排列且等宽。
- `npm run lint` 与 `npm run typecheck` 通过。

