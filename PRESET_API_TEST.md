# Canvas 预设功能 API 测试文档

## 环境准备
- 开发服务器运行：`npm run dev`
- 已登录用户
- API Base URL: `http://localhost:3002`

## 1. 预设 API 测试

### 1.1 列表预设
```bash
curl -X GET http://localhost:3002/api/canvas/presets \
  -H "Cookie: <your-session-cookie>"
```
**预期响应**：
```json
{
  "data": [
    {
      "id": "preset_id",
      "name": "预设名称",
      "nodes": [...],
      "resources": {...},
      "created_at": "2026-03-30T...",
      "updated_at": "2026-03-30T..."
    }
  ]
}
```

### 1.2 保存预设
```bash
curl -X POST http://localhost:3002/api/canvas/presets \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{
    "name": "我的预设",
    "nodes": [
      {
        "id": "text_abc123",
        "type": "text",
        "position": {"x": 0, "y": 0},
        "data": {"content": "测试文本"}
      }
    ],
    "resources": {}
  }'
```
**预期响应**：201 Created，返回新预设对象

### 1.3 获取单个预设
```bash
curl -X GET http://localhost:3002/api/canvas/presets/preset_id \
  -H "Cookie: <your-session-cookie>"
```

### 1.4 删除预设
```bash
curl -X DELETE http://localhost:3002/api/canvas/presets/preset_id \
  -H "Cookie: <your-session-cookie>"
```
**预期响应**：200 OK，`{"success": true}`

---

## 2. 积分扣费测试

### 2.1 生成九宫格（50积分）
1. 在Canvas中创建九宫格节点
2. 输入脚本内容和参考图片
3. 点击生成
4. **验证**：用户积分减少50

### 2.2 拆分九宫格（20积分）
1. 生成九宫格后，点击"拆分九宫格"
2. **验证**：用户积分减少20

### 2.3 图片理解（15积分）
1. 创建图片节点并上传图片
2. 点击"反推提示词"（图片理解）
3. **验证**：用户积分减少15

---

## 3. 多选和批量下载测试

### 3.1 多选节点
1. 在Canvas中创建多个节点
2. Ctrl/Cmd + 点击选中多个节点
3. **验证**：节点边框高亮显示

### 3.2 保存多选预设
1. 多选3个节点
2. 打开预设面板
3. 输入预设名称，点击"保存预设"
4. **验证**：预设保存成功，预设面板显示新预设

### 3.3 加载预设
1. 点击预设面板中的预设
2. **验证**：新节点出现在画布上，位置自动偏移

### 3.4 批量下载
1. 多选有输出的节点（图片/视频）
2. 点击"批量下载"
3. **验证**：浏览器下载所有输出资源

---

## 4. 错误场景测试

### 4.1 未授权访问
```bash
curl -X GET http://localhost:3002/api/canvas/presets
```
**预期响应**：401 Unauthorized

### 4.2 无效预设数据
```bash
curl -X POST http://localhost:3002/api/canvas/presets \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"name": ""}'
```
**预期响应**：400 Bad Request

### 4.3 积分不足
1. 用户积分 < 50
2. 尝试生成九宫格
3. **预期**：提示"积分不足"

---

## 5. 数据库验证

### 检查预设表
```sql
SELECT * FROM public.canvas_presets WHERE user_id = '<user_id>';
```

### 检查积分日志
```sql
SELECT * FROM public.credit_usage_logs
WHERE feature_key IN ('canvas_grid_generation', 'canvas_grid_split', 'canvas_image_understanding')
ORDER BY created_at DESC LIMIT 10;
```

---

## 测试结果记录

| 功能 | 状态 | 备注 |
|------|------|------|
| 列表预设 | ⬜ | |
| 保存预设 | ⬜ | |
| 加载预设 | ⬜ | |
| 删除预设 | ⬜ | |
| 多选节点 | ⬜ | |
| 批量下载 | ⬜ | |
| 九宫格扣费 | ⬜ | |
| 拆分扣费 | ⬜ | |
| 图片理解扣费 | ⬜ | |

✅ = 通过 | ❌ = 失败 | ⬜ = 未测试
