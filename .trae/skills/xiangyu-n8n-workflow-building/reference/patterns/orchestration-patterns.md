# Orchestration Patterns

**Use Case**: 处理批量数据、异步任务轮询、子工作流编排 -- 三大 P0 编排模式覆盖 16/23 实战工作流。

---

## Pattern 1: Split-Process-Aggregate (批处理)

```
Trigger → Set(参数) → SplitOut/SplitInBatches → [Process Each] → Aggregate → Output
```

**Key Characteristic**: 将大数组拆分为单条或小批量，逐条处理后汇总结果。

### 使用场景

- 大量数据需逐条或分批调 API（如 100 个商品逐个查价格）
- 避免 API 限速（429）、内存溢出
- 需要汇总所有处理结果为一个数组

### 核心节点

#### 1. SplitInBatches (typeVersion: 3)

**Purpose**: 将输入数组分批处理，每批固定数量，循环执行直到全部完成。

```javascript
{
  type: "n8n-nodes-base.splitInBatches",
  typeVersion: 3,
  parameters: {
    batchSize: 10,               // 每批数量，根据 API 限速调整
    options: {
      reset: false               // 必须 false，否则无限循环
    }
  }
}
```

**输出端口**:
- **Loop** (output 0) -- 当前批次数据，连接到处理节点
- **Done** (output 1) -- 全部批次处理完毕，连接到 Aggregate

```
SplitInBatches ──[Loop]──→ Process ──→ (回连 SplitInBatches)
       │
       └──[Done]──→ Aggregate → Output
```

#### 2. SplitOut (typeVersion: 1)

**Purpose**: 将单条数据中的数组字段拆分为多条独立数据，不做循环。

```javascript
{
  type: "n8n-nodes-base.splitOut",
  typeVersion: 1,
  parameters: {
    fieldToSplitOut: "data",     // 要拆分的数组字段名
    include: "noOtherFields"     // "noOtherFields" | "allOtherFields" | "selectedOtherFields"
  }
}
```

**SplitOut vs SplitInBatches 选型**:
- SplitOut: 拆分字段，一次性输出所有条目，无循环
- SplitInBatches: 分批循环，控制并发，适合大量 API 调用

#### 3. Aggregate (typeVersion: 1)

**Purpose**: 将多条数据合并为一条，所有结果汇入指定字段。

```javascript
{
  type: "n8n-nodes-base.aggregate",
  typeVersion: 1,
  parameters: {
    aggregate: "aggregateAllItemData",
    destinationFieldName: "results",
    include: "allFields"         // "allFields" | "specifiedFields"
  }
}
```

### 双层聚合模式

当每条数据可能产生多个结果时，需要内外两层聚合：

```
SplitInBatches ──[Loop]──→ Process ──→ SplitOut(展开子数组) ──→ Aggregate(内层)
       │                                                              │
       │                              ←──────────────────────────────←┘
       └──[Done]──→ Aggregate(外层) → Output
```

- **内层 Aggregate**: 汇总单条数据产生的多个子结果
- **外层 Aggregate**: 汇总所有批次的处理结果

### 常见陷阱

| 陷阱 | 症状 | 修复 |
|------|------|------|
| `options.reset` 未设为 false | 无限循环，工作流永不停止 | 显式设置 `reset: false` |
| batchSize 过大 | API 返回 429 Too Many Requests | 降低到 5-10，加 Wait 节点 |
| Aggregate 放在循环内 | 每批单独聚合，丢失跨批数据 | Aggregate 连接 Done 输出 |
| Done 输出未连接 | 处理完无输出，工作流静默结束 | Done → Aggregate → 后续节点 |
| Loop 输出未回连 | 只处理第一批就结束 | Process 最后一个节点回连 SplitInBatches |

### 完整示例: 批量查询 API

```javascript
// 1. SplitInBatches -- 每次处理 5 条
{ type: "n8n-nodes-base.splitInBatches", typeVersion: 3,
  parameters: { batchSize: 5, options: { reset: false } } }

// 2. HTTP Request -- 查询每条数据（连接 Loop 输出）
{ type: "n8n-nodes-base.httpRequest", typeVersion: 4.4,
  parameters: { method: "GET", url: "=https://api.example.com/products/{{ $json.id }}" } }

// 3. 回连 SplitInBatches（HTTP Request → SplitInBatches）

// 4. Aggregate -- 汇总结果（连接 Done 输出）
{ type: "n8n-nodes-base.aggregate", typeVersion: 1,
  parameters: { aggregate: "aggregateAllItemData", destinationFieldName: "products", include: "allFields" } }
```

---

## Pattern 2: Async Polling (异步轮询)

```
Submit Task → Wait(interval) → Poll Status(HTTP) → IF(done?) ──[Yes]──→ Process Result
                  ↑                                  └──[No]──→ Loop Back ↑
```

**Key Characteristic**: 提交异步任务后，定时轮询状态直到完成或超时。

