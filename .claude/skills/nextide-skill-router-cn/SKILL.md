---
name: nextide-skill-router-cn
description: 中文用户的 NexTide skill 路由器。适合“我该用哪个 NexTide skill”“帮我把这个任务拆成 NexTide skills 链路”“NexTide 现在有哪些 agent 能力”等请求。
allowed-tools: Read, Bash
---

# NexTide Skill Router CN

Follow shared NexTide rules in:

- `nextide-shared`

Use this skill when the user asks:

- 这个任务应该用哪个 NexTide skill
- 帮我规划一个内容生产工作流
- NexTide 现在有哪些 skills / capabilities
- 把一个复杂任务拆成采集、分析、生成、发布步骤

## Source of Truth

Capability list:

```bash
npm run nextide -- capability list
```

JSON form:

```bash
npm run nextide -- capability list --json
```

## Routing Principles

- 先识别任务真实目标，而不是只看字面关键词。
- 优先使用最窄的 skill，不要一上来用大工作流。
- 数据采集 → 分析拆解 → 生产生成 → 发布打包，按阶段排序。
- 如果 capability 是 `planned`，必须说明“已登记但尚未接入 production runner”。
- 如果 capability 是 `available`，给出可执行命令或下一步输入要求。

## Current First-batch Routes

| 用户需求 | 推荐 Skill | Capability |
|---|---|---|
| 小红书笔记采集/爆款广场 | `xiaohongshu-note-collector` | `xhs.note.collect` |
| MD 排版成小红书卡片 | `xiaohongshu-card-layout` | `xhs.card.layout` |
| 信息卡片风格提炼/生成 | `xiaohongshu-infographic-generator` | `xhs.infographic.*` |
| 数字人视频 | `digital-human-generator` | `digital-human.video.generate` |
| 单图动作复刻 | `motion-replication` | `motion.replication.image_to_video` |
| 3D 骨骼/中视频生成 | `viral-midform-video-generator` | `viral.midform.video.generate` |
| TikTok/Instagram/Facebook 数据采集 | `social-data-collector` | `social.*.collect` |
| 产品卖点分析 | `product-selling-point-analysis` | `product.selling_point.analysis` |
| 爆款拆解并反推视频提示词 | `viral-breakdown-to-video-prompts` | `viral.breakdown.video_prompts` |
| 公众号长文 | `khazix-writer` | `content.wechat.longform.write` |
| 小红书标题/内容诊断 | DBS skills | local agent skills |

## Good Output Shape

Return:

1. 推荐 skill 或 skill chain
2. 每一步为什么用它
3. 当前 capability 状态：available / planned
4. 用户需要准备什么输入
5. 如 available，给出下一步执行命令

## Fail-fast

如果当前 NexTide capability 未接入，不要假装可以执行。说明：

- 已规划的 capability id
- 还差哪个内部 API/n8n runner
- 可用的替代 skill 或人工步骤
