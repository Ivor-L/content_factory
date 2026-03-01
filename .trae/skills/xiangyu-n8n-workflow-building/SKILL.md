---
name: xiangyu-n8n-workflow-building
description: |
  n8n 工作流构建流水线，10 步完成：需求获取 -> 互联网检索 -> 方案讨论 -> 知识库查询 -> 架构设计 ->
  工作流构建 -> 凭据配置 -> 验证修复 -> 部署激活 -> 输出 JSON。基于 n8n-mcp MCP Server。
  当用户说「n8n 工作流」「构建 n8n」「n8n workflow」时触发。
---

# n8n 工作流构建流水线

10 步端到端构建：从需求获取到输出可用的 n8n 工作流 JSON + 部署到 n8n 实例。

> **设计理念**：不是知识查询工具，而是完整的构建流水线。reference/ 仅在步骤文档指引时按需读取。

---

## 触发条件

| 关键词 | 动作 |
|--------|------|
| 「n8n 工作流」「构建 n8n」 | 执行完整 10 步流水线 |
| 「n8n workflow」「创建 n8n」 | 执行完整 10 步流水线 |

---

## 执行模式

| 选项 | 说明 |
|------|------|
| 自动执行 | 触发后自动执行全流程，完成后报告结果 |

---

## 前置依赖

- **n8n-mcp** MCP Server（详见 `docs/setup.md`）
- n8n 实例运行中（本地或远程）

---

## 执行规范（必须遵守）

1. **先读后做**：执行 Step N 前，先 Read `workflow/stepN-*.md`
2. **不跳步骤**：必须按 1->2->3->4->5->6->7->8->9->10 顺序执行
3. **按需读参考**：`reference/` 文件仅在步骤文档指引时读取
4. **互联网检索**：Step 02 使用 brave_web_search 检索 + WebFetch 深度抓取高价值原文（串行，>=2s 间隔）
5. **方案必须用户确认**：Step 03 方案必须经用户确认后才能进入后续步骤
6. **凭据配置**：Step 07 通过 n8n REST API（n8n-mcp 不支持凭据操作）
7. **验证循环**：Step 08 最多 10 轮
8. **搜索增强**：修复失败时 brave_web_search（串行，>=2s 间隔），round 2 即触发搜索（invalid_value / missing_required）
9. **10 轮终止**：输出终止报告 + 可行方案
10. **双输出**：部署到 n8n + 导出 JSON 到本地
11. **逐步验证**：每步完成后检查输出是否符合预期
12. **状态持久化**：每步完成后更新 `state/progress.json`，确保断点可恢复
13. **社区节点前置检查**：Step 06 构建完成后检查安装状态（REST API 或降级手动提示）

---

## runs/ 目录结构

每次执行创建独立运行目录：

```
runs/{keyword}-{YYYYMMDD-HHMMSS}/
├── state/                    # 【固定】进度状态
│   ├── config.json           # 用户配置
│   └── progress.json         # 进度 + 恢复提示
├── step02-research/          # 【动态】互联网检索产物
│   └── research.md           # 检索报告
├── step05-design/            # 【动态】架构设计产物
│   └── design.md             # 设计稿
└── output/                   # 【固定】最终输出
    ├── {workflow_name}.json   # 工作流 JSON
    └── report.md              # 部署报告
```

> **有目录输出的步骤**：Step 01（`state/`）、Step 02（`step02-research/`）、Step 05（`step05-design/`）、Step 10（`output/`）。
> 其余步骤的产物在内存或 n8n 实例上，通过 progress.json 中的 workflow_id 引用。

---

## 工作流（10 步）

| Step | 职责 | 指令文件 | 输入 | 输出 |
|------|------|----------|------|------|
| 01 | 需求获取 + 初始化 | step01-requirements.md | 用户触发 | state/ |
| 02 | 互联网最佳实践检索 | step02-research.md | config.json | step02-research/ |
| 03 | 方案讨论 + 用户确认 | step03-discuss.md | research.md + config | config.json（更新） |
| 04 | 知识库查询 | step04-knowledge.md | config.json | - |
| 05 | 架构设计 | step05-design.md | config + confirmed_plan + 知识 | step05-design/ |
| 06 | 工作流构建 | step06-build.md | design.md | - |
| 07 | 凭据配置 | step07-credentials.md | progress.json | - |
| 08 | 验证修复 | step08-validate.md | progress.json | - |
| 09 | 部署激活 | step09-deploy.md | progress.json | - |
| 10 | 输出导出 | step10-output.md | progress.json | output/ |

---

## 数据流

