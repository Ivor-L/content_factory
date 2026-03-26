# 写作风格工作流改造（去飞书版）

## 0. 当前仓库状态（已落地）

- `workflows/提取创作风格.json`：已改为**去飞书版**，仅保留打分/提炼/回调后端流程。
- `workflows/知识库入库.json`：已改为**后端切片占位版**（提示切片已迁移到后端 API）。

## 1. 入库切片（知识库入库）

当前改造后，切片逻辑已经下沉到后端：

- 上传入口：`POST /api/assets/writing-styles/:id/upload`
- 切片函数：`lib/writingStyleChunker.ts`
- 落库表：`writing_style_chunks`

因此 `知识库入库.json` 可退役，或仅保留为“离线批处理”工作流。

## 2. 提炼风格（提取创作风格）

### 2.1 触发入口（前端/后端）

- 后端触发：`POST /api/assets/writing-styles/:id/extract`
- 发送到 n8n webhook（默认）：`N8N_WRITING_STYLE_EXTRACT_WEBHOOK`

### 2.2 n8n 输入（建议）

```json
{
  "task_id": "style_id",
  "style_id": "style_id",
  "style_name": "风格名",
  "workflow_id": "flow_writing_style_extract",
  "workflow_name": "提取创作风格",
  "cards": [
    {
      "record_id": "chunk_id",
      "content": "切片正文",
      "card_type": "其他",
      "risk": "低",
      "tags": [],
      "score": null,
      "created_at": "ISO时间"
    }
  ],
  "body": {
    "data": {
      "items": []
    }
  },
  "callback_url": "https://<app>/api/webhook/writing-style/extract?style_id=..."
}
```

### 2.3 n8n 输出回调（必须）

回调 URL：`POST /api/webhook/writing-style/extract`

最少字段：

```json
{
  "style_id": "style_id",
  "status": "COMPLETED",
  "style_json": {"domain_inference": {}},
  "sample_gaps": "样本缺失点",
  "sample_improvement": "改进方向",
  "workflow_id": "flow_writing_style_extract",
  "workflow_name": "提取创作风格"
}
```

失败回调：

```json
{
  "style_id": "style_id",
  "status": "FAILED",
  "error_message": "错误原因"
}
```

## 3. 从旧工作流删掉的节点

- 所有飞书凭证节点（获取飞书凭证）
- 所有飞书 Parse URL 节点（bitable:parseUrl）
- 所有读取/写回飞书记录节点（open.feishu.cn）

保留：

- 分批处理
- 内容打分
- 合并打分 + 筛选样本
- 风格提炼
- 代码清洗

## 4. 鉴权建议

给回调请求头加：`x-workflow-secret`，值与 `WRITING_STYLE_EXTRACT_WEBHOOK_SECRET` 一致。
