# n8n Skill 维护指南

> **用途**：维护者工具。n8n 升级后重建节点目录索引、同步版本号，日常使用 Skill 无需操作。

---

## 何时需要维护

| 场景 | 操作 |
|------|------|
| n8n 源码 `git pull` 拉取新提交 | 全流程（Step 1-5） |
| n8n 实例版本升级 | 全流程（Step 1-5） |
| MCP `get_node` 返回的 defaultVersion 与 reference 不一致 | Step 2-5 |
| catalog 文件丢失（`reference/catalog/` 下文件被删除） | Step 1.5 |
| 首次部署 Skill（新环境没有预生成 catalog） | Step 1.5 |

---

## 前置条件

| 条件 | 检查方式 |
|------|----------|
| Node.js 18+ | `node -v` |
| n8n 源码已构建 | `ls $N8N_ROOT/packages/nodes-base/dist/known/nodes.json` |

n8n 源码默认路径：`<N8N_SOURCE_PATH>`

如果 n8n 在其他位置，设置环境变量：`N8N_ROOT=/your/path/to/n8n`

**相关文件路径**：

| 项目 | 路径 |
|------|------|
| n8n 源码 | `<N8N_SOURCE_PATH>/` |
| 节点目录 | `packages/nodes-base/nodes/` |
| Skill reference | `~/.claude/skills/xiangyu-n8n-workflow-building/reference/` |
| 版本对照表 1 | `reference/specs/node-configuration.md`（"Node Default Versions" 表格） |
| 版本对照表 2 | `reference/tools/mcp-tools-expert.md`（"Mistake 2" 简表） |
| Catalog Builder | `~/.claude/知识库/脚本/n8n-catalog-builder/build.sh` |
| 节点目录索引 | `reference/catalog/nodes-catalog.md`（434 节点全量索引） |
| 凭证映射 | `reference/catalog/credentials-map.md`（385 种凭证） |

---

## 完整流程

### Step 1: 安全更新源码

```bash
cd <N8N_SOURCE_PATH>
git stash push -m "local-$(date +%Y%m%d)" --include-untracked
git fetch origin master && git merge origin/master --ff-only
head -3 package.json        # 确认新版本号
git log --oneline -5         # 确认最新提交
git stash pop                # 恢复本地改动
```

### Step 1.5: 重建节点目录索引（Catalog Builder）

从 n8n 源码 `dist/` 提取节点目录索引 + 凭证映射，生成 Skill 运行时使用的 catalog 文件。

```bash
# 确认 dist/ 目录存在（源码 pull 后可能需要重新构建）
ls <N8N_SOURCE_PATH>/packages/nodes-base/dist/known/nodes.json
# 如果不存在：cd <N8N_SOURCE_PATH> && pnpm build

# 运行 catalog builder 重新生成
zsh scripts/catalog-build.sh

# 或指定自定义 n8n 路径
N8N_ROOT=/path/to/n8n zsh scripts/catalog-build.sh
```

**输出文件**：

| 文件 | 路径 | 内容 |
|------|------|------|
| nodes-catalog.md | `reference/catalog/nodes-catalog.md` | 540 节点索引（含 AI 节点） |
| credentials-map.md | `reference/catalog/credentials-map.md` | 411 种凭证映射 |

**数据来源**：

| 包 | 路径 | 节点数 |
|----|------|--------|
| nodes-base | `packages/nodes-base/dist/known/` | 434 |
| @n8n/nodes-langchain | `packages/@n8n/nodes-langchain/dist/known/` | 106 |

**验证输出**：
- `reference/catalog/nodes-catalog.md` 节点数量是否增减
- `reference/catalog/credentials-map.md` 凭证数量是否变化
- 与前版 diff 确认变更内容

### Step 2: 提取所有节点版本

两种版本定义模式需同时覆盖：

```bash
BASE=<N8N_SOURCE_PATH>/packages/nodes-base/nodes
NODES=(
  "Form/FormTrigger"
  "Form/Form"
  "HttpRequest/HttpRequest"
  "If/If"
  "Switch/Switch"
  "Code/Code"
  "Webhook/Webhook"
  "Set/Set"
  "Merge/Merge"
  "Schedule/ScheduleTrigger"
  "ExecuteWorkflow/ExecuteWorkflow/ExecuteWorkflow"
  "RespondToWebhook/RespondToWebhook"
)
for node in "${NODES[@]}"; do
  echo "=== $(basename $node) ==="
  grep -n "defaultVersion\|version:.*\[" "${BASE}/${node}.node.ts" 2>/dev/null | grep -v displayOptions
done
```

### Step 3: 对比 Diff

逐一比较 Step 2 输出与 reference 文档中的版本号：

- 版本号升高 → 需更新 reference
- 版本列表变化 → 需更新 reference
- 无变化 → 跳过

