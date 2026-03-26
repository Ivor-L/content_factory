## 无限画布节点统一改造方案

### 目标
- 画布上的每个节点仅以单卡片形式展示内容，标题悬浮在卡片外部。
- 提示词、模型、资源库、生成按钮等全部进入节点的展开面板，默认收起，点击节点时展开。
- 图像/视频/音频节点不再拆分配置节点与结果节点，统一在一个节点内处理 `settings + result`。
- 拖线、菜单、资源悬停等交互与参考稿保持一致。

### 数据与状态
1. `stores/canvas.js`
   - 节点默认 `expanded: false`，`data` 中新增 `settings`、`result`。
   - `focusNode` / `collapseAllNodes` 负责展开/收起节点与面板。
   - 加载/保存项目时同步 `settings`、`result`，确保刷新后默认收起。
2. `stores/panels.ts`（新增）
   - 管理当前展开的面板：`activeNodeId`、`floatingPanels[]`、`panelPositions`。
   - 提供 `openPanel(nodeId)`、`closePanel(nodeId)`、`closeAllPanels()` API，并由 `focusNode` 调用。

### 组件架构
1. 通用组件
   - `NodeTitleBadge`：标题 + 图标 + 状态，绝对定位。
   - `NodeCardShell`：collapsed 内容容器。
   - `NodeControlPanel`：展开面板，包含顶部按钮区 / 输入表单区 / 底部状态栏；节点通过 slot 注入各自的表单。
2. 节点组件
   - Text、Image、Video、Audio（以及 storyboard 等）全部重写为“卡片 + 面板”结构。
   - Collapsed：仅显示内容（文本摘要、图片/视频缩略图、音频封面）和状态徽章；无按钮。
   - Expanded：面板中包含提示词编辑、模型选择、资源库 hover 区、生成按钮、下载/替换、任务状态等。

### 工作流与 Hook
1. `useWorkflowOrchestrator`
   - `executeTextToImage` / `executeTextToImageToVideo` 等只创建一个复合节点，并写入 `settings`（prompt、模型等）与 `result`。
   - 删除 `imageConfig`、`videoConfig` 等中间节点逻辑，改为在节点内部执行。
   - 新增 `waitForNodeResult(nodeId)`，检测 `data.result`。
2. API Hooks (`useImageGeneration` / `useVideoGeneration` / `useAudioGeneration`)
   - 接收 `settings`，生成后直接更新节点的 `data.result`。
   - 面板调用 hooks 以提交参数并刷新 store。

### 交互与样式
1. 样式
   - 深色背景，卡片圆角 18~20px，Collapsed 状态半透明 + 细边，Expanded 状态带阴影。
   - 面板独立深灰块，顶部按钮为图标方块，底部显示模型标签、时长等信息。
2. 交互
   - 点击卡片 -> `focusNode` -> `openPanel`；点击空白或 Esc -> `closePanel`。
   - 拖线 handle 仅在展开状态出现；拖线松手弹出 `NodeHandleMenu`。
   - 资源悬停 (`ResourceHoverList`) 仅在面板中展示。
   - 支持打开多个面板（可配置），面板位置存储在 `panels` store。

### 实施顺序
1. **基础设施**
   - 新建 `NodeTitleBadge`、`NodeCardShell`、`NodeControlPanel`，更新 `stores/canvas` & 新建 `stores/panels.ts`。
2. **节点重构**
   - 按 Text → Image → Video → Audio 顺序实现单卡片 + 面板结构。
   - 删除 `ImageConfigNode.vue`、`VideoConfigNode.vue` 及引用；更新 `ImageNode.vue`、`VideoNode.vue` 数据结构。
3. **工作流/Hooks**
   - 改造 `useWorkflowOrchestrator`、`useImage/Video/AudioGeneration` 以适配新架构。
4. **交互完善**
   - `Canvas.vue`：点击/拖线/面板管理逻辑；`NodeHandleMenu` 只在展开时启用。
5. **样式统一与构建**
   - Tailwind/全局 CSS 中定义新卡片样式；跑 `npm run build` 并同步 `public/canvas-runtime/`。

### 任务拆分
| 编号 | 任务 | 说明 |
| --- | --- | --- |
| T1 | 建立 Panel 管理与通用组件 | 新建 `stores/panels.ts`，实现 `NodeTitleBadge`、`NodeCardShell`、`NodeControlPanel` |
| T2 | Text 节点重构 | 改为单卡片 + 面板，集成 contenteditable、AI 润色 |
| T3 | Image 节点重构 | 合并配置与结果、接入资源库面板、写入 `settings/result` |
| T4 | Video 节点重构 | 合并配置与结果、面板包含模型/比例/文案 |
| T5 | Audio 节点调优 | 调整为统一卡片样式，面板包含口播文本/音色/生成 |
| T6 | 工作流与 Hooks | 更新 `useWorkflowOrchestrator`、生成 hooks、新节点创建逻辑 |
| T7 | Canvas 交互与 Handle 菜单 | 点击/展开/拖线行为、面板定位、资源 hover 复用 |
| T8 | 样式细化与构建 | 统一深色主题、面板样式，`npm run build`，同步 `public/canvas-runtime/` |

完成上述任务后，画布即呈现参考图中“单卡片 + 下方展开面板”的极简形态。

### 2026-03-25 进度快照
- ✅ **视频节点合并**：`modules/canvas-runtime/src/components/nodes/VideoNode.vue` 已切换为单卡片 + 面板结构，集成提示词、模型、资源库与生成流程，支持从工作流自动触发。
- ✅ **Runtime 构建同步**：执行 `npm run build` 并将 `modules/canvas-runtime/dist` 产物回填至 `public/canvas-runtime/`，以便 Next.js 端载入最新前端。
- ✅ **文本节点极简化**：更新 `TextNode.vue`，折叠态仅保留 “PROMPT / 点击展开以输入提示词 / X 字” 三行信息，面板中只剩更宽的编辑器与复制/删除按钮，去除 AI 润色与冗余提示，交互与参考稿保持一致。
- ✅ **节点触点固定**：Text/Image/Video/Audio 节点都引入 anchor 容器，进出面板时左右黄点（连接 handle）保持贴合卡片两侧，不再随面板位置漂移。
- ✅ **首尾帧资源可视化**：视频节点面板新增首帧/尾帧 `ResourceHoverList`，支持悬停选择或上传参考图，生成参数会自动引用 `first_frame_image/last_frame_image`。
- ⏳ **统一交互延伸**：后续需将同款拖线菜单与资源悬停面板复用到视频/音频以外的节点，并按 T7/T8 清单持续收敛。
