# 爆款复刻 Prompt 改造说明（n8n）

## 已改造的流程文件

- `workflows/内容工厂-提示词子流程-网页版.json`
- `workflows/爆款拆解-Veo3&sora-网页版.json`
- `workflows/sora2视频生成-发起-网页版云雾.json`

## 你可以去哪里改提示词

### 1) 复刻提示词（产品卖点 + 脚本 -> Sora 提示词）

文件：`workflows/内容工厂-提示词子流程-网页版.json`  
节点：`标准化输入`

在 `RECIPE_REGISTRY['hot_clone@v1'].prompts` 里改这两个字段：

- `clone_system`：系统提示词（最重要）
- `clone_user`：用户提示词模板（会注入产品信息、拆解报告等变量）

说明：
- `脚本生成器` 节点已经改成只读取：
  - `{{$json.clone_system_prompt}}`
  - `{{$json.clone_user_prompt}}`
- 所以后续改词只需要改 `标准化输入` 一个节点。

### 2) 拆解提示词（上传脚本视频 -> 拆解 JSON）

文件：`workflows/爆款拆解-Veo3&sora-网页版.json`  
节点：`组装请求`

默认提示词在：
- `DEFAULT_EXTRACT_SYSTEM_PROMPT`

也支持请求体动态覆盖：
- `prompt_overrides.extract_system`
- 或 `extract_system_prompt`

## 支持运行时覆盖（不用改工作流）

你可以在请求 body 里传：

```json
{
  "recipe_id": "hot_clone",
  "recipe_version": "v1",
  "prompt_overrides": {
    "clone_system": "你的复刻系统提示词",
    "clone_user": "你的复刻用户提示词模板",
    "extract_system": "你的视频拆解系统提示词"
  }
}
```

## 本次额外改动

- `sora2视频生成-发起-网页版云雾.json`
  - `清洗提示词`：`model` 优先读取入参（支持 `sora2 -> sora-2-all` 映射）
  - `选择回调地址`：优先读取 `payload.callback_url`，否则按 `workflow_id_for_credits` 映射
  - `注册轮询任务`：轮询 `api_key` 支持 `poll_api_key` 或环境变量 `FLOWONN_POLL_API_KEY`
