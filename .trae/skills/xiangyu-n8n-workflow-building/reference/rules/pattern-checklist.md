# Pattern Verification Checklist

构建完成后的模式验证清单，确保关键模式正确实现。

---

## Split-Process-Aggregate Checklist

批处理模式验证（16/23 实战工作流使用）：

### 必检项（Critical）

- [ ] **Loop 完整性**：SplitInBatches 的 Loop 输出已连接回处理链路
- [ ] **Done 输出**：SplitInBatches 的 Done 输出已连接到下游（Aggregate 或直接输出）
- [ ] **batchSize 合理**：不超过 API 限速允许的最大并发
- [ ] **reset 配置**：`options.reset` 未设为 true（否则导致无限循环）
- [ ] **Aggregate 位置**：Aggregate 节点在循环外（连接到 Done），而非循环内

### 推荐检查（Warning）

- [ ] **空批次处理**：当输入为空数组时，工作流不会报错
- [ ] **批次间等待**：如果 API 有限速，批次之间需加 Wait 节点
- [ ] **进度可观测**：复杂批处理中有 StickyNote 标注进度
- [ ] **双层聚合**：如果每条数据产生多结果，确认内外两层 Aggregate 都存在

### 常见验证错误

```
❌ ERROR: "Items have the same input source"
   → Aggregate 放在了循环内，改为放在 Done 输出后

❌ ERROR: "Too many items"
   → batchSize 过大或未使用批处理，减小 batchSize

❌ 无限循环不停止
   → 检查 options.reset 是否为 true，应设为 false
   → 检查 Loop 输出是否连回了 SplitInBatches 自身
```

---

## Async Polling Checklist

异步轮询模式验证：

### 必检项（Critical）

- [ ] **超时上限**：有明确的最大轮询次数限制（maxRetries）
- [ ] **计数器递增**：每次轮询 counter 正确 +1
- [ ] **超时退出路径**：counter > maxRetries 时有退出分支
- [ ] **状态判断正确**：IF 节点正确判断完成状态（注意 API 返回值的大小写）

### 推荐检查（Warning）

- [ ] **Wait 时间合理**：不要太短（避免请求过多）也不要太长（用户等待）
- [ ] **指数退避**：长时间任务建议使用递增等待间隔
- [ ] **失败状态处理**：除了 success/pending，还要处理 failed/error 状态
- [ ] **日志记录**：轮询过程有 StickyNote 说明预期总时间

### 常见验证错误

```
❌ 轮询无限循环
   → 缺少 maxRetries 检查，添加计数器 + IF 超时退出

❌ 状态判断不生效
   → 检查 API 返回 "Completed" vs "completed"（大小写敏感）

❌ Wait 节点后数据丢失
   → Wait 节点 resume 模式会重新执行后续节点，确保数据通过 $execution.resumeUrl 正确传递
```

---

## Sub-Workflow Checklist

子工作流编排验证：

### 必检项（Critical）

- [ ] **子工作流存在**：workflowId 对应的工作流确实存在且已激活
- [ ] **Trigger 正确**：子工作流使用 Execute Workflow Trigger（不是 Webhook/Manual）
- [ ] **waitForSubWorkflow**：如需要子工作流结果，必须设为 true
- [ ] **错误冒泡**：子工作流错误是否正确传播到主工作流

### 推荐检查（Warning）

- [ ] **ID 硬编码**：避免硬编码 workflowId，改用全局参数容器管理
- [ ] **数据传递**：确认子工作流收到的 $json 是预期数据
- [ ] **返回数据**：确认子工作流最后一个节点的输出是主工作流需要的

---

## Global Parameter Container Checklist

全局参数容器验证：

### 必检项（Critical）

- [ ] **Set 节点存在**：工作流包含全局参数 Set 节点（紧跟 Trigger）
- [ ] **命名规范**：节点名称为「设置参数-综合」或「Configure Parameters」
- [ ] **所有配置集中**：没有散落在其他节点的硬编码配置

### 推荐检查（Warning）

- [ ] **参数命名**：使用 snake_case 命名
- [ ] **参数数量**：不超过 20 个（超出需拆分）
- [ ] **敏感信息**：API Key 等使用 n8n 凭据系统而非明文

---

## Multi-Model Routing Checklist

多模型路由验证：

### 必检项（Critical）

- [ ] **统一出口**：所有路由最终汇入 Merge 节点，输出 Schema 一致
- [ ] **Fallback 路由**：Switch 节点设置了默认路由（防止未匹配的任务类型）
- [ ] **错误分支**：每条路由有独立的错误处理

### 推荐检查（Warning）

- [ ] **模型配置**：不同路由的 temperature/maxTokens 针对任务类型优化
- [ ] **成本控制**：简单任务用小模型，复杂任务用大模型
- [ ] **出口 Set 节点**：每条路由出口有 Set 节点统一字段名