### Step 4: 更新 reference 文档

**同步更新两份文件**：

1. `node-configuration.md` — 完整表（含版本列表 + 关键变更）
2. `mcp-tools-expert.md` — 简表（仅 nodeType + defaultVersion）

两表的 defaultVersion 必须完全一致。

### Step 5: MCP 交叉验证

用 n8n-mcp 的 `get_node` 验证实例实际返回的版本：

```javascript
get_node({nodeType: "nodes-base.httpRequest", mode: "versions"})
```

逐一检查 12 个核心节点，确认源码 → reference → MCP 三方一致。

---

## 当前版本对照表

> 基准：n8n v2.7.0 | commit `06e48e5b3b` | 2026-02-11

| 节点 | nodeType | defaultVersion | 版本列表 |
|------|----------|----------------|----------|
| Form Trigger | `formTrigger` | **2.5** | 2, 2.1, 2.2, 2.3, 2.4, 2.5 |
| Form (Ending) | `form` | **2.5** | 1, 2.3, 2.4, 2.5 |
| HTTP Request | `httpRequest` | **4.4** | 1…4.4 |
| IF | `if` | **2.3** | 1, 2, 2.1, 2.2, 2.3 |
| Switch | `switch` | **3.4** | 1…3.4 |
| Code | `code` | **2** | 1, 2 |
| Webhook | `webhook` | **2.1** | 1, 1.1, 2, 2.1 |
| Set | `set` | **3.4** | 1, 2, 3…3.4 |
| Merge | `merge` | **3.2** | 1, 2, 2.1, 3…3.2 |
| Schedule Trigger | `scheduleTrigger` | **1.3** | 1, 1.1, 1.2, 1.3 |
| Execute Workflow | `executeWorkflow` | **1.3** | 1, 1.1, 1.2, 1.3 |
| Respond to Webhook | `respondToWebhook` | **1.5** | 1…1.5 |

---

## 验证 Checklist

同步完成后逐项确认：

- [ ] n8n 源码 `git log --oneline -1` 显示最新 commit
- [ ] `build.sh` 已运行，catalog 文件已重新生成
- [ ] catalog 节点数量与 `dist/known/nodes.json` 一致
- [ ] 12 个核心节点版本号已从源码提取
- [ ] `node-configuration.md` 完整表已更新
- [ ] `mcp-tools-expert.md` 简表已更新
- [ ] 两份表的 defaultVersion 完全一致
- [ ] MCP `get_node` 返回值与 reference 一致（可选，需 n8n 实例在线）
- [ ] 本指南的"当前版本对照表"已更新（含新 commit hash）
- [ ] 变更日志已追加新条目

---

## 参考

### nodeType 格式

catalog 中的 nodeType 列使用 **MCP 工具格式**，可直接用于 `get_node` 调用：

| 包 | 格式 | 示例 |
|----|------|------|
| nodes-base | `nodes-base.{key}` | `nodes-base.slack` |
| nodes-langchain | `nodes-langchain.{key}` | `nodes-langchain.agent` |

### 版本定义模式速查

**模式 A: VersionedNodeType（多版本文件）**

```typescript
export class FormTrigger extends VersionedNodeType {
  constructor() {
    const nodeVersions: IVersionedNodeType['nodeVersions'] = {
      2: new FormTriggerV2(baseDescription),
      2.1: new FormTriggerV2_1(baseDescription),
    };
    super(nodeVersions, baseDescription);
  }
}
// defaultVersion 定义在 baseDescription 中
```

节点示例：FormTrigger, HttpRequest, IF, Switch, Set, Merge

**模式 B: 纯数组 version（单文件多版本）**

```typescript
export class Code implements INodeType {
  description: INodeTypeDescription = {
    version: [1, 2],
    defaultVersion: 2,
  };
}
```

节点示例：Code, Webhook, Form, ScheduleTrigger, ExecuteWorkflow, RespondToWebhook

**grep 策略**：
- `defaultVersion` — 直接匹配，适用模式 A
- `version: [...]` — 数组末尾即最新版本，适用模式 B
- 两种模式可能共存（如 Code 同时有 version 数组和 defaultVersion）

### Catalog Builder 脚本架构

```
scripts/
├── catalog-build.sh    # 入口：环境检查 + 版本检测 + 调用 mjs
└── catalog-build.mjs   # 核心：数据加载 + 分类 + 生成 Markdown
```

---

## 历史变更日志

| 日期 | n8n 版本 | commit | 变更 |
|------|----------|--------|------|
| 2026-02-11 | v2.7.0 | `06e48e5b3b` | 初始建立，12 节点版本对照表（含新增 Set/Merge/ScheduleTrigger/ExecuteWorkflow/RespondToWebhook） |
