# Canvas React Migration · Stage 0 Baseline

author: Codex · 2026-03-26
status: in-progress (Stage 0 complete)

> **2026-04-01 Update**：Vue iframe runtime (`modules/canvas-runtime` + `public/canvas-runtime`) 与 `CanvasAuthBridge` 已退役，React `ReactCanvasRoot` 现为唯一运行时。下方“Vue Runtime Inventory”保留作为历史基线，勿再按照其中的构建流程同步静态产物。

## 1. Vue Runtime Inventory

| Area | What Existed (已下线) | Notes |
| --- | --- | --- |
| 技术栈 | Vue 3 + Vite + Naive UI + Vue Flow-ish custom graph | 入口位于 `modules/canvas-runtime/src`，曾经打包到 `public/canvas-runtime/` 供 iframe 挂载；现已被 React 版 `ReactCanvasRoot` 取代。 |
| 核心节点 | `TextNode`, `ImageNode`, `VideoNode`, `AudioNode`, `LLMConfigNode` | 每个节点都实现“常态极简 + 选中展开”的折叠交互，顶部操作条 + 底部提示词/模型。 |
| 节点交互 | `NodeHandleMenu`, `WorkflowPanel`, `MentionsPicker`, `GlowSpinner` | 包含拖线触点、资源悬停面板、loading overlay（全局 10s 超时兜底）。 |
| 状态管理 | `stores/canvas.js`, `stores/projects.js`, `stores/resources.js` | 负责 nodes/edges、自动保存、防抖、undo/redo、资源库 CRUD、项目切换。 |
| API 适配 | `api/projects.js`, `hooks/useApi.js`, `hooks/useWorkflowOrchestrator.js` | 统一走 `/api/canvas/*`，Axios 默认 `baseURL=/api/canvas`，附带 Supabase token + cookie。 |
| 运行时协议 | `App.vue` -> `window.parent.postMessage({ type: 'canvas-enter|exit' })` | 供 Next.js 父壳决定是否隐藏 Sidebar。 |
| 音频工作流 | `hooks/useWorkflowOrchestrator.js`&`hooks/useAudioTask.js`（引用 RunningHub） | 使用用户提供的 workflowId、node overrides，串联上传资源与任务轮询。 |

### 1.1 依赖接口

- `/api/canvas/projects` + `/api/canvas/projects/:id`：项目 CRUD、保存 `canvasData { nodes, edges, viewport, resources }`。
- `/api/canvas/images/generations`、`/api/canvas/videos`, `/api/canvas/videos/:taskId`：图/视频生成与轮询。
- `/api/canvas/audio`（RuningHub ComfyUI 代理）。
- `/api/canvas/chat/completions`：文本/AI Agent 调用。
- 上传：`/api/upload/{image,video,audio}` 通过 resource library 复用。

### 1.2 功能特性

- 自动保存：`watch([nodes, edges, resourceLibrary], debouncedSave)`，500ms 防抖，失败即 toast。
- 历史：`history` + `historyIndex`，支持 undo/redo、批量操作标记。
- 资源库：`resourceLibrary` 支持音色/情感参考、上传、hover 即展示列表。
- 触点与拖线：每个节点常驻左右 handle，hover 才显，两侧对齐。
- 极简 UI：正常态只展示结果缩略图与标题，点击展开显示提示词、模型、AI 渲染区。
- 页面切换：React 运行时已在同一 Next.js 树中渲染；旧版 `CanvasAuthBridge` + iframe postMessage 逻辑随 runtime 下线而移除。

## 2. Next.js 宿主能力

- Next.js 16（App Router），React 18，Tailwind +自定义 CSS 变量，`lucide-react` 图标集。
- 已引入 `@xyflow/react`（React Flow v12）且存在旧版 `CanvasStudio`/`CanvasNode` 实现，可作为 React 画布的基线。
- 全局状态：尚未统一使用 Zustand/Redux，组件多靠 hooks/local state；`react-hot-toast` 用于全局提醒，`next-themes`、`Sidebar` 控制布局。
- Supabase auth：`lib/supabaseClient` + `AuthSessionSync` 继续工作，已不再需要 `CanvasAuthBridge` 桥接 iframe cookie。
- API：`app/api/canvas/*` + `lib/canvasProjects.ts` + `lib/canvasUpstream.ts`，数据库已有 `canvas_projects` 表。

