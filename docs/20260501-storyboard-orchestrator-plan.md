# 20260501 Storyboard Orchestrator Plan

## 目标
将分镜类能力抽象为统一的「分镜编排层（Storyboard Orchestrator）」，让爆款复刻分镜、正文转分镜、骷髅视频等不同入口共享同一任务模型、回调处理和分镜板展示能力。

## 范围
- 新增通用分镜 Profile 配置层（pipeline_key -> webhook/config/mapper）
- 新增通用任务创建入口 `/api/storyboard/jobs`
- 新增通用回调入口 `/api/webhook/storyboard/unified`
- 首批接入 `script_to_storyboard`（正文转分镜）
- 保持现有分镜板（storyboard_tasks + storyboard_segments）复用

## 分阶段里程碑
1. M1：完成编排层骨架与统一 Schema
2. M2：打通 `script_to_storyboard` 入口（Web 端）
3. M3：打通统一回调并落库 segments
4. M4：验证兼容现有任务列表/分镜板页面

## 兼容性结论
- Next.js App Router：兼容，通过新增 API Route 与 lib 层抽象实现。
- Prisma/Supabase：兼容，复用 `storyboard_tasks` 与 `storyboard_segments`。
- n8n：兼容，只需各 workflow 输出统一回调字段即可。
- 小程序：兼容，后续只需调用统一创建 API 与已有任务查询 API。

## 方案对比
1. 继续按 workflow 单独接入
- 优点：短期改动少
- 缺点：字段分叉、回调分散、分镜板维护成本上升

2. 通用编排层（采用）
- 优点：新增 workflow 成本低，统一回调与 UI 复用强
- 缺点：首期抽象与迁移成本更高

## 风险
1. 历史 workflow 返回字段不一致导致回调标准化失败。
2. 同一 task 重复回调带来重复写入与重复扣费风险。
3. 迁移期间新旧入口并存，可能出现状态不一致。

## 回滚策略
1. 保留旧路由与旧 workflow，不做删除。
2. 通过 pipeline/profile 开关将请求回切至旧入口。
3. 统一回调异常时，暂时回退到原回调路由处理。

## 验收标准
1. `script_to_storyboard` 通过 `/api/storyboard/jobs` 成功创建并触发 n8n。
2. n8n 回调 `/api/webhook/storyboard/unified` 后，任务状态与 segments 正确落库。
3. 分镜板页面无需改造即可展示结果。
4. lint/typecheck 通过。

## Tech Debt
1. 后续应为不同 pipeline 增加独立 output mapper 与契约测试。
2. 统一回调幂等日志（event_id）可进一步落表增强审计。
3. 需补充小程序端统一入口接入与端到端回归测试。
