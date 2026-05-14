# 爆款短视频复刻 Agent 链路与 HTML 回调展示优化计划

## 目标

针对当前「爆款短视频复刻」技能测试暴露的问题，优化 Agent 侧链路与结果展示，使其对齐小程序智能复刻展示方式：

1. **缩短 Agent 调用链路**：Agent 只负责上传/提交视频与参数，后端任务接口负责触发 n8n，回调后直接读取并展示结构化结果。
2. **优化回调结果展示形态**：Agent 最终交付优先返回 HTML 报告，而不是原始 JSON 或逐分镜表格。
3. **展示正确内容层级**：HTML 报告包含拆解总结、源视频分析、节奏拆解、口播文案、改写口播、爆款机制、Clip 分段提示词。
4. **展示分镜网格图**：报告中直接展示 `storyboard_grid_url` / `storyboardImageUrl`。
5. **提示词粒度调整**：Agent 结果以 `clone_prompt.clips` 为主，而不是逐个 storyboard segment 的 `videoPrompt`。

## 范围

### 涉及模块

- `lib/agent-capabilities/runner.ts`
  - 简化 `viral.breakdown.video_prompts` 的输入校验与提交语义。
  - 对齐 skill intake：不再要求用户输入时长；缺省时长仅作为后端兼容字段，不暴露给用户。

- `packages/nextide-cli/src/index.ts`
  - 调整 `viral.breakdown.video_prompts` 的 artifact-first 展示逻辑。
  - 新增/修正专用 HTML report 渲染，优先读取 `detailedBreakdown.clone_prompt.clips`。
  - datatable fallback 从逐分镜表切换为 clip 提示词表。

- `scripts/nextide-cli.mjs` 或 CLI MVP 路由
  - 如当前 MVP CLI 不支持 `run follow` / `run artifacts`，补齐最小可用能力，或在 `run result` 后自动导出 HTML 报告。

- `app/api/webhook/storyboard/unified/route.ts`
  - 确认回调完整保留 `workflow_data` 中的 `source_video_analysis`、`beat_map`、`viral_mechanism`、`content_structure`、`clone_prompt`、`storyboard_grid_url`。
  - 如 n8n 已返回这些字段，仅需保证 Agent 读取路径正确；不改回调契约。

- `skills/` 或 `.claude/skills` 生成源（如适用）
  - 更新「爆款短视频复刻」技能说明，明确结果展示以 HTML 报告与 Clip 提示词为准。

## 当前问题诊断

### 1. 链路显得过长

当前测试过程包括：

1. Agent 复制本地附件；
2. 手动上传 OSS；
3. 写 `.nextide/input/*.json`；
4. `capability run` 提交；
5. `run status` 手动轮询；
6. `run result` 导出 JSON；
7. 人工从 JSON 中提取内容。

理想状态应是：

```text
上传/传入视频 + 参数
  → capability run viral.breakdown.video_prompts
  → 后端创建 StoryboardTask 并触发 n8n
  → n8n 回调写入 detailedBreakdown + storyboard grid
  → nextide run result/artifacts 自动生成 HTML 报告
  → Agent 展示 HTML 报告路径或 html-preview
```

### 2. 展示内容不对

当前 Agent 输出偏向 `segments[]` 逐分镜提示词，但小程序智能复刻更关注：

- 源视频整体分析；
- 节奏结构；
- 口播与改写口播；
- 爆款机制；
- 可生成视频的 clip 级提示词；
- 分镜网格图。

### 3. 缺少分镜网格图展示

当前 JSON 中已有：

- `storyboard_grid_url`
- `storyboard_grid.url`
- `storyboardImageUrl`
- `coverImage`

但 Agent 最终回复没有优先展示。

## 方案设计

### 方案 A：Agent/CLI 展示层修复（优先）

不改 n8n 与数据库结构，只修 Agent runtime 的结果读取和 HTML 渲染。

优点：
- 改动小；
- 风险低；
- 立刻解决用户看到的结果形态问题；
- 与小程序结果数据复用。

缺点：
- 如果 n8n 回调缺字段，仍需回调层兜底。

### 方案 B：回调层直接生成 HTML artifact

在 webhook 回调时生成 HTML 并存储/上传，再由 Agent 直接展示。

优点：
- 回调完成即有 HTML；
- Agent 逻辑更薄。

缺点：
- 回调层承担展示职责，耦合更高；
- HTML 模板迭代会影响后端 webhook；
- 需要存储 artifact URL 或本地路径，迁移成本更高。

### 决策

采用 **方案 A 优先**：

- 回调继续负责写结构化数据；
- CLI/Agent artifacts 阶段负责生成 HTML；
- 如发现回调丢字段，再补 webhook 保留逻辑。

## 分阶段里程碑

### Phase 1：确认数据契约

- 梳理 `detailedBreakdown` 中现有字段：
  - `source_video_analysis`
  - `content_structure`
  - `beat_map`
  - `viral_mechanism`
  - `full_original_script`
  - `full_rewritten_script`
  - `clone_prompt.clips`
  - `storyboard_grid_url`
  - `storyboard_grid.url`
