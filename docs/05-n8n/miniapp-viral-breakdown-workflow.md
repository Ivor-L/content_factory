# 小程序首页爆款拆解工作流

## 目标

将原飞书版 `视频克隆-视频拆解-分镜图` 改造成小程序首页「爆款复刻」的第一步：爆款拆解。新流程输入爆款视频 URL，输出可直接给前端展示和后续复刻使用的结构化结果。项目只保留一个爆款拆解触发变量：`N8N_STORYBOARD_BREAKDOWN_WEBHOOK`，其默认值指向这个 workflow。

- 全片 5 列分镜网格图，上传 OSS。
- 超过 15 秒时，额外输出每个 <=15 秒片段的分段分镜板。
- 中文内容结构：开头钩子、中间铺垫、高潮、结尾 CTA。
- 复刻提示词：全局复刻提示词 + 分段提示词。
- 分镜 segments：兼容现有 `/api/webhook/storyboard-breakdown` 回调。
- 后续 image2 洗图只导入用户选择的产品图和参考帧，不导入人物/角色参考。

## 最小调研结论

方案 A：继续使用旧飞书工作流，增加网格图节点。

- 优点：改动少。
- 缺点：依赖飞书表格字段和文件 token，不适合小程序首页直连；输出不易沉淀到现有 StoryboardTask。

方案 B：基于 `分镜拆解-网页版oss.json` 新建小程序专用工作流。

- 优点：已有 Webhook、OSS 上传、App 回调链路；可直接复用小程序/Web 的 StoryboardTask 状态与详情页。
- 缺点：需要维护一个新的 n8n 导出。

采用方案 B。

## 关键设计

### 分镜网格

使用 ffmpeg 从完整视频抽取关键帧并拼接网格：

- 默认每 1 秒抽 1 帧。
- 最大抽帧数默认 40，避免超长视频生成过大的网格。
- 网格固定 5 列，行数按帧数自动计算。
- 每帧左上角绘制时间戳与帧序号。

### 超过 15 秒

超过 15 秒必须输出多个分段分镜板：

- `storyboard_grid_url`：全片总览网格，用于首页展示与整体理解。
- `clip_boards[]`：按 <=15 秒切分的分段网格，每段独立上传 OSS。
- `clone_prompt.clips[]`：每个分段一个可生成提示词。

切分原则优先按真实内容节奏；n8n 侧先按 15 秒窗口生成片段网格，Gemini 在内容分析中再输出更细的 `scenes` 和四段结构。

复刻提示词严格参考 Arcads skill 的处理方式：超过 15 秒时不输出一个超长提示词，而是拆成多个 15 秒内的 clip，并按顺序生成：

```text
Clip 1：正常生成，建立人物/产品/场景/节奏
Clip 2：承接 Clip 1 结尾状态，继续生成
Clip 3：承接 Clip 2 结尾状态，继续生成
```

每个 `clone_prompt.clips[]` 必须包含：

- `clip_index`
- `time_range`
- `duration`，必须 `<= 15`
- `role`，例如 `hook` / `setup` / `climax` / `cta`
- `prompt`
- `start_state`
- `end_state`
- `handoff_to_next`

### 模型

拆解模型使用：

`/v1beta/models/gemini-3.1-flash-lite-preview:generateContent`

模型输入包含视频本体和全片网格图，要求输出严格 JSON。

### OSS 上传

图片上传复用现有 OSS 接口：

`POST https://atomx.top/api/upload/image`

以 multipart form-data 上传 binary 字段 `file`，返回的 `url` 作为网格图地址。

## 输出契约

`workflow_data` 至少包含：

- `pipeline_key`: `miniapp_viral_breakdown_grid`
- `storyboard_grid_url`
- `clip_boards`
- `content_structure`
- `clone_prompt`
- `segments`
- `analysis_model`

`segments` 保持兼容现有回调字段：`time_range`、`duration`、`original_script`、`image_prompt`、`video_prompt`、`visual_description`、`camera_notes`、`lighting_notes`、`has_person`、`has_product`。

后续产品替换约定：

- `generation_params.subject_refs` 只写入 `product` 和 `reference_frame`。
- 即使原视频中有人物，`has_person` 只表示画面里有人，不代表导入人物参考图。
- 生图 webhook 入参固定传 `product_image_url`、`reference_frame_url`、`image_edit_mode=product_replace`，`character_image_url` 为 `null`。
- image2/Gemini 请求中产品图用于替换产品身份，参考帧用于保持构图、镜头、光线和场景，不做真人身份迁移。

## 风险与回滚

- ffmpeg 抽帧失败：工作流应报错，前端任务进入失败态。
- Gemini JSON 不稳定：解析节点做 fenced JSON 清洗和尾逗号容错；仍失败则抛错。
- OSS 上传失败：保留本地临时文件路径在错误日志中，便于 n8n 重试。
- 回滚：继续使用原 `视频克隆-视频拆解-分镜图.json` 或 `分镜拆解-网页版oss.json`，新工作流不覆盖旧文件。

## 验收标准

- n8n 导入 `workflows/小程序首页-爆款拆解-分镜网格-OSS.json` 无 JSON 错误。
- 小于等于 15 秒视频输出 1 张全片网格，`clip_boards` 至少 1 项。
- 大于 15 秒视频输出全片网格 + 多个分段网格。
- App 回调能被 `/api/webhook/storyboard-breakdown` 接收并创建 segments。
