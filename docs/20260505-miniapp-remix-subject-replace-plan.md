# 小程序智能复刻第二阶段主体替换优化计划

## 目标

- 将智能复刻拆解完成后的第二阶段入口从“进入生成阶段”调整为“替换产品/角色”。
- 复用分镜板图片编辑弹层，支持换产品、换角色两种快捷操作，并默认进入换产品。
- 优化分镜图片编辑体验：返回入口、输入唤起、模型默认值与 image2 模型选项。
- 调整分镜生图 API 的 payload，兼容旧 n8n 工作流，同时为新工作流提供多参考图和模型能力适配字段。

## 最小调研结论

### 方案对比

1. 复用 `storyboard-board` 内的图片编辑弹层
   - 优点：直接复用图2的预览、素材、参考图、提示词和模型选择 UI。
   - 风险：需要通过路由参数和本地状态注入换产品/换角色上下文。
   - 结论：采用。

2. 新建独立图片编辑页面
   - 优点：职责更清晰。
   - 风险：会重复大量分镜编辑逻辑，且容易和现有分镜素材状态脱节。
   - 结论：暂不采用。

### 兼容性

- Next.js API：保持 `/api/storyboard/[id]/generate-images` 入口不变，仅扩展请求体字段。
- Prisma：不新增字段，继续使用 `storyboard_segments.generationParams` 保存参考图和历史图。
- Supabase：不改 schema，不涉及迁移。
- n8n：保留 `product_image_url`、`character_image_url`、`reference_frame_url` 旧字段；新增 `reference_image_urls`、`images`、`model_capabilities`、`subject_replace_mode`，供重构后的工作流读取。
- 小程序 Taro：使用现有 `Textarea` 和 `ScrollView`，通过去掉固定输入与增加返回按钮修复输入唤起与关闭问题。

### 风险与回滚

- 风险：旧 workflow 只读取单图字段，多图字段不会生效。回滚方式：保留旧字段，出现问题可只使用旧 workflow。
- 风险：自动打开编辑弹层时任务 segments 尚未加载。回滚方式：只在 segments 加载后打开，失败则停留在分镜板。
- 风险：不同模型对参考图数量支持不同。回滚方式：API 中保留裁剪和能力元数据，由 workflow 决定实际上传数量。

### POC 结果

- 已确认智能复刻页面、分镜板页面、图片编辑弹层均在 `digital_human_miniapp/taro/src/subpages/storyboard-board/index.tsx`。
- 已确认图片生成页已有 image2 相关模型调用链路，但模型列表缺少直接命名的 `image2`，需要补充默认项。
- 已确认现有分镜生图 workflow 使用 `product_image_url`、`character_image_url`、`reference_frame_url`，可通过新增字段保持向后兼容。

## 范围

- 小程序：`storyboard-board`、`image-generate` 页面与样式。
- API：`app/api/storyboard/[id]/generate-images/route.ts`。
- Workflow 快照：`workflows/storyboard_image_关键帧图片生成.json` 的输入整理与请求体说明。

## 分阶段里程碑

1. 文档与索引：新增本计划并更新 `docs/README.md`。
2. UI 链路：第二阶段按钮跳转到分镜板并自动打开图片编辑弹层。
3. 编辑弹层：增加返回图标、快捷按钮、默认参考图与默认提示词，修复输入唤起。
4. 生图适配：API 输出多参考图字段和模型能力字段，workflow 快照补充解析。
5. 验证：执行 lint、typecheck；小程序使用 weapp-dev-mcp 验证关键页面、日志和截图。

## 验收标准

- 智能复刻第二阶段按钮显示“替换产品/角色”，点击后进入图片编辑体验。
- 默认选中“换产品”，参考图默认带入用户此前提交的产品图，提示词为“请将分镜故事板的产品换成图1”。
- 切换“换角色”后提示词为“请替换分镜故事板中的角色”。
- 图片编辑弹层有返回图标，点击可关闭弹层。
- 输入提示词可正常唤起输入框和键盘。
- 图片模型包含 `image2` 且默认选中 `image2`。
- 生图 API payload 同时兼容旧字段和多图字段。

## Tech Debt

- `storyboard-board` 页面承担了拆解展示、分镜编辑、生成控制和智能复刻阶段流转，后续建议拆分为阶段组件和编辑弹层组件。
- 分镜生图 workflow 仍混合旧单图节点与新多图意图，后续应整理为“下载参考图数组 -> 组装模型请求”的通用子流程。