```
用户触发
  |
  v Step 01: 需求获取 -> config.json + progress.json
  v Step 02: 互联网检索 -> research.md（brave 3 轮 + WebFetch 深度抓取 + 交叉验证 + search_nodes + search_templates 3 轮 + 模板 diff）
  v Step 03: 方案讨论 -> 用户确认（含"使用模板"快速路径 → 跳至 Step 07）
  v Step 04: 知识库查询 -> 内存提取（基于 confirmed_plan 调整策略）
  v Step 05: 架构设计 -> design.md（基于 confirmed_plan + 知识）
  v Step 06: 工作流构建 -> workflow_id
  v Step 07: 凭据配置 -> 扫描->查询->创建->绑定（无需求则跳过）
  v Step 08: 验证修复 -> reference/ + 互联网搜索（最多 10 轮）
  v Step 09: 部署激活 -> activate + 首次执行检查
  v Step 10: 输出导出 -> JSON + 报告
```

---

## MCP 工具声明

本 Skill 依赖 **n8n-mcp** MCP Server 提供的 19 个工具：

### 节点发现

| 工具 | 用途 |
|------|------|
| `n8n_search_nodes` | 按关键词搜索可用节点 |
| `n8n_get_node` | 获取节点完整属性定义 |

### 模板发现与部署

| 工具 | 用途 |
|------|------|
| `n8n_search_templates` | 搜索 n8n 模板库（5 种模式：keyword / by_nodes / by_task / by_metadata / by_filter） |
| `n8n_get_template` | 获取模板详情（nodes_only / structure / full） |
| `n8n_deploy_template` | 一键部署模板到实例（自动修复 + 版本升级） |

### 工作流管理

| 工具 | 用途 |
|------|------|
| `n8n_list_workflows` | 列出所有工作流 |
| `n8n_get_workflow` | 获取工作流完整 JSON |
| `n8n_create_workflow` | 创建新工作流 |
| `n8n_update_workflow` | 全量更新工作流 |
| `n8n_update_partial_workflow` | 增量更新工作流（推荐） |
| `n8n_delete_workflow` | 删除工作流 |
| `n8n_activate_workflow` | 激活工作流 |
| `n8n_deactivate_workflow` | 停用工作流 |

### 验证与执行

| 工具 | 用途 |
|------|------|
| `n8n_validate_workflow` | 验证工作流配置有效性 |
| `n8n_execute_workflow` | 执行工作流（测试用） |
| `n8n_get_execution` | 获取执行结果 |

### 工程工具

| 工具 | 用途 |
|------|------|
| `n8n_autofix_workflow` | 自动修复工作流（preview / apply） |
| `n8n_workflow_versions` | 工作流版本管理（list / get / rollback） |
| `n8n_health_check` | n8n 实例健康检查 |

---

## 参考资料

| 目录 | 路径 | 内容 | 文件数 |
|------|------|------|--------|
| 凭据 | `credentials/` | n8n 连接凭据（实例 URL / API Key / Session Cookie） | 1 |
| MCP 工具 | `reference/tools/` | 工具使用全指南 | 4 |
| 架构模式 | `reference/patterns/` | 7 种核心模式 + 编排模式 + 总览 | 8 |
| JS 代码 | `reference/code/javascript/` | Code 节点 JS 编程 + 生产级模式 | 6 |
| Python 代码 | `reference/code/python/` | Code 节点 Python 编程 | 5 |
| 验证规则 | `reference/rules/` | 错误目录 + 误报 + 验证指南 + 模式清单 | 4 |
| 节点/语法 | `reference/specs/` | 节点配置 + 表达式语法 + 工程规范 + RAG 配置 | 8 |
| 社区节点 | `docs/community-nodes.md` | 社区节点安装方式、平台差异、REST API 参考（Step 06/08 自动调用） | 1 |
| 维护指南 | `docs/maintenance.md` | 维护者用：节点目录重建 + 版本同步（含 Catalog Builder） | 1 |
| 构建脚本 | `scripts/` | Catalog 生成工具（维护者用，详见 `docs/maintenance.md`） | 2 |

### 参考资料速查