- 明确 Agent HTML 报告字段读取优先级。

### Phase 2：HTML 报告渲染

在 `packages/nextide-cli/src/index.ts` 中完善 `renderViralBreakdownReportHtml`：

页面结构建议：

1. 顶部摘要
   - 任务状态
   - 总时长
   - 风格名称
   - 画幅
   - 任务 ID
2. 分镜网格图
   - 使用 `storyboard_grid_url` / `storyboard_grid.url`
3. 拆解总结
   - `defining_traits`
   - `what_transfers`
   - `what_gets_swapped`
4. 源视频分析
   - `source_video_analysis`
5. 节奏拆解
   - `beat_map`
6. 口播文案
   - `full_original_script`
7. 改写口播
   - `full_rewritten_script`
8. 爆款机制
   - `viral_mechanism.attention_triggers`
   - `retention_devices`
   - `trust_devices`
   - `conversion_devices`
9. Clip 分段提示词
   - `clone_prompt.clips[]`
   - 展示 `clip_index`、`role`、`duration`、`time_range`、`start_state`、`end_state`、`prompt`
10. 复刻合规契约
   - Learn / Do not copy

### Phase 3：datatable 与 recommendedResponse 调整

- `buildViralBreakdownPromptTable()` 改为优先使用 `clone_prompt.clips`。
- `summary.recommendedResponse.message` 明确：
  - 已完成拆解；
  - HTML 报告路径；
  - 分镜网格图已包含；
  - Clip 级提示词数量。

### Phase 4：CLI 长任务体验修复

- 补齐或修复 MVP CLI：
  - `nextide run follow <run-id>`；或
  - `nextide run artifacts <run-id>`；或
  - `run result --output` 后自动生成 `breakdown-report.html`。
- 避免 Agent 需要手动多次轮询和手工读 JSON。

### Phase 5：Skill 文档更新

更新「爆款短视频复刻」技能说明：

- 输入仍然只要求：视频、目标语言、提示词格式、下一步；
- 输出改为 HTML 报告优先；
- 提示词以 Clip 分段为主；
- 分镜网格图为必展示内容。

## 风险

1. **字段路径不稳定**
   - n8n 可能把结构放在 `workflow_data`、`result`、`data` 或 `detailedBreakdown` 不同层级。
   - 缓解：实现多路径读取 helper。

2. **CLI dist 与 src 不一致**
   - 当前 `packages/nextide-cli/src/index.ts` 和 `dist/index.js` 可能不同步。
   - 缓解：修改 src 后执行 `npm run build:nextide-cli`，确认实际 `scripts/nextide-cli.mjs` 使用路径。

3. **HTML 内容过长**
   - Clip prompt 很长，直接展开可能影响可读性。
   - 缓解：HTML 中用 `<details>` 折叠长提示词，并提供 copy-friendly `<pre>`。

4. **回调尚未最终完成但业务已 BREAKDOWN_COMPLETED**
   - 外层 run store 仍可能显示 `waiting_callback`。
   - 缓解：Agent result 读取时识别 `business.status === BREAKDOWN_COMPLETED` 即可生成报告。

## 回滚策略

- 所有改动集中在 Agent/CLI 展示层，可回滚到旧的 JSON/datatable 展示。
- 不改变 n8n webhook URL 和数据库 schema。
- 若 CLI follow 修复影响其他 capability，可仅对 `viral.breakdown.video_prompts` 使用专用导出路径。

## 验收标准

### 功能验收

- 使用本地视频 + `targetLanguage=source` + `promptProvider=seedance` + `nextStep=breakdown_only` 提交成功。
- 回调完成后生成 HTML 报告。
- HTML 报告包含：
  - 拆解总结；
  - 源视频分析；
  - 节奏拆解；
  - 原口播文案；
  - 改写口播；
  - 爆款机制；
  - Clip 分段提示词；
  - 分镜网格图。
- Clip 提示词来自 `detailedBreakdown.clone_prompt.clips`，而不是逐分镜 `segments[].videoPrompt`。
- Agent 最终回复优先给 `breakdown-report.html` / `html-preview`。

### 质量门禁

按项目规则执行：

1. `npm run lint`
2. `npm run typecheck`
3. 若修改 CLI 构建链路：`npm run build:nextide-cli`
4. 若涉及 UI 页面组件：启动 dev 并做浏览器验证。

## Tech Debt

- 当前 skill 文档与 runner 实现存在不一致：文档说不询问时长，但 runner 仍要求 `durationSeconds`。
- `scripts/nextide-cli.mjs` 与 `packages/nextide-cli/src/index.ts` 的能力不完全一致，导致文档中的 `run follow` 不可用。
- Agent artifact 生成和 run store 状态判断还需要统一：业务状态已完成时，不应继续提示 `run_not_finished`。
