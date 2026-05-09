# 小程序智能复刻第三阶段视频积分确认计划

## 目标

- 第三阶段点击“一键批量生成”前，先提示本次预计消耗积分，用户确认后再触发生视频。
- 生成中的片段展示不可点击的生成中动画状态，离开页面后再回来仍按服务端状态保留，直到成功或失败。

## 最小调研结论

- 方案 A：前端按片段数量和时长自行计算积分。实现快，但会复制后台积分配置解析逻辑，后台价格调整后容易不一致。
- 方案 B：生成接口增加 `quoteOnly` 预估模式。复用后端 `getCreditCostForModel()` 与 `storyboard_video` 配置，前端只展示结果。采用此方案。
- 方案 C：第三阶段生视频继续走 KIE Seedance 兼容层。改动小，但不符合供应商切换目标，且多一层代理不利于排查。
- 方案 D：第三阶段生视频直连火山方舟 Seedance 2.0 REST API，创建任务时传入 `callback_url`，火山完成后直接回调现有分镜视频 webhook。采用此方案替换 KIE。

## 兼容性

- Next.js API：复用现有 `/api/storyboard/[id]/generate-videos` POST，不新增路由。
- Prisma/Supabase：不改 schema，不新增迁移。
- 积分配置：继续使用 `storyboard_video` 与 `storyboard_video:<modelKey>`，Seedance 按秒数 units，其他模型按片段数。
- 小程序：Taro 页面在 `useDidShow` 和轮询中读取服务端 `VIDEO_GENERATING` 状态，离开/返回后可恢复生成中展示。
- 火山方舟：使用 `POST /api/v3/contents/generations/tasks` 创建任务并传 `callback_url`；模型 ID 映射为 `doubao-seedance-2-0-260128` 与 `doubao-seedance-2-0-fast-260128`。

## 风险与回滚

- 风险：预估与实际触发之间后台价格被管理员修改。回滚策略：实际生成仍以后端扣费为准，异常时返回 402 并阻断任务。
- 风险：部分片段已经生成中时重复触发。回滚策略：前端过滤生成中片段，单片段按钮在生成中不可点击。
- 风险：火山回调丢失或公网回调地址不可达。回滚策略：分镜保留 `provider_task_id` 与 `provider_request`，可按任务 ID 手动查询并回写；必要时临时回滚到旧 KIE 分支。
- 风险：火山输入素材必须是公网可访问 URL。控制点：沿用现有 OSS/公网素材链路，触发失败时分段退款。

## 验收标准

- 批量生成前出现积分确认弹窗，取消不会触发任务。
- 确认后才调用真实生成。
- 生成中的片段显示动画占位和“生成中”，编辑/生成按钮不可点击。
- 离开第三阶段页面再回来，生成中状态仍展示，直到 webhook 标记成功或失败。