| 需求场景 | 读取文件 |
|----------|----------|
| 选择工作流架构 | `reference/patterns/workflow-patterns.md` |
| Form 表单模式 | `reference/patterns/form-trigger.md` |
| Webhook 模式 | `reference/patterns/webhook-processing.md` |
| HTTP API 集成 | `reference/patterns/http-api-integration.md` |
| 数据库操作 | `reference/patterns/database-operations.md` |
| AI Agent 模式 | `reference/patterns/ai-agent-workflow.md` |
| 定时任务 | `reference/patterns/scheduled-tasks.md` |
| MCP 工具用法 | `reference/tools/mcp-tools-expert.md` |
| 节点搜索策略 | `reference/tools/search-guide.md` |
| 工作流创建/更新 | `reference/tools/workflow-guide.md` |
| 验证操作 | `reference/tools/validation-guide.md` |
| 验证错误解读 | `reference/rules/validation-expert.md` |
| 错误编号速查 | `reference/rules/error-catalog.md` |
| 误报处理 | `reference/rules/false-positives.md` |
| 节点配置 | `reference/specs/node-configuration.md` |
| 节点依赖关系 | `reference/specs/node-dependencies.md` |
| 节点操作模式 | `reference/specs/node-operation-patterns.md` |
| 表达式语法 | `reference/specs/expression-syntax.md` |
| 表达式常见错误 | `reference/specs/expression-mistakes.md` |
| 表达式示例 | `reference/specs/expression-examples.md` |
| JS Code 节点 | `reference/code/javascript/code-javascript.md` |
| JS 数据访问 | `reference/code/javascript/data-access.md` |
| JS 常见模式 | `reference/code/javascript/common-patterns.md` |
| JS 错误模式 | `reference/code/javascript/error-patterns.md` |
| JS 内置函数 | `reference/code/javascript/builtin-functions.md` |
| Python Code 节点 | `reference/code/python/code-python.md` |
| Python 数据访问 | `reference/code/python/data-access.md` |
| Python 常见模式 | `reference/code/python/common-patterns.md` |
| Python 错误模式 | `reference/code/python/error-patterns.md` |
| Python 标准库 | `reference/code/python/standard-library.md` |
| 社区节点管理 + REST API | `docs/community-nodes.md` |
| 编排模式（批处理/轮询/子工作流） | `reference/patterns/orchestration-patterns.md` |
| 工程规范（参数容器/命名/StickyNote） | `reference/specs/workflow-conventions.md` |
| 生产级 Code 模式 | `reference/code/javascript/production-patterns.md` |
| RAG 向量数据库配置 | `reference/specs/vector-store-config.md` |
| 模式验证清单 | `reference/rules/pattern-checklist.md` |

---

## 3 种编排模式

| 模式 | 使用频率 | 典型场景 |
|------|---------|----------|
| Split-Process-Aggregate | 16/23 工作流 | 批量数据处理、避免 API 限速 |
| 异步轮询 (Wait+Poll+IF) | 5/23 工作流 | 视频生成、文件转换等异步任务 |
| 子工作流 (executeWorkflow) | 4/23 工作流 | 复杂逻辑拆分、子流程复用 |

> **详细配置**：`reference/patterns/orchestration-patterns.md`

---

## 6 种核心架构模式

| 模式 | 触发方式 | 典型场景 |
|------|---------|----------|
| Form 表单 + 完成页（推荐） | Web 表单 | 收集用户输入 -> 处理 -> 完成页展示结果 |
| Webhook 处理 | HTTP 请求 | 接收外部系统回调 -> 处理 -> 响应 |
| HTTP API 集成 | 手动/定时 | 调用 REST API -> 转换 -> 存储 |
| 数据库操作 | 任意 | 读写同步数据库 |
| AI Agent | 任意 | AI 代理 + 工具 + 记忆 |
| 定时任务 | Cron/间隔 | 调度 -> 执行 -> 通知 |

---

## 禁止事项

| 禁止 | 原因 |
|------|------|
| 触发后立即读取全部 `reference/` | 浪费 token，违反渐进披露 |
| 跳过 Step 01 直接构建 | 缺少需求分析，构建质量无法保证 |
| 跳过互联网检索直接设计 | 必须经过 Step 02 检索业界最佳实践 |
| 跳过方案讨论直接设计 | 必须经过 Step 03 用户确认方案 |
| 部署前不验证 | 必须 validate 通过才能部署 |
| 验证有 Error 就跳过 | 必须循环到 0 Error |
| 只部署不输出 JSON | 必须双输出：n8n 部署 + 本地 JSON |
| 只输出 JSON 不部署 | 必须双输出：n8n 部署 + 本地 JSON |
| 步骤完成不更新 progress.json | 断点恢复依赖 progress.json |
| 在工作流 JSON 中硬编码 API Key | 必须通过 n8n 凭据系统 |
| 凭据操作使用 n8n-mcp | 不支持，必须用 REST API |
| 验证循环超过 10 轮 | 必须终止并输出报告 |
