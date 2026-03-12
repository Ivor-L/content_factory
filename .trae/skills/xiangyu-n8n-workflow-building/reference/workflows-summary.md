# n8n Workflow Notes (Mar 2026)

面向已经接上前端的核心工作流做法梳理，便于后续照着扩展或复用。

---

## xXldwYS5d3lCTNwE — 脚本拆解 / script_extract_web
- **入口**：Webhook `POST /webhook/script_extract_web`，第一节点就顺序串联「查询工作流积分」→「验证 api-key」→ `Switch`，失败时直接 `Respond` 返回 `API_KEY_INVALID / INSUFFICIENT_POINTS`（`script_extract_web.json`）。
- **积分扣除**：成功路径先调用 `http://47.107.158.233:8080/workflow-credits/query` 拿到 `credit_cost`，then `http://47.107.158.233:8080/api/balance/check` 校验，再在流程末尾调用 `http://47.107.158.233:8080/api/credits/deduct`（请求体含 `api_key/amount/reason/workflow_id/name`）。  
- **Yunwu API**：下载视频 → `Code` 节点把 binary 转 base64，构造 Gemini 2.5 `generateContent` 请求（system prompt 定义 JSON Schema）；`HTTP Request` 节点 `https://yunwu.ai/v1beta/models/gemini-2.5-pro:generateContent`；后续 `Code` 解析返回 JSON，做必要的 `time_range` 清洗。  
- **Supabase 操作**：  
  - `Supabase-标记extracting`：`scripts` 表 `status=extracting` 并清空 `error`。  
  - `写回Supabase-scripts`：把 Gemini 输出 JSON 写入 `scripts.blueprint`，`status=completed`，清空 `error`。  
- **响应 & 进度**：成功后 `Respond-完成` 返回 `{ ok: true, script_id, status: "completed" }`；失败提前中断。

---

## dD3z4oaWhFNNIL3K — 数字人口播（老版）
- **关联**：虽然本地存档的是 `workflow.json`（ID `LdMZP60KdBPMpzLV`），但 n8n 用户 `fan liu` 的 `firstSuccessfulWorkflowId` 标识老版本 ID `dD3z4oaWhFNNIL3K`。当前 JSON 延续了同一套路。  
- **入口**：Webhook `digital-human-gen` 带上 Feishu table 链接、record_id、app_id/secret、runninghub key。  
- **Feishu 集成**：  
  - `Auth:getAccessToken` 拉租户 token。  
  - `feishu-lite parseUrl` 拿 app_token/table_id。  
  - 多个 HTTP Request 更新多维表（“拆解中 / 积分不足 / 列队已满 / 数字人渲染中”等字段），用于前端进度反馈。  
- **素材处理**：通过 Feishu Drive API 下载图片/音频 → Code 节点修正文件名/类型 → 自建 OSSClient 节点上传到 `flowonn/n8n_data`，再转成公网 URL。  
- **RunningHub**：根据“时长”分支构造 `nodeInfoList` 与 `workflowId`，拼接回调 URL（`https://hooks.atomx.top/webhook/rh_task_end` + query），`POST https://www.runninghub.cn/task/openapi/create`。队列满（返回 code 421）时更新表格提示。  
- **Supabase**：该版本主要依赖 Feishu + RunningHub，没有直接回写 Supabase（状态通过 Feishu 表驱动）。  
- **积分**：与脚本拆解一致，走 `workflow-credits/query` → `balance/check` → `Switch`。扣费节点通常位于流程尾部（可参考同 repo 其它 JSON）。  
- **进度**：每个关键节点都 `PUT` Feishu 记录更新字段，UI 侧监听即可。

---