### 使用场景

- 提交任务后需等待异步完成（如视频生成、文件转换、AI 推理）
- 第三方 API 只返回 task_id，需轮询查询状态
- 处理耗时 10 秒 ~ 30 分钟的长任务

### 核心节点

#### 1. Submit Task (HTTP Request)

```javascript
{
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.4,
  parameters: {
    method: "POST",
    url: "https://api.example.com/tasks",
    sendBody: true,
    bodyParameters: {
      "input": "={{ $json.data }}"
    }
  }
}
// 返回: { task_id: "abc-123", status: "pending" }
```

#### 2. Wait (typeVersion: 1.1)

**Purpose**: 暂停工作流执行，等待指定时间后继续。

```javascript
{
  type: "n8n-nodes-base.wait",
  typeVersion: 1.1,
  parameters: {
    resume: "timeInterval",
    amount: 30,                  // 等待时长
    unit: "seconds"              // "seconds" | "minutes" | "hours"
  }
}
```

#### 3. Poll Status (HTTP Request)

```javascript
{
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.4,
  parameters: {
    method: "GET",
    url: "=https://api.example.com/tasks/{{ $json.task_id }}"
  }
}
// 返回: { task_id: "abc-123", status: "completed", result: {...} }
```

#### 4. IF -- 状态判断 (typeVersion: 2)

```javascript
{
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  parameters: {
    conditions: {
      options: { caseSensitive: true },
      conditions: [{
        leftValue: "={{ $json.status }}",
        rightValue: "completed",
        operator: {
          type: "string",
          operation: "equals"
        }
      }]
    }
  }
}
```

**路由**:
- **True** → 任务完成，处理结果
- **False** → 回连 Wait 节点，继续轮询

### 超时兜底

在轮询循环中加入计数器，防止无限轮询：

```
Submit → Code(init counter=0) → Wait → Poll → Code(counter++) → IF(done OR timeout?)
                                  ↑                                     │
                                  └──────[No, 继续轮询]─────────────────┘
                                                                        │
                                                      [Yes, done] → Process Result
                                                      [Yes, timeout] → Error Handler
```

#### Counter 初始化 (Code 节点)

```javascript
{
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  parameters: {
    jsCode: `
      const item = $input.first().json;
      item.poll_counter = 0;
      item.max_retries = 20;
      return [{ json: item }];
    `
  }
}
```

#### Counter 递增 + 判断 (Code 节点)

```javascript
{
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  parameters: {
    jsCode: `
      const item = $input.first().json;
      item.poll_counter = (item.poll_counter || 0) + 1;
      item.is_timeout = item.poll_counter >= item.max_retries;
      return [{ json: item }];
    `
  }
}
```

#### IF 节点 -- 三路判断

```javascript
// 方案: 用两个串联 IF
// IF1: status === "completed" → Process Result
// IF1 False → IF2: is_timeout === true → Error Handler
// IF2 False → Wait (继续轮询)
```

### 指数退避 (可选)

对于不确定耗时的任务，用指数退避减少无效轮询：

```javascript
// Wait 节点的 amount 用表达式
{
  type: "n8n-nodes-base.wait",
  typeVersion: 1.1,
  parameters: {
    resume: "timeInterval",
    amount: "={{ Math.min(($json.poll_counter || 1) * 10, 300) }}",
    unit: "seconds"
  }
}
// 第 1 次等 10s，第 2 次 20s，第 3 次 30s ... 最多 300s
```

**超时计算**: `总超时 = sum(min(i*10, 300))` ，20 次约 35 分钟。

---

## Pattern 3: Sub-Workflow (子工作流编排)

```
Main Trigger → Prepare Params → Execute Workflow(子) → Process Sub Result → Output
                                        │
                                Sub Workflow:
                                Execute Workflow Trigger → [处理逻辑] → Return Data
```

**Key Characteristic**: 将复杂逻辑拆分为独立子工作流，主工作流通过 Execute Workflow 节点调用。

### 使用场景

- 复用已有工作流作为子流程
- 主工作流节点数 > 15，需要拆分降低复杂度
- 不同触发条件共用相同处理逻辑

### 核心节点

#### 1. Execute Workflow (typeVersion: 1) -- 主工作流

```javascript
{
  type: "n8n-nodes-base.executeWorkflow",
  typeVersion: 1,
  parameters: {
    source: "database",          // "database" 从已保存的工作流调用
    workflowId: "1001",          // 子工作流 ID，可用表达式: "={{ $json.sub_id }}"
    mode: "each",                // "each" 逐条传入 | "once" 整批传入
    waitForSubWorkflow: true     // true 同步等待 | false 异步触发
  }
}
```

**mode 选型**:
- `each`: 输入 10 条数据 → 子工作流执行 10 次，每次收到 1 条
- `once`: 输入 10 条数据 → 子工作流执行 1 次，收到 10 条数组

