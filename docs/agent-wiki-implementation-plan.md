# Agent + 文件树 Wiki（对齐 NexTide 思路）开发方案

## 1. 目标
在 `content-factory-web 3.2` 中实现一个单一 Agent：
- 基于文件树进行文档增删改查。
- 模型优先读取核心文档（AGENTS/SOUL/IDENTITY/MEMORY/USER/CLAUDE）。
- 避免一次性注入海量上下文，改为按需读取（read-first）。
- 首页与对话页交互统一，支持右侧文件树与 Markdown 浏览。

## 2. 与参考应用对齐方式（按本项目裁剪）
- 对齐：核心文档约束、文件树驱动、read-first 再回答、会话+历史。
- 裁剪：
  - 不接 GitHub。
  - 不做多助理切换（仅单 Agent）。
  - create/update/delete 仍走显式执行确认，自动链路只自动执行 read。

## 3. 架构设计
### 3.1 上下文策略（轻量）
每轮请求系统提示由以下部分组成：
1) 统一 Agent 指令
2) 回复协议（支持 `agent_actions`）
3) provider/model 上下文
4) 核心文档上下文（就近继承，强约束）
5) 当前选中文件上下文（`currentPath`）
6) 小型文件索引（近期/相关文件路径）
7) 技能上下文（启用技能）

### 3.2 read-first 两阶段推理
第一阶段：模型输出 `reply + agent_actions`。
- 若包含 `read`，后端执行 read（最多 N 个，路径白名单与长度限制）。

第二阶段：
- 将 read 结果追加为 `readResultsContext`，再次调用模型。
- 返回最终 `reply + agent_actions`。

说明：自动链路只执行 read；create/update/delete 由前端按钮触发 `/api/assistants/agent-actions/execute`。

## 4. 前端交互规范
### 4.1 首页
- 左上：新对话 + 历史。
- 右上：文件夹按钮，打开右侧文件树。
- 发送后保持首页会话态，不跳转。

### 4.2 对话页
- 布局与首页会话态一致：消息区无卡片包裹、底部输入区一致。
- 左上：返回、新对话、历史。
- 右上：文件夹按钮，打开右侧文件树。
- 右侧：文件树（可筛选）+ Markdown 预览（桌面侧栏 / 移动弹层）。

## 5. 已完成开发（当前批次）
### A. 后端主链路重构
- 文件：`app/api/assistants/chat/route.ts`
- 完成内容：
  - 移除旧的大块 knowledge chunk 注入路径。
  - 新增核心文档上下文 + 当前文件上下文 + 小型索引。
  - 新增 read-first 二阶段推理。
  - fastMode 改为保留轻量上下文与短消息窗口，不再只发最后一句。
  - 保留 NexAPI/Canvas provider 兼容。

### B. 对话页升级
- 文件：`app/(main)/chat/ChatPageContent.tsx`
- 完成内容：
  - 顶栏与首页会话态风格统一（左上新建/历史，右上文件夹）。
  - 右侧文件树与 Markdown 浏览能力。
  - 发送请求携带 `currentPath`，让后端按选中文件优先读取。
  - 底部输入区统一为首页同款固定面板。

## 6. 验收标准
1) 在任意会话中，先提问“请先读取 AGENTS.md 再回答”。
- 期望：响应更快，且输出带 read 计划/已读文件逻辑。
2) 选择某个 `.md` 文件后提问。
- 期望：模型回答应明显引用当前文件内容。
3) 不选文件时提问。
- 期望：模型基于核心文档+小索引，不会一次塞入大量内容。
4) create/update/delete。
- 期望：模型给出动作计划，点击“执行”后落库生效。

## 7. 下一阶段（建议）
1) 将首页与对话页抽出共享组件（Header/Composer/FilePanel），减少双端维护成本。
2) 增加 read 结果可视化（显示“本轮已读文件”）。
3) 增加轻量记忆文档（如 `MEMORY.md`）的自动更新策略与健康检查。
4) 增加链路指标：首 token 时间、read 次数、二阶段命中率。

## 8. 风险与边界
- read-first 是“近似 MCP”的后端编排，不是外部 MCP server 协议。
- 若文件树规模极大，需要后续增加目录级索引缓存，减少 DB 扫描成本。
- 超时问题仍与上游模型/网络质量相关，建议追加超时埋点与重试策略。