## t8l47ZgqYyab0X0D — 数字人提交 Webhook
- `app/actions/digital-human.ts` 默认 webhook URL 指向 `https://hooks.atomx.top/webhook/t8l47ZgqYyab0X0D`，FormData 包含 `type/imageUrl/audioUrl/script/duration`，服务端写入 `digital_human_videos` 后 fire-and-forget 调用 n8n（`.next/dev/.../digital-human.ts` 源映射可证实）。  
- Payload 字段：`task_id`（Prisma 记录 ID）、`type`、`image_url`、`audio_url`、`script_content`、`audio_duration`、`timestamp`、`flow: "flow_Digital_Human"`。  
- 前端：`DigitalHumanModal` 上传素材至 `/api/upload`（Supabase Storage），成功后调用 `createDigitalHumanVideo` 并触发 `emitCreditsRefresh`。  
- 回调：`app/api/webhook/digital-human/route.ts` 兼容 RunningHub + n8n 回调格式，写回 `digital_human_videos.status/resultUrl`；若收到 `eventData` 解析失败或 code!=0，则标记 `FAILED` 并保留原 resultUrl。  
- **要点**：这个 ID 仅作为 n8n 入口，不承担 Yunwu/Feishu 逻辑；实际生产步骤由 `LdMZP60...`（或其升级）完成。

---

## xNY4qhKT2cwXYi0v — 九宫格 / Storyboard Plot
- **定位**：`workflow_xNY4qhKT2cwXYi0v_fixed.json` 描述“一键生成 9 宫格 - 剧情版 plus”，从 Webhook 收到 Feishu 记录信息后驱动 Yunwu + Supabase。  
- **积分校验**：同样前置 `workflow-credits/query` + `balance/check` + `Switch`，失败则 Respond 早退。  
- **素材管线**：  
  - 经 Feishu Drive 下载参考人物图，`Binary → Base2` 的 Code 节点把 base64/mime 缓存下来。  
  - `JSON转grid_prompt` + `Code` 节点在 prompt 前拼上一段 CONSISTENCY LOCK（锁定人物数量、形象、服饰等），构造 Yunwu `gemini-3-pro-image-preview:generateContent` 请求。  
  - Yunwu 返回图片后再做格式解析/错误兜底。  
- **Supabase 节点**：  
  - `supabase-start-node-id` / `supabase-end-node-id` 读写 storyboard 任务；  
  - `supabase-update-generating` 把任务状态改为 `GENERATING_GRID`；  
  - `supabase-upload-image` 上传生成结果到 Supabase Storage（或借助预签 URL 字段）；  
  - `supabase-update-completed` 把生成的 9 张图 / prompts 回写 `storyboard_segments`，并更新主任务状态、progress。  
- **进度反馈**：还会通过 Feishu Bitable/OSS 更新记录（若 workflow 绑定 Feishu 任务表）。  
- **积分扣除**：在 Yunwu 推理和 Supabase 写回都完成后调用 `credits/deduct`（结构与脚本拆解一致）。  

---

## 共性总结
1. **Yunwu API**：  
   - 文本拆解走 `gemini-2.5-pro:generateContent`（返回 JSON）。  
   - 生图走 `gemini-3-pro-image-preview:generateContent`，请求里附带参考图 base64 + prompt 锁。  
   - 两者都用 Header Auth 凭据 `httpHeaderAuth.id = mMIH382GnJoMSu4L`。  

2. **Supabase**：  
   - 脚本拆解/故事板通过 `supabase` 节点直接更新 PostgreSQL 表。  
   - 数字人老版本以 Feishu Bitable 为进度源，但新流程（digital_human_videos）也能结合 Supabase 回写。  

3. **积分**：统一前置 `workflow-credits/query` → `api/balance/check`，最后 `api/credits/deduct`；分支失败都会通过 Webhook Respond 及时返回。  

4. **进度反馈**：  
   - Web 系列（脚本/故事板）走 Supabase 字段（`status/progress`）。  
   - 数字人走 Feishu 表字段（“拆解中/渲染中/列队满”）。  
   - 成功/失败都会 respond JSON，供前端弹 Toast。  

后续在技能流水线里复用这些模式时，可以直接引用对应节点组合、Yunwu 调用模板和积分校验套路。
