# Step 01: 需求获取 + 初始化

> **执行者**: 主Agent
> **输入**: 用户触发
> **输出**: `state/config.json` + `state/progress.json`

---

## 执行说明

通过 AskUserQuestion 收集用户的工作流需求，提取 keyword，创建 runs 目录并初始化状态文件。

### AskUserQuestion 调用

```python
AskUserQuestion(
    questions=[
        {
            "question": "请选择工作流类型？",
            "header": "工作流类型",
            "multiSelect": False,
            "options": [
                {"label": "Form 表单提交 (Recommended)", "description": "原生 Web 表单 → 处理 → 表单完成页展示结果（最佳用户体验）"},
                {"label": "Webhook HTTP 请求", "description": "接收外部系统 HTTP 回调 → 处理 → 响应"},
                {"label": "AI Agent 对话", "description": "AI 代理 + 工具调用 + 记忆"},
                {"label": "定时任务", "description": "Cron/间隔调度 → 执行 → 通知"}
            ]
        },
        {
            "question": "请描述业务逻辑（做什么、输入输出是什么）？",
            "header": "业务逻辑",
            "multiSelect": False,
            "options": [
                {"label": "数据同步", "description": "从 A 系统同步数据到 B 系统"},
                {"label": "消息通知", "description": "触发条件满足时发送通知"},
                {"label": "数据处理", "description": "接收数据 → 转换 → 存储"}
            ]
        },
        {
            "question": "涉及哪些外部服务？",
            "header": "外部服务",
            "multiSelect": True,
            "options": [
                {"label": "数据库", "description": "MySQL / PostgreSQL / MongoDB"},
                {"label": "消息服务", "description": "Slack / Telegram / Email"},
                {"label": "云服务", "description": "AWS / GCP / Cloudflare"},
                {"label": "AI 服务", "description": "OpenAI / Anthropic / 本地模型"}
            ]
        },
        {
            "question": "给工作流起个名字？（用于目录命名和 n8n 显示名）",
            "header": "工作流命名",
            "multiSelect": False,
            "options": [
                {"label": "自动生成", "description": "根据业务描述自动生成名称"},
                {"label": "自定义名称", "description": "输入自定义的工作流名称"}
            ]
        }
    ]
)
```

### 需求解析

从用户回答中提取：

| 字段 | 来源 | 示例 |
|------|------|------|
| `workflow_type` | 问题 1 | `"webhook"` |
| `business_logic` | 问题 2 | `"接收 GitHub webhook → 解析 → 发送 Slack 通知"` |
| `external_services` | 问题 3 | `["消息服务"]` |
| `needs_code_node` | 推断 | `true`（复杂数据转换时） |
| `needs_database` | 推断 | `false` |
| `response_mode` | 推断 | `"lastNode"`（需等待结果）/ `"onReceived"`（立即确认） |
| `workflow_name` | 问题 4 | `"GitHub Webhook Slack Notifier"` |

### 类型映射

| 用户选择 | workflow_type | 对应模式文档 |
|---------|--------------|-------------|
| Form 表单提交 | `form_trigger` | `reference/patterns/form-trigger.md` |
| Webhook HTTP 请求 | `webhook` | `reference/patterns/webhook-processing.md` |
| HTTP API 集成 | `http_api` | `reference/patterns/http-api-integration.md` |
| AI Agent 对话 | `ai_agent` | `reference/patterns/ai-agent-workflow.md` |
| 定时任务 | `scheduled` | `reference/patterns/scheduled-tasks.md` |
| 数据库（Other） | `database` | `reference/patterns/database-operations.md` |

---

## keyword 提取与标准化

从 `workflow_name` 提取 keyword，规则：

1. 转小写
2. 空格 / 下划线 / 点 → 连字符
3. 去除非字母数字连字符
4. 连续连字符合并
5. 最多 32 字符

| 用户输入 | keyword |
|---------|---------|
| "GitHub Webhook Slack 通知" | `github-webhook-slack` |
| "fal.ai 视频生成" | `fal-video-gen` |
| "AI Agent 客服" | `ai-agent-chatbot` |

若用户选择「自动生成」，从 business_logic 中提取关键词组合。

---

## runs 初始化

### 创建目录

```
{skill_dir}/runs/{keyword}-{YYYYMMDD-HHMMSS}/
├── state/
├── step02-research/
├── step05-design/
└── output/
```

其中 `{skill_dir}` = `~/.claude/skills/xiangyu-n8n-workflow-building`。

### 写入 state/config.json

```json
{
  "keyword": "fal-video-gen",
  "workflow_name": "fal.ai Video Generator",
  "workflow_type": "form_trigger",
  "response_mode": "lastNode",
  "business_logic": "表单输入 prompt → 调用 fal.ai 生成视频",
  "external_services": ["AI 服务"],
  "needs_code_node": false,
  "needs_database": false,
  "created_at": "2026-02-10T14:30:00+08:00"
}
```

### 初始化 state/progress.json

```json
{
  "keyword": "fal-video-gen",
  "keyword_raw": "fal.ai Video Generator",
  "mode": null,
  "created_at": "2026-02-10T14:30:00+08:00",
  "updated_at": "2026-02-10T14:30:00+08:00",
  "step": "step01-requirements",
  "step_status": {
    "step01-requirements": "completed",
    "step02-research": "pending",
    "step03-discuss": "pending",
    "step04-knowledge": "pending",
    "step05-design": "pending",
    "step06-build": "pending",
    "step07-credentials": "pending",
    "step08-validate": "pending",
    "step09-deploy": "pending",
    "step10-output": "pending"
  },
  "directories": ["step02-research", "step05-design"],
  "workflow_id": null,
  "workflow_url": null,
  "validation_rounds": 0,
  "恢复提示": {
    "resume": "Step 01 完成，需求已确认，进入 Step 02 互联网最佳实践检索"
  }
}
```

---

## 验证检查点

| 编号 | 检查项 | 通过标准 |
|------|--------|----------|
| 1a | workflow_type 已确定 | 值属于 6 种类型之一 |
| 1b | business_logic 非空 | 用户描述了具体业务 |
| 1c | external_services 已识别 | 至少列出涉及的服务 |
| 1d | keyword 已提取 | 符合命名规范（小写、连字符） |
| 1e | runs 目录已创建 | state/、step02-research/、step05-design/、output/ 四目录存在 |
| 1f | config.json 已写入 | 所有字段完整 |
| 1g | progress.json 已初始化 | step01 标记 completed |

---

## 下一步

-> `Step 02: 互联网最佳实践检索`
