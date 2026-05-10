# 小程序分镜板一键剪辑配置计划

## 目标

- 智能复刻第三步在分镜视频生成完成后，可以直接发起一键剪辑。
- 3D 骷髅最终分镜板同样提供一键剪辑配置。
- 剪辑前支持可选音色、可选字幕、可选 BGM 上传；不选择音色或 BGM 时仍可拼接成片。

## 最小调研结论

### 方案 A：统一走现有 `/api/storyboard/[id]/merge`

- 优点：已接入 `storyboard_merge` / `storyboard_subtitle` 积分配置，回调链路稳定。
- 缺点：只支持视频拼接和字幕，不支持音色、BGM。
- 结论：作为无音色、无 BGM 的兜底路径保留。

### 方案 B：有音色或 BGM 时走 `/api/storyboard/[id]/auto-edit`

- 优点：现有 n8n `N8N_AUTO_EDIT_WEBHOOK` 已支持 `voice_id`、`bgm_url`、`want_subtitles`，适合扩展配置面板。
- 缺点：当前接口强制要求 `voiceId`，且未接入积分扣费。
- 结论：采用。将 `voiceId` 改为可选，并补齐 `storyboard_merge` / `storyboard_subtitle` 扣费。

## 范围

- 小程序：`digital_human_miniapp/taro/src/subpages/storyboard-board/`
- 小程序 API 封装：`digital_human_miniapp/taro/src/utils/miniapp-api.ts`
- Next.js API：`app/api/storyboard/[id]/auto-edit/route.ts`
- 不新增 Prisma schema，不新增迁移。

## 实施步骤

1. 扩展 `auto-edit` 接口：
   - `voiceId` 改为可选。
   - 校验任务归属。
   - 保留 `bgmUrl`、`wantSubtitles`、`speed` 入参。
   - 接入 `deductConfiguredCredits()`，使用现有 `storyboard_merge` 和 `storyboard_subtitle`。
2. 扩展小程序 API：
   - `mergeStoryboard()` 支持字幕参数。
   - 新增 `autoEditStoryboard()`。
3. 分镜板 UI：
   - 智能复刻第三步和普通 3D 骷髅页都显示剪辑入口。
   - 点击后打开剪辑设置面板。
   - 可上传音色或选择角色音色，也可不选。
   - 可开启/关闭字幕。
   - 可上传 BGM，也可不选。
   - 有音色或 BGM 时调用 `auto-edit`；否则调用 `merge`。

## 风险与回滚

- 风险：`N8N_AUTO_EDIT_WEBHOOK` 若仍隐式要求音色，无音色时会失败。
  - 处理：无音色且无 BGM 时不走 `auto-edit`，走现有 `merge`。
- 风险：BGM 上传大文件超时。
  - 处理：复用现有上传接口，失败时停留在面板并提示。
- 风险：重复点击导致重复扣费。
  - 处理：前端 action lock；后端保持现有任务状态更新。后续可追加幂等任务运行表。

## 验收标准

- 智能复刻第三步视频生成完成后可打开剪辑配置并触发剪辑。
- 3D 骷髅分镜板可打开剪辑配置并触发剪辑。
- 不选音色、不选 BGM 时，仍能走普通合成。
- 开启字幕时会扣 `storyboard_subtitle`，关闭字幕时不扣字幕项。
- `npm run lint`、`npm run typecheck` 通过。
- 小程序页面用 `weapp-dev-mcp` 完成页面、截图、日志和关键交互验证。

## Tech Debt

- `storyboard-board` 页面同时承载复刻阶段、分镜资产编辑、模型设置和成片剪辑，组件体积偏大；后续建议拆出 `EditPromptSheet`、`MergeSettingsSheet` 和阶段底栏组件。
