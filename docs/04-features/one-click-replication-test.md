# 一键成片逻辑测试报告

## 测试时间
2026-03-23

## 流程图

```
用户选择 → ReplicationForm → API Route → n8n.ts → N8N工作流 → 回调 → Webhook → 更新数据库
```

## 详细流程测试

### 1. 前端表单 (ReplicationForm.tsx)

#### ✅ 状态管理
- `soraProvider`: 'kie' | 'yunwu' (默认 'kie')
- `selectedProduct`: 产品ID
- `selectedScript`: 脚本ID
- `targetCountry`: 目标国家 (默认 'us')
- `targetLanguage`: 目标语言 (默认 'en')
- `duration`: 时长 (默认 '15')
- `quantity`: 数量 (默认 '1')

#### ✅ UI组件
- Sora路线选择器：Kie (自动回调) / 云雾 (轮询模式)
- 时长选择：10s / 15s
- 数量输入：1-10

#### ✅ 提交逻辑
```javascript
POST /api/replication/generate
{
  productId,
  scriptId,
  targetCountry,
  targetLanguage,
  duration,
  quantity,
  soraProvider,
  blueprint
}
```

#### ✅ 已修复问题
- ~~重复的 duration/quantity 字段~~ → 已删除重复

---

### 2. API路由 (app/api/replication/generate/route.ts)

#### ✅ 接收参数
```typescript
const {
  productId,
  scriptId,
  targetCountry,
  targetLanguage,
  duration,
  quantity,
  blueprint,
  referenceId,
  creatorId,
  soraProvider, // ✅ 新增
} = body;
```

#### ✅ 数据库操作
1. 创建 replication 记录 (status: 'pending')
2. 保存 inputParams (包含所有参数快照)
3. 失败时更新 status 为 'failed'

#### ✅ 调用 n8n
```typescript
await generateReplication(product, scriptForTrigger, {
  ...triggerOptions,
  soraProvider: soraProvider || 'kie', // ✅ 传递给 n8n
});
```

---

### 3. N8N触发器 (lib/n8n.ts)

#### ✅ 工作流选择逻辑
```typescript
const soraProvider = options.soraProvider || 'kie';

payload = {
  sora_provider: soraProvider,
  sora_workflow_id: soraProvider === 'yunwu'
    ? 'jUuV6hsG464jDTHq'  // 云雾发起工作流
    : 'vvc2rzlS2PF4F2Tn',  // Kie发起工作流
  sora_callback_workflow_id: soraProvider === 'yunwu'
    ? 'dctPumNGHBoSokUx'   // 云雾回调工作流
    : 'zPJavUam1LbqiAeg',  // Kie回调工作流
}
```

#### ✅ Payload结构
```json
{
  "product_id": "xxx",
  "script_id": "xxx",
  "target_country": "us",
  "target_language": "en",
  "duration": "15",
  "quantity": "1",
  "api_key": "xxx",
  "callback_url": "https://xxx/api/webhook/replication",
  "replication_id": "xxx",
  "flow": "flow_farm_copy",
  "sora_provider": "kie",
  "sora_workflow_id": "vvc2rzlS2PF4F2Tn",
  "sora_callback_workflow_id": "zPJavUam1LbqiAeg",
  "image_url": "xxx",
  "product_image_url": "xxx"
}
```

#### ✅ 清理逻辑
删除 camelCase 字段，只保留 snake_case

---

### 4. N8N工作流架构

#### 提示词生成 (e9Q0InRVbw3mcRzk)
- 接收参数 → 验证API Key → 生成提示词
- 根据 `sora_workflow_id` 分发到对应的Sora工作流

#### Kie路线 (vvc2rzlS2PF4F2Tn)
1. 判断是否上传图片
2. 准备图生/文生视频参数
3. 清洗提示词
4. 调用Sora创建任务
5. 提取任务ID
6. **Kie自动回调** → 直接写入任务ID到数据库

#### 云雾路线 (jUuV6hsG464jDTHq)
1. Auth获取AccessToken
2. 判断是否上传图片
3. 准备图生/文生视频参数
4. 清洗提示词
5. 提交Sora2请求
6. 提取任务ID
7. **注册轮询任务** → 自建服务轮询云雾API
8. 写入任务ID到数据库

---

### 5. 回调处理 (app/api/webhook/replication/route.ts)

#### ✅ 接收参数
```typescript
const taskId = body.task_id || body.taskId || body.id ||
               body.replication_id || body.replicationId;
const status = body.status;
```

#### ✅ 状态映射
- `failed/error` → 'failed'
- `completed/success/video_completed` → 'completed'
- 其他 → 'processing'

#### ✅ 结果合并
```typescript
const mergedResult = {
  ...existingResult,
  ...normalizedPayload,
  lastStage: body.stage || status,
  videoUrl: body.result?.videoUrl,
  thumbnailUrl: body.result?.thumbnailUrl,
};
```

#### ✅ 数据库更新
```typescript
await prisma.replication.update({
  where: { id: taskId },
  data: {
    status: updateStatus,
    result: JSON.stringify(mergedResult),
  },
});
```

---

## 发现的问题

### ❌ 问题1: 缺少环境变量验证
**位置**: `lib/n8n.ts:196`
```typescript
const webhookUrl = process.env.N8N_REPLICATION_WEBHOOK;
if (!webhookUrl) {
  console.warn("N8N_REPLICATION_WEBHOOK not set, simulating async process");
  return { success: true, message: "Mock trigger successful" };
}
```
**风险**: 生产环境如果缺少环境变量，会静默失败
**建议**: 在启动时验证必需的环境变量

### ⚠️ 问题2: 回调URL硬编码逻辑
**位置**: `app/api/replication/generate/route.ts:152`
```typescript
const callbackUrl = `${process.env.N8N_CALLBACK_BASE_URL ||
                       process.env.NEXT_PUBLIC_APP_URL ||
                       'http://localhost:3000'}/api/webhook/replication`;
```
**风险**: 如果两个环境变量都未设置，会使用 localhost，导致n8n无法回调
**建议**: 启动时验证至少一个环境变量存在

### ⚠️ 问题3: 云雾轮询服务未实现
**位置**: 云雾路线需要自建轮询服务
**当前状态**: 工作流注册轮询任务，但轮询服务代码未找到
**建议**: 确认轮询服务是否已部署，或者提供轮询服务实现

### ✅ 问题4: 重复字段 (已修复)
~~`duration` 和 `quantity` 在 payload 中重复~~

---

## 测试建议

### 单元测试
1. 测试 `soraProvider` 参数传递链路
2. 测试工作流ID选择逻辑
3. 测试回调状态映射

### 集成测试
1. **Kie路线**: 创建任务 → 验证工作流ID → 等待回调 → 验证状态
2. **云雾路线**: 创建任务 → 验证轮询注册 → 等待轮询完成 → 验证状态

### 边界测试
1. 缺少 `soraProvider` 参数 (应默认为 'kie')
2. 无效的 `soraProvider` 值 (应默认为 'kie')
3. 回调超时场景
4. 重复回调场景

---

## 总体评估

### ✅ 已完成
- 前端UI和状态管理
- API参数传递
- N8N工作流选择逻辑
- 回调处理逻辑

### ⚠️ 需要确认
- 云雾轮询服务是否已部署
- 环境变量是否完整配置
- 两种路线的回调格式是否一致

### 🔧 建议优化
1. 添加环境变量启动验证
2. 添加请求日志和错误追踪
3. 实现云雾轮询服务监控
4. 添加回调重试机制