#### 2. Execute Workflow Trigger (typeVersion: 1.1) -- 子工作流入口

```javascript
{
  type: "n8n-nodes-base.executeWorkflowTrigger",
  typeVersion: 1.1,
  parameters: {}                 // 无需配置，自动接收主工作流传入的数据
}
// $json 直接是主工作流传来的数据
```

### 参数传递

- **主 → 子**: Execute Workflow 自动将当前 `$json` 传入子工作流 Trigger
- **子 → 主**: 子工作流最后一个节点的输出自动返回主工作流

```
主: Set({ name, count }) ──→ Execute Workflow ──→ 接收 $json = { success, data }
                                    │                          ↑
子:               Execute Workflow Trigger → ... → Set({ success, data })
```

### 错误处理

```javascript
// 主工作流 -- Execute Workflow 节点设置
{
  type: "n8n-nodes-base.executeWorkflow",
  typeVersion: 1,
  parameters: {
    source: "database",
    workflowId: "1001",
    waitForSubWorkflow: true
  },
  onError: "continueRegularOutput"  // 子工作流出错时继续执行，不中断主流程
}

// 子工作流 -- 内部错误处理，返回标准化结果
// Code 节点 (try-catch 包裹)
{
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  parameters: {
    jsCode: `
      try {
        const result = await processData($input.first().json);
        return [{ json: { success: true, data: result } }];
      } catch (error) {
        return [{ json: { success: false, error: error.message } }];
      }
    `
  }
}
```

**错误传播规则**:
- `waitForSubWorkflow: true` -- 子工作流错误冒泡到主工作流
- `waitForSubWorkflow: false` -- 异步执行，主工作流不等待也不接收错误
- 建议子工作流内部做好 try-catch，返回 `{ success, data/error }` 标准结构

### 子工作流设计原则

1. **单一职责**: 每个子工作流只做一件事
2. **标准化输入输出**: 约定 `$json` 结构，写清注释
3. **自包含**: 子工作流可独立测试（手动触发）
4. **幂等性**: 相同输入产生相同输出，支持重试

---

## Pattern Combinations & Decision Tree (模式组合与选型)

### 常见组合

#### 组合 1: 批处理 + 异步轮询

批量提交任务，每条任务异步等待完成。

```
SplitInBatches ──[Loop]──→ Submit Task → Wait → Poll → IF(done?)
       │                                  ↑              │[No]
       │                                  └──────────────┘
       │                                                 │[Yes]
       │                              ←── Collect Result ←┘
       └──[Done]──→ Aggregate → Output
```

#### 组合 2: 批处理 + 子工作流

外层分批，每批调用子工作流处理。

```
SplitInBatches ──[Loop]──→ Execute Workflow(子) ──→ (回连)
       │                          │
       │                   Sub Workflow:
       │                   Trigger → Process → Return
       └──[Done]──→ Aggregate → Output
```

#### 组合 3: 三合一

主工作流分批 → 子工作流处理 → 子工作流内异步轮询。

```
Main Workflow:
SplitInBatches ──[Loop]──→ Execute Workflow(子) ──→ (回连)
       └──[Done]──→ Aggregate → Output

Sub Workflow:
Trigger → Submit Task → Wait → Poll → IF(done?) ──[Yes]──→ Return Result
                          ↑              │[No]
                          └──────────────┘
```

### 选型决策树

```
Q1: 数据量是否 > 10 条？
│
├─ Yes → 需要批处理
│        │
│        Q2: 每条是否需要等待异步结果？
│        ├─ Yes → 批处理 + 异步轮询（组合 1）
│        └─ No  → 纯批处理（Pattern 1）
│                 │
│                 Q3: 处理逻辑 > 15 节点或需复用？
│                 ├─ Yes → 批处理 + 子工作流（组合 2）
│                 └─ No  → 内联批处理
│
└─ No → 不需要批处理
         │
         Q2: 是否需要等待异步结果？
         ├─ Yes → 纯异步轮询（Pattern 2）
         └─ No  → 直接处理，无需编排模式
```

### 性能参考

| 模式 | batchSize | 单条耗时 | 100 条总耗时 |
|------|-----------|----------|-------------|
| 纯批处理 | 10 | 1s | ~10s |
| 批处理 + 轮询 | 5 | 30s (avg) | ~10min |
| 批处理 + 子工作流 | 10 | 2s | ~20s |
| 三合一 | 5 | 30s (avg) | ~10min |

### 关键原则

1. **先跑通再优化**: 先用 SplitOut + 简单处理验证逻辑，再切换 SplitInBatches 控制并发
2. **batchSize 从小开始**: 初始设 5，观察 API 响应后逐步调大
3. **超时必须兜底**: 异步轮询永远要设 maxRetries，防止无限循环
4. **子工作流不宜过深**: 最多两层嵌套（主 → 子 → 孙），超过则重新设计
5. **监控与日志**: 在 Code 节点中用 `console.log()` 记录关键步骤，便于调试
