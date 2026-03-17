# 工作流与 Webhook 对接清单（n8n）

本文件用于把“前端功能 -> 后端接口 -> n8n 工作流（webhook）”的对接关系固化下来，方便后续补齐 `workflow_id` / 工作流名，并进行统一的请求体/回调体设计。

## 0. 文件与脚本位置（仓库约定）

- `workflows/`：主用工作流导出（用于对接字段核对、排障）
- `workflows/exports/`：历史导出、修复版、对比快照（不直接被运行时引用）
- `scripts/maintenance/`：工作流导出/上传/修复脚本（读取 `.vibe/credentials.env`）

## 1. 字段说明

- `feature_key`：前后端用于标识一个“功能/工作流入口”的 key（通常也是 webhook path 的命名）。
- `n8n workflow id`：n8n 平台内该工作流的唯一 ID。
- `workflow_id`（待补）：你们业务侧用于计费/路由/日志聚合的工作流标识（与 n8n 的 id 不同）。
- `workflow_name`（待补）：你们业务侧展示用名称。
- “是否异步”：是否需要回调（第三方平台生成完成后回调到 n8n，再由 n8n 回传到系统）。

## 2. n8n 对接清单（已确认）

> 下表中的 `workflow_id`（积分系统）/ `workflow_name` 已补齐。

| 功能 | feature_key | n8n workflow id | 是否异步 | workflow_id（待补） | workflow_name（待补） | 触发入口 | 目的 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 产品分析 / 产品DNA | `product_dna_web` | `yNIjqrlSnTeWDFIx` | 否 | `flow_product_dna` | 产品分析 / 产品DNA | 产品库新增/编辑后“一键分析” | 提炼结构化卖点/受众/痛点/场景 |
| 脚本拆解 | `script_extract_web` | `xXldwYS5d3lCTNwE` | 否 | `flow_script_dna` | 脚本拆解 / Script Breakdown | 脚本库新增脚本 | 拆解镜头/段落/台词/时长/节奏 |
| 爆款复刻（父工作流） | `Getway_web` | `25AIBTnvyRmfnljB` | 是 | `flow_farm_copy` | 爆款复刻 / Replication | 爆款复刻页提交任务 | 网关：接收任务并下发子工作流 |
| 爆款复刻子1：提示词 | `farm_Prompt_web` | `e9Q0InRVbw3mcRzk` | 是（链路内） |  |  | 父工作流下发 | 撰写提示词并传给 sora 子工作流 |
| 爆款复刻子2：提交第三方 | `sora_web` | `vvc2rzlS2PF4F2Tn` | 是 |  |  | 子1下发 | 调用第三方 API 平台，并携带回调地址 |
| 爆款复刻子3：第三方回调 | `sora_web_callback` | `dctPumNGHBoSokUx` | 是（回调） |  |  | 第三方平台回调 | 接收生成结果并回传系统 |
| 故事板成片（父工作流） | `storyboard_gateway_web` | `fdVRnMYZOaMTZiUg` | 是 | `flow_storyboard` | 故事板成片 / Storyboard Video | 故事板成片页提交 | 网关：接收任务并下发子工作流 |
| 故事板成片子1：生成九宫格 | `storyboard_Plot_web` | `xNY4qhKT2cwXYi0v` | 是（链路内） |  |  | 父工作流下发 | 生成九宫格图片并回传系统 |
| 故事板拆分（父工作流） | `storyboard_Split_web` | `5cvctNrq5sD5L1bX` | 否 | `flow_storyboard_Split` | 故事板拆分 / Storyboard Split | 故事板成片弹窗内“一键拆解” | 下发第三方 runninghub，把九宫格拆成9图并回传 |
| 故事板拆分子1：runninghub 回调 | `storyboard_cb_web` | `HcmywQg5HYkre2Jy` | 否（回调链路） |  |  | 第三方平台回调 | 接收拆分后的图片并回传系统 |
| 分镜管理：视频生成（父工作流） | `Veo3_gateway_web` | `GoO09FuXZAZaQqLS` | 是 | `flow_video_Veo` | Veo 视频生成 / Veo Video | 分镜管理页生成/重试/导出 | 网关：按分镜图 + 提示词生成视频 |
| 分镜管理子1：提交第三方 | `veo3_Specialoffer_web` | `MWOGfdQHNu64pFFl` | 是 |  |  | 父工作流下发 | 发起任务到第三方 API 平台 |
| 分镜管理子2：第三方回调 | `veo3-callback_web` | `Hq6nzjIdkPFUe7G3` | 是（回调） |  |  | 第三方平台回调 | 接收生成视频并回传系统 |
| 数字人（父工作流） | `Digital_Human_web` | `LdMZP60KdBPMpzLV` | 是 | `flow_Digital_Human` | 数字人 / Digital Human | 数字人页提交 | 下发第三方 runninghub 生成数字人视频 |
| 数字人子1：runninghub 回调 | `human_cb_web` | `0F9fPqexWth0Xa4J` | 是（回调） |  |  | 第三方平台回调 | 接收数字人视频并回传系统 |
| 图片生成通用工作流 | `nanoBanana_web` | `03V3RPCQozIvQMLs` | 否 | `flow_image_video_Veo` | 图片生成通用 / Image Gen | 分镜管理关键帧/批量生图 | 生成关键帧图片 |

