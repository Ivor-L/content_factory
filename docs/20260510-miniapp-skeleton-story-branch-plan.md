# 小程序 3D 骨骼剧情/带货分支升级计划

## 目标

- 小程序 3D 骨骼入口显式支持「带货视频」和「剧情视频」两种类型。
- 带货视频沿用现有产品导向脚本与提示词链路，要求用户选择产品。
- 剧情视频在未选择产品时走纯剧情分支，额外收集主角、场景、剧情类型。
- n8n 工作流根据内容类型选择文案方法，纯剧情遵循短视频爆款英文叙事结构。

## 范围

- 小程序 `digital_human_miniapp/taro/src/subpages/generate`：新增内容类型、剧情场景和剧情类型输入。
- 小程序 API 封装：透传新增 metadata。
- 服务端 `app/api/miniapp/storyboard/skeleton/jobs`：标准化 content/story 字段并传入 payload。
- Storyboard workflow payload：保持现有 `skeleton_video` pipeline，不新增数据库 schema。
- n8n 快照 `workflows/爆款复刻Veo3-脚本生成.json`：扩展标准化输入、脚本生成器、提示词生成器。

## 方案对比

| 方案 | 优点 | 风险 |
|------|------|------|
| 前端无分支，仅后端通过有无产品判断 | 改动少，兼容旧入口 | 用户意图不明确，纯剧情缺少场景和类型，提示词质量不稳定 |
| 前端显式选择内容类型，后端和 n8n 按 metadata 分支 | 用户预期清晰，工作流可控，便于后续差异定价 | 改动涉及 UI/API/workflow，需要小程序联调 |

采用方案：显式内容类型。`带货视频` 必须选择产品并沿用旧链路；`剧情视频` 不传产品要求，使用剧情主角、场景、类型构造纯剧情英文文案。

## 兼容性

- Next.js API：仅扩展 JSON 字段，不改变路由。
- Prisma/Supabase：不新增字段，新增信息保存在 `StoryboardTask.detailedBreakdown.metadata` 与 workflow payload。
- n8n：同一个 webhook 和 callback，不改变回调结构，仍返回 `shots`。
- 小程序：旧入口默认选中「带货视频」，需要选择产品后提交；剧情视频可不选产品。
- 积分配置：仍使用现有 `flow_storyboard_skeleton_video` / `skeleton_video` 能力，不新增付费能力；若后续剧情单独定价，再拆 featureKey。

## 风险与回滚

- 风险：n8n 线上未导入新工作流快照时，剧情字段不会生效。控制点：前后端字段向后兼容，旧 workflow 仍可接收。
- 风险：带货用户未选产品导致旧卖货 prompt 缺少产品。控制点：小程序和服务端都拦截带货无产品。
- 风险：剧情 prompt 输出不符合 JSON。控制点：保持输出 schema 不变，提示词生成器仍只增强 `shots`。
- 回滚：撤回本计划涉及的前端/API/workflow JSON 改动即可，无迁移。

## 验收标准

- 3D 骨骼页可切换「带货视频 / 剧情视频」。
- 带货视频未选择产品时不能提交，并提示用户选择产品。
- 剧情视频展示主角、场景、类型输入；提交 payload 包含 `content_type=story`、`story_scene`、`story_type`。
- 服务端创建任务时 metadata/payload 保留剧情字段。
- n8n 工作流纯剧情分支遵循 8-15 个时间节点、英文短句、3 秒 hook、结尾 hook。
- `npm run lint`、`npm run typecheck` 通过。
- 小程序页面通过 weapp-dev-mcp 完成页面、交互、日志截图验证。
