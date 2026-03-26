# 无限画布升级蓝图（与内容工厂深度融合）

## 1. 当前现状（基于代码）

### 1.1 入口层分裂
- `/canvas` 页面当前是 iframe 挂载独立运行时：
  - `app/(main)/canvas/page.tsx`
  - 指向 `/canvas-runtime/`（`public/canvas-runtime` 构建产物）
- 同时仓库里还有一套 React 画布实现（未作为主入口）：
  - `app/(main)/canvas/components/CanvasStudio.tsx`
  - `app/(main)/canvas/components/CanvasNode.tsx`

### 1.2 执行链路分裂
- iframe 运行时（Vue）主要走 `/api/canvas/*` 代理层：
  - `app/api/canvas/chat/completions/route.ts`
  - `app/api/canvas/images/generations/route.ts`
  - `app/api/canvas/videos/route.ts`
  - `app/api/canvas/videos/[taskId]/route.ts`
  - 由 `lib/canvasUpstream.ts` 转发到外部上游
- React 画布（CanvasStudio）直接调用业务 API：
  - 生图：`/api/xhs-text2img/plan`
  - 复刻视频：`/api/replication/generate`
  - 轮询：`/api/creative-tasks/:id`、`/api/replication/:id`

### 1.3 任务模型分裂
- `creativeTask`（图文/创作链）
- `replication`（爆款复刻链）
- `storyboardTask/storyboardSegment`（分镜链）

结论：画布已有能力，但还没成为“统一编排中枢”。

---

## 2. 目标：升级为“创作操作系统（Creative OS）”

把无限画布从“一个功能页”升级为“统一任务编排层”：

1. **统一入口**
- 所有创作入口（首页快捷方式、分镜板、爆款复刻、图文生图）都能“进入画布编辑态”。

2. **统一执行内核**
- 统一 Node/Edge 执行协议，底层可路由到 n8n 或内部服务。

3. **统一任务与资产**
- 不再区分“这是 replication 任务”还是“storyboard 任务”，前台统一看成 `Graph Run` + `Asset`。

4. **统一策略与提示词**
- 用 `Recipe + PromptTemplate + ParamProfile` 配置化，不再散落在多条流程节点里。

---

## 3. 新系统架构（建议）

### 3.1 四层架构

1) **Canvas UX 层**
- 节点编排、版本回放、批量执行、协作注释

2) **Graph Orchestrator 层（新增）**
- 解析节点图（DAG）
- 调度执行、重试、并发控制、状态机
- 输出标准事件流（node_started/node_completed/node_failed）

3) **Capability Gateway 层（新增/抽离）**
- 文案、拆解、生图、生视频、图生视频
- 模型路由（yunwu/kie/其他）
- 成本与限流策略

4) **Infra 层（现有复用）**
- n8n 工作流
- 数据库（creativeTask/replication/storyboard）
- 存储（OSS/飞书/Supabase）

---

## 4. 你现有系统如何“紧密结合”

### 4.1 把现有业务流程映射为画布模板

1. 爆款复刻模板（hot_clone）
- 节点：脚本拆解 -> 卖点提取 -> 提示词生成 -> sora发起 -> 回调落库
- 直接复用你当前 n8n 四条链路

2. 分镜模板（storyboard）
- 节点：拆分分镜 -> 批量生图 -> 批量生视频 -> 合成/导出
- 复用现有 `storyboard` API + webhook

3. 首页快捷生图模板
- 节点：文本输入 -> 风格注入 -> 生图 -> 资产入库

### 4.2 统一“任务视图”

前端展示统一字段：
- `graph_run_id`
- `node_run_id`
- `status`
- `output_assets[]`
- `cost`
- `provider`

后台可继续分别写入 `creativeTask/replication/storyboardTask`，但通过 `graph_run_id` 关联。

---

## 5. 分阶段迁移（最稳妥）

## Phase 0（1-2周）：单入口与兼容层
- `app/(main)/canvas/page.tsx` 增加模式开关：
  - 新画布（React CanvasStudio）
  - 兼容画布（iframe canvas-runtime）
- 保留 iframe 作为兜底，不中断线上业务。

## Phase 1（2-3周）：统一执行 API
- 新增统一 API：
  - `POST /api/canvas/graph-runs`
  - `GET /api/canvas/graph-runs/:id`
  - `POST /api/canvas/node-runs/:id/retry`
- CanvasStudio 改为只调用统一 API，不再直连 `/api/xhs-text2img`、`/api/replication`。

## Phase 2（2-4周）：Recipe 化
- 把爆款复刻、分镜、首页生图都沉淀成 Recipe。
- 把提示词抽到模板仓（你已经在 n8n 里开始做了）。

## Phase 3（持续）：统一数据模型
- 增加 `canvas_graph_runs`、`canvas_node_runs`、`canvas_assets`。
- 对旧表建立映射，逐步去“按业务硬拆表”。

---

## 6. 你现在就能做的关键动作（高收益）

1. 选定“单一主画布实现”
- 建议 React CanvasStudio 作为主实现（与 Next.js 同栈）。
- Vue runtime 作为兼容模式保留 1-2 个版本周期。

2. 把 CanvasStudio 的调用改为统一 `/api/canvas/*`
- 避免前端直接知道 `xhs-text2img`、`replication` 的业务细节。

3. 把爆款复刻做成画布模板（第一条模板）
- 可直接复用你已改造的 prompt/recipe 思路。

4. 统一 webhook 事件入总线
- 回调接口写入统一事件表，前端画布按 node_run_id 实时更新。

---

## 7. 成功标准（验收）

满足以下 5 条即表示“全新系统”成型：

1. 首页快捷生图、分镜、爆款复刻都能在画布里一键打开并继续编辑。  
2. 新任务统一通过 Graph Run 创建与追踪。  
3. 提示词修改无需改 n8n 节点代码（仅改模板配置）。  
4. 回调只对接一个统一事件协议。  
5. 画布模板新增一个业务流无需新增一套前后端页面。  