## 2.1 工作流详情（已补齐）

### 产品分析 / 产品DNA（Product DNA）

- 触发入口：产品库「新增/编辑产品」后的一键分析
- 目的：把商品信息提炼成结构化卖点/受众/痛点/场景等
- feature_key：`product_dna_web`
- workflow_id（积分系统对应）：`flow_product_dna`
- n8n workflow id：`yNIjqrlSnTeWDFIx`
- 是否异步：否
- 代码入口（方便开发定位）
  - 前端：`components/ProductForm.tsx`
  - 后端 API：`app/api/products/analyze/route.ts`
  - n8n 调用封装：`lib/n8n.ts`

#### 对接参数与返回（关键约定）

- Webhook
  - Method：`POST`
  - Path：`/webhook/product_dna_web`
  - 关键入参（JSON body）
    - `product_id`：产品 ID（必须）
    - `api_key`：用户 API Key（必须，用于积分系统）
    - `workflow_id`：积分系统工作流 ID（必须，固定 `flow_product_dna`）
    - `workflow_name`：积分系统工作流名（可选，缺省可用“产品分析”）
    - `image_url`：产品主图 URL（建议传第一张）
    - `name` / `description`：产品名称/描述（可选，用于补充提示词）
- 返回前端结果（Respond to Webhook）
  - 前端最关键字段：`sellingPoints: string[]`（没有该数组，前端不会更新卖点）
  - 推荐返回结构
    - `ok: true`
    - `productId`: `product_id`
    - `sellingPoints`: 卖点数组
    - `detailedDescription`: 视觉描述（纯字符串，不要 stringify）
    - `workflowData`: 完整结构化 DNA（用于保存到产品 `analysisResult`）

#### 执行流程（节点级关键链路）

- 积分校验（必须先于 AI 调用）
  - `查询工作流积分`：`GET https://api.atomx.top/workflow-credits/query`
    - Query：`workflow_id`、`workflow_name`
    - 输出：`credit_cost`
  - `验证api-key`：`GET https://api.atomx.top/api/balance/check`
    - Query：`api_key`、`required`（注意不是 `amount`，否则会 422）
  - `Switch`：分三路
    - `apikey_invalid` -> `提醒-key错误`（直接 Respond to Webhook 返回错误 JSON）
    - `insufficient_points` -> `提醒-积分不足`（直接 Respond to Webhook 返回错误 JSON）
    - `pass` -> 继续分析
- 图片与模型调用
  - `下载图片`：把 `image_url` 下载成 binary（允许自签名证书 `allowUnauthorizedCerts=true`）
  - `组装请求`：将 Webhook 字段透传并组装 Gemini 请求体（重要：将 `product_id/api_key/workflow_id` 一并带到后续节点）
  - `分析Agent-视频理解`：调用 Gemini，返回 candidates/parts 文本
  - `清洗卖点数据`
    - 从 `candidates[0].content.parts[].text` 提取 JSON（兼容 ```json 包裹）
    - 必须从 `Webhook` 节点补回 `product_id/api_key/workflow_id`（中间 HTTP 节点可能丢字段）
    - 输出 `selling_points`（结构化 JSON）与 `selling_points_text`（纯文本摘要）
- 写回与扣费
  - `Supabase Update`：更新 `Product` 表（按 `id`=产品 ID）
    - 字段：`selling_points`、`selling_points_text`
    - 使用 Supabase 节点凭据，不要在 Code 节点里硬编码 Supabase key
  - `扣除积分`：`POST https://api.atomx.top/api/credits/deduct`
    - Body：`api_key`、`amount=credit_cost`、`workflow_id/workflow_name`

#### 容易踩坑（强烈建议保留的经验）

- `Respond to Webhook` 的 `Response Body` 写表达式时，用 `={{ ({ ... }) }}` 返回对象；不要在 JSON 文本模式里塞 `{{ }}`，会报 `Invalid JSON`。
- 积分校验接口参数名是 `required`；传 `amount` 会返回 422（missing required）。
- `detailedDescription` 不要 `JSON.stringify`，否则前端拿到的是带引号的字符串。
- `Supabase Update` 推荐用节点写库，避免在 Code 节点里写死 `apikey`/Host/跳过 SSL 这种临时绕行方案。
- 字段命名尽量统一 snake_case（`product_id/api_key/workflow_id/image_url`），减少 n8n 节点取值歧义。

### 脚本拆解（Script Breakdown / Script Extract）

- 触发入口：脚本库「新增脚本」
- 目的：把脚本拆成镜头/段落/台词/时长/节奏等结构化数据
- feature_key：`script_extract_web`
- workflow_id（积分系统对应）：`flow_script_dna`
- n8n workflow id：`xXldwYS5d3lCTNwE`
- 是否异步：否

