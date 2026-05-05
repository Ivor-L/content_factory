# 小程序 3D 骨骼分镜角色引用、时长与语言修复计划

## 目标

- 3D 骨骼分镜任务同时保留用户选择的产品与角色。
- 64s/96s 等前端时长选择稳定传给后端与 n8n 工作流。
- 前端补充语言选择，并随任务提交到工作流。
- 触发首帧图或视频生成后，原占位区展示生成中的动效。
- 分镜板设置支持横屏/竖屏，并作为生图、生视频入参。
- 3D 骨骼分镜生成后，按工作流回参决定每个镜头是否传产品图。

## 范围

- 小程序 `generate` 页面：增加 3D 骨骼语言选择，并补齐时长/语言 metadata。
- Storyboard 创建与 webhook 回调：为 `skeleton_video` 保留角色引用，继续避免 `viral_clone` 引入人物身份引用。
- Storyboard 状态与生成接口：返回/使用角色引用，并将更多时长别名传给 n8n。
- 小程序分镜板：展示产品和角色参考，图片/视频生成中显示动效。
- 分镜板设置与生成接口：保存用户画幅选择，发送 `aspectRatio`/`aspect_ratio` 给图片与视频生成工作流。

## 方案对比

| 方案 | 优点 | 风险 |
|------|------|------|
| 仅前端补字段 | 改动少 | 如果后端/回调覆盖引用或 n8n 字段名不一致，问题仍存在 |
| 前后端统一补字段和引用 | 覆盖任务创建、回调、展示、生成全链路 | 涉及模块更多，需要 lint/typecheck 与小程序验证 |

采用方案：前后端统一修复。`viral_clone` 仍不传角色身份引用，`skeleton_video` 才启用角色参考。

## 兼容性

- Next.js API：仅扩展 JSON payload 字段，不改路由契约。
- Prisma/Supabase：只使用已有 `StoryboardTask.characterId` 关系，不新增 schema/迁移。
- n8n：同时发送 `duration_seconds`、`duration_sec`、`target_duration_seconds`、`video_duration_seconds`、`total_duration_seconds` 等别名，兼容不同工作流取字段方式。
- n8n：图片/视频生成继续接收已有 JSON payload，新增画幅字段和产品图条件字段为向后兼容扩展。

## 风险与回滚

- 风险：角色参考被误用于智能复刻。控制点：仅 `pipeline_key === skeleton_video` 时加入角色引用。
- 风险：n8n 未消费新增语言字段。控制点：同时传 `target_language`、`targetLanguage`、`language`。
- 风险：3D 骨骼分镜未返回 `has_product` 时误传产品图。控制点：`skeleton_video` 默认不传产品图，仅回参显式为 true 时传。
- 风险：用户设置画幅被源视频推断值覆盖。控制点：生成接口优先使用请求中的画幅，再回退到分镜分析结果。
- 回滚：撤回本计划对应代码改动即可，不涉及数据库迁移。

## 验收标准

- 3D 骨骼任务状态接口 references 同时包含产品与角色。
- 分镜段落 `generationParams.subject_refs` 在 3D 骨骼任务中包含 `character`。
- 64s 选择提交后任务 payload 包含多个 64 秒时长别名。
- 语言选择提交后 payload/metadata 包含语言字段。
- 小程序分镜板触发生图/生视频后，占位区显示生成中动效。
- 分镜板设置可选择竖屏 9:16 / 横屏 16:9，触发生图与生视频时均带入请求。
- 3D 骨骼分镜段落只有回参 `has_product`/`是否有产品` 明确为 true 时，生成图片和 Seedance 视频引用才包含产品图。