**可复用资产**
- 服务器端：项目 CRUD、生成任务、RunningHub 代理都已接入 Next.js；React 重写只需继续调用现有 API。
- UI 组件：按钮、Modal、Sidebar、Glow Spinner（React 版 `components/AiGlowSpinner.tsx`）可复用主题。
- 包依赖：`@xyflow/react`、`framer-motion`、`tailwind-merge` 已在主项目中，无需新增大件。

## 3. 必须重写/替换的模块

| 模块 | Vue 里的现状 | React 迁移影响 |
| --- | --- | --- |
| 节点组件 | `.vue` 单文件组件复杂度高（包含模板/动画/拖线 handle/资源 hover） | 需用 React 重新实现，建议封装 `CanvasCard` + `NodeControls` + `PromptPanel` 组合，统一极简样式。 |
| Vue stores | 依赖 `ref`/`watch`/`computed` + 深度 watcher | 需改造成 React store（Zustand/Recoil/TanStack Query）以处理 nodes/edges/auto-save。 |
| Naive UI 组件 | 对话框、菜单、Popper | 需改为 Headless UI / Radix / 自研弹层；部分可借现有 `components/ConfirmModal`。 |
| iframe 协议 | 依赖 Vue runtime 的 postMessage | React 原生挂在 Next 页面后，可直接用 React state 控制 Sidebar，无需 iframe 协议，但为了灰度，需保留兼容层。 |
| Workflow hooks | `useWorkflowOrchestrator` 写成 Vue composable | 需移植为 React hooks，并与 TanStack Query 结合以做任务轮询。 |

## 4. 风险与注意点

1. **功能体量**：节点行为 + 触点交互近似一个 mini React Flow 封装，需要逐个迁移 UI 状态（折叠、hover、快捷操作）。
2. **自动保存频率**：需要延续 500ms 防抖 + 错误提示，避免 React 版本频繁触发 `/api/canvas/projects/:id`。
3. **资源/上传**：Vue 里对 dataURL/base64 有清理逻辑（存储前去掉 base64、maskData），迁移时必须沿用，否则数据库膨胀。
4. **音频工作流**：RunningHub 提交需要 `workflowId`, `nodeInfoList`、`apiKey`，并处理 webhook/poll；务必验证 React hook 的错误兜底。
5. **灰度策略**：迁移期间保留 iframe 作为 fallback，需提供 feature flag（例如 `?runtime=react`），并在 Sidebar 逻辑兼容两种模式。

## 5. Stage 1 Entry Checklist

- [x] 列出 Vue runtime 组件、store、接口依赖。
- [x] 盘点 Next.js 端现有能力及可复用资产。
- [x] 明确必须重写的模块与风险。
- [ ] （Stage 1）搭建 React 画布骨架：`/canvas` 路由里直接挂 React Flow，保留 iframe 灰度开关。
- [ ] （Stage 1）抽象共享 hooks：`useCanvasProjects`, `useCanvasResources`, `useCanvasModels`。

## 6. 建议的 Stage 1 工作包

1. **脚手架**：在 `app/(main)/canvas` 新增 `ReactCanvasRoot`（client component），注入 `@xyflow/react` 画布、Tailwind token、自适应主题。
2. **数据适配层**：把 `lib/canvasProjects.ts` + `/api/canvas/projects` 封装成 React hooks，提供 `loadProject`, `saveProject`, `autoSave`；沿用现有 API。
3. **UI 设计令牌**：抽离节点卡片的色彩、间距、触点尺寸到共享 CSS，保证与 Vue 极简稿一致，为后续迭代打底。
4. **渐进式开关**：在 `/canvas` 根据 query/string param 选择 React or iframe，方便对比验证。

> 交付物：本文件 `docs/06-canvas/canvas-react-migration-stage0.md`，作为后续阶段的共识底稿。
