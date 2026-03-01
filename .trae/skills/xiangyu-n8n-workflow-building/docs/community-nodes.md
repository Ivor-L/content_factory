# n8n 社区节点指南

> **用途**：社区节点的安装方式、平台差异和 REST API 参考。Skill 在 Step 06/08 自动调用，用户一般无需手动操作。

n8n 社区节点是由第三方开发者发布的 npm 包，扩展 n8n 的节点生态。

---

## 节点分类

| 类型 | 来源 | 说明 |
|------|------|------|
| 内置节点 | `nodes-base` / `nodes-langchain` | n8n 官方维护，开箱即用 |
| 已认证社区节点 | npm（verified） | 通过 n8n 官方审核，质量有保障 |
| 普通社区节点 | npm（community） | 社区开发者发布，需自行评估 |

---

## 安装方式

### GUI 安装（推荐）

适用于 n8n Cloud 和自托管实例：

1. 打开 n8n 界面 → **Settings** → **Community Nodes**
2. 点击 **Install a community node**
3. 输入 npm 包名（如 `n8n-nodes-notion`）
4. 点击 **Install**
5. 安装完成后刷新页面，新节点出现在节点面板

### 手动 npm 安装（仅自托管）

适用于 Docker 或本地部署的自托管实例：

```bash
# Docker 部署
docker exec -it n8n npm install n8n-nodes-notion

# 本地部署
cd ~/.n8n
npm install n8n-nodes-notion
```

安装后需重启 n8n 实例。

---

## 平台差异

| 特性 | n8n Cloud | 自托管 |
|------|-----------|--------|
| GUI 安装 | ✅ 支持 | ✅ 支持 |
| npm 手动安装 | ❌ 不支持 | ✅ 支持 |
| 已认证节点 | ✅ 全部可用 | ✅ 全部可用 |
| 普通社区节点 | ⚠️ 部分受限 | ✅ 全部可用 |
| 自动更新 | ✅ 自动 | ❌ 手动 |

---

## 已认证 vs 普通社区节点

| 维度 | 已认证（Verified） | 普通（Community） |
|------|-------------------|------------------|
| 审核 | 通过 n8n 官方审核 | 无审核 |
| 质量 | 有代码规范要求 | 质量不一 |
| 更新 | 维护有保障 | 依赖开发者 |
| 风险 | 低 | 需自行评估 |
| 标识 | 节点面板显示认证徽章 | 无徽章 |

---

## 发现社区节点的渠道

| 渠道 | 说明 |
|------|------|
| n8n 内置搜索 | Settings → Community Nodes → 搜索 |
| n8n-mcp `search_nodes` | `source: "community"` 或 `"verified"` |
| [n8n 官方节点库](https://www.npmjs.com/search?q=n8n-nodes) | npm 搜索 `n8n-nodes-*` |
| [awesome-n8n](https://github.com/joseantonio/awesome-n8n) | 社区精选列表 |

---

## 在 Skill 中的处理

本 Skill 在以下步骤处理社区节点：

| Step | 处理 |
|------|------|
| 02 | search_nodes(source:"all") 发现社区节点 |
| 03 | 节点清单标记来源 + 安装状态；key_nodes npm 字段强制校验 |
| 05 | 设计稿节点清单含「来源」「npm」列 |
| 06 | 使用 search_nodes 返回的 workflowNodeType；阶段 4 安装检查（REST API） |
| 08 | REST API 三种判定（未安装 / failedLoading / type 不匹配） |

---

## REST API 参考

n8n 提供两套 API，认证方式不同：

| API | 路径前缀 | 认证方式 | 用途 |
|-----|---------|---------|------|
| 内部 REST API | `/rest/*` | Session Cookie（`n8n-auth={N8N_SESSION}`） | 社区包管理、节点类型查询 |
| 公开 API | `/api/v1/*` | API Key（`X-N8N-API-KEY`） | 工作流 / 凭据 / 执行管理 |

> Step 07 凭据配置使用公开 API（API Key），社区包管理使用内部 REST API（Session Cookie）。

### 社区包管理端点

#### 1. 查询已安装包

```
GET /rest/community-packages
Cookie: n8n-auth={N8N_SESSION}
```

**返回示例**：

```json
[
  {
    "packageName": "n8n-nodes-notion",
    "installedVersion": "1.2.3",
    "authorName": "developer",
    "installedNodes": [
      {
        "name": "Notion",
        "type": "@xxx/n8n-nodes-notion.notion"
      }
    ],
    "failedLoading": false,
    "updateAvailable": "1.3.0"
  }
]
```

**关键字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| packageName | string | npm 包名 |
| installedVersion | string | 当前安装版本 |
| installedNodes | array | 包含的节点列表（name + type） |
| failedLoading | boolean | 安装但加载失败（依赖冲突/版本不兼容） |
| updateAvailable | string \| null | 可更新版本，null 表示已是最新 |

#### 2. 安装社区包

```
POST /rest/community-packages
Cookie: n8n-auth={N8N_SESSION}
Content-Type: application/json

{"name": "n8n-nodes-notion"}
```

返回安装后的包信息（同查询格式）。

#### 3. 更新社区包

```
PATCH /rest/community-packages
Cookie: n8n-auth={N8N_SESSION}
Content-Type: application/json

{"name": "n8n-nodes-notion"}
```

更新到最新版本。

#### 4. 卸载社区包

```
DELETE /rest/community-packages
Cookie: n8n-auth={N8N_SESSION}
Content-Type: application/json

{"name": "n8n-nodes-notion"}
```

### Verified 节点查询端点

#### 5. 查询已认证节点类型

```
GET /rest/community-node-types
Cookie: n8n-auth={N8N_SESSION}
```

返回所有已认证社区节点类型列表。

#### 6. 按包名查询节点类型

```
GET /rest/community-node-types?packageName={npm}
Cookie: n8n-auth={N8N_SESSION}
```

### 错误处理

| 状态码 | 含义 | 处理方式 |
|--------|------|---------|
| 200 | 成功 | 正常处理返回数据 |
| 401 | Session 过期 | 降级为手动安装提示 |
| 403 | 无权限（n8n Cloud 限制） | 降级为 GUI 安装引导 |
| 500 | 安装失败（npm 错误） | 记录错误，建议手动 npm 安装 |