### 爆款复刻（Replication / Video Replication）

- 触发入口：爆款复刻页提交任务（选择产品/脚本/国家语言/时长/数量/数字人等）
- 目的：生成复刻视频任务（异步：排队、分批产出、回传结果）
- workflow_id（积分系统对应）：`flow_farm_copy`
- feature_key：`Getway_web`
- n8n workflow id：`25AIBTnvyRmfnljB`
- 是否异步：是
- 说明：爆款复刻由 3 个子工作流配合实现
  - 子工作流1：`farm_Prompt_web`（n8n workflow id：`e9Q0InRVbw3mcRzk`）
  - 子工作流2：`sora_web`（n8n workflow id：`vvc2rzlS2PF4F2Tn`）
  - 子工作流3：`sora_web_callback`（n8n workflow id：`dctPumNGHBoSokUx`）

### 生成卖点（Selling Points Generation）

- 复用：产品分析 / 产品DNA（Product DNA）

### 生成脚本（Script Generation）

- 复用：脚本拆解（Script Breakdown / Script Extract）

### 故事板成片（Storyboard Video / Storyboard Gen）

- 触发入口：故事板成片页提交（视频/链接 + 产品 + 选项）
- 目的：先规划分镜/镜头，再生成视频
- workflow_id（积分系统对应）：`flow_storyboard`
- feature_key：`storyboard_gateway_web`
- n8n workflow id：`fdVRnMYZOaMTZiUg`
- 是否异步：是
- 说明：由 2 个工作流实现
  - 子工作流1：`storyboard_Plot_web`（n8n workflow id：`xNY4qhKT2cwXYi0v`）

### 故事板拆分

- 触发入口：故事板成片页弹窗内，九宫格图片生成后点击“一键拆解”
- 目的：
  - 将故事板拆分成 9 张图并回传系统（用于分镜首尾帧图）
  - 基于 9 宫格生成每个分镜的视频提示词（需新增一个 n8n 工作流）
- workflow_id（积分系统对应）：`flow_storyboard_Split`
- feature_key：`storyboard_Split_web`
- n8n workflow id：`5cvctNrq5sD5L1bX`
- 是否异步：否
- 说明：由 2 个工作流实现
  - 子工作流1：`storyboard_cb_web`（n8n workflow id：`HcmywQg5HYkre2Jy`）

### 分镜管理（Storyboard Management）里的“渲染/重渲染/导出”

- 触发入口：分镜管理页对某个分镜任务执行“生成/重试/导出”
- 目的：根据每个分镜图和视频提示词生成视频
- 说明：直接调用通用的 Veo 视频生成工作流（由 3 个工作流组合完成）
  - 父工作流：`Veo3_gateway_web`（n8n workflow id：`GoO09FuXZAZaQqLS`，workflow_id：`flow_video_Veo`）
  - 子工作流1：`veo3_Specialoffer_web`（n8n workflow id：`MWOGfdQHNu64pFFl`）
  - 子工作流2：`veo3-callback_web`（n8n workflow id：`Hq6nzjIdkPFUe7G3`）

### 数字人（Digital Human）

- 触发入口：数字人页提交（人像/声音/文本/口型驱动/视频合成）
- 目的：数字人驱动通常是多服务串联（TTS、LipSync、合成、审核），适合 n8n
- workflow_id（积分系统对应）：`flow_Digital_Human`
- feature_key：`Digital_Human_web`
- n8n workflow id：`LdMZP60KdBPMpzLV`
- 是否异步：是
- 说明：由 2 个工作流实现
  - 子工作流1：`human_cb_web`（n8n workflow id：`0F9fPqexWth0Xa4J`）

### 图片生成通用工作流

- 触发入口：分镜管理中生成关键帧图，或者批量生图页面
- 目的：使用图片大模型生成关键帧图片
- workflow_id（积分系统对应）：`flow_image_video_Veo`
- feature_key：`nanoBanana_web`
- n8n workflow id：`03V3RPCQozIvQMLs`
- 是否异步：否

## 3. 功能别名与复用关系

- 生成卖点（Selling Points Generation）：复用“产品分析 / 产品DNA”。
- 生成脚本（Script Generation）：复用“脚本拆解”。

## 4. 待新增工作流（需求已明确，但当前未给出 n8n id）

### 4.1 故事板拆分后的“分镜视频提示词生成”

- 触发入口：故事板成片页弹窗内九宫格生成后，“一键拆解”流程中。
- 目的：基于拆分后的 9 张图，为每个分镜生成视频提示词（用于后续 Veo 视频生成）。
- 建议 feature_key（可调整）：`storyboard_prompt_web`
- n8n workflow id：待补
- 是否异步：建议否（若生成较慢可改为异步并回调）

## 5. 约定建议（供后续对接实现时参考）

- 统一在业务侧使用 `feature_key` 做路由与日志标识；n8n 内部使用 `n8n workflow id` 管理工作流。
- 异步工作流建议统一回调结构：`task_id` / `status` / `result_url[]` / `error` / `meta`。
