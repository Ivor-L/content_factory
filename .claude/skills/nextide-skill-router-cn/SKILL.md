---
name: nextide-skill-router-cn
description: 中文用户的 NexTide skill 路由器。适合“我该用哪个 NexTide skill”“帮我把这个任务拆成 NexTide skills 链路”“NexTide 现在有哪些 agent 能力”等请求。
allowed-tools: Read, Bash
---

# NexTide Skill Router CN

Follow shared NexTide rules in:

- `nextide-shared`

## Source of Truth

```bash
nextide capability list
```

## Routing Principles

- 先识别任务真实目标，而不是只看字面关键词。
- 优先使用最窄的 skill，不要一上来用大工作流。
- 数据采集 → 分析拆解 → 生产生成 → 发布打包，按阶段排序。
- 如果 capability 不是 `available`，必须说明“已登记但尚未接入 production runner”。
- 如果 capability 是 `available`，给出可执行命令或下一步输入要求。
- TikTok 博主蒸馏、账号爆款打法拆解、创作者内容公式提炼 → 优先使用 `tiktok-creator-distiller`。该 skill 是 workflow MVP，复用 `social.tiktok.collect` + `viral.breakdown.video_prompts`。

<!-- BEGIN NEXTIDE AUTO-GENERATED -->

## Current Capability Routes

| 用户需求 | 推荐 Skill | Capability | Status | Tags |
|---|---|---|---|---|
| 小红书笔记采集 | `xiaohongshu-note-collector` | `xhs.note.collect` | `available` | xiaohongshu, collection, hot-square, viral-reference |
| 小红书图文排版 | `xiaohongshu-card-layout` | `xhs.card.layout` | `available` | xiaohongshu, layout, markdown, cards |
| 小红书信息卡片风格提炼 | `xiaohongshu-infographic-generator` | `xhs.infographic.style.extract` | `available` | xiaohongshu, style, infographic, style-dna |
| 小红书信息卡片生成 | `xiaohongshu-infographic-generator` | `xhs.infographic.generate` | `available` | xiaohongshu, infographic, image-generation |
| 视频数字人生成 | `digital-human-generator` | `digital-human.video.generate` | `available` | digital-human, video, long-running |
| 动作复刻 | `motion-replication` | `motion.replication.image_to_video` | `available` | motion, replication, image-to-video |
| 爆款中视频生成 | `viral-midform-video-generator` | `viral.midform.video.generate` | `available` | midform-video, storyboard, 3d-skeleton |
| 爆款拆解并反推视频提示词 | `viral-breakdown-to-video-prompts` | `viral.breakdown.video_prompts` | `available` | viral-breakdown, video-prompts, replication, viral-clone, smart-remix |
| TikTok 数据采集 | `social-data-collector` | `social.tiktok.collect` | `available` | tiktok, social, collection, creator-research |
| Instagram 数据采集 | `social-data-collector` | `social.instagram.collect` | `available` | instagram, social, collection |
| Facebook 数据采集 | `social-data-collector` | `social.facebook.collect` | `available` | facebook, social, collection |
| 社媒评论抓取 | `social-data-collector` | `social.comments.collect` | `available` | comments, audience-language, tiktok |
| 产品卖点分析 | `product-selling-point-analysis` | `product.selling_point.analysis` | `available` | product, selling-points, analysis |
| 短视频 Hook 设计 | `short-video-hook-designer` | `content.hook.design` | `available` | hook, short-video, local-agent, pre-generation |
| 参考开头结构解码 | `reference-opening-decoder` | `reference.decode` | `available` | reference, hook, decode, short-video, local-agent |
| 视频提示词生成前 QA | `video-prompt-preflight-qa` | `prompt.preflight.qa` | `available` | prompt-qa, preflight, video, cost-guard, local-agent |
| 视觉开头优化 | `visual-hook-optimizer` | `content.visual_hook.design` | `available` | visual-hook, first-frame, cover, short-video, local-agent |
| 短视频开头模式路由 | `opening-pattern-router` | `content.opening_pattern.route` | `available` | hook-router, opening-pattern, short-video, local-agent |
| 小红书标题生成 | `xiaohongshu-title-generator` | `content.xhs.title.generate` | `available` | xiaohongshu, title, copywriting, local-agent |
| 小红书笔记正文写作 | `xiaohongshu-note-writer` | `content.xhs.note.write` | `available` | xiaohongshu, note, copywriting, local-agent |
| 内容一鱼多吃打包 | `content-repurpose-packager` | `content.repurpose.pack` | `available` | repurpose, multi-platform, content-pack, local-agent |
| 内容日历规划 | `content-calendar-planner` | `content.calendar.plan` | `available` | calendar, planning, content-strategy, local-agent |
| 广告文案变体生成 | `ad-copy-variant-generator` | `content.ad.copy.variants` | `available` | ad-copy, variants, performance, local-agent |
| 产品内容角度矩阵 | `product-content-angle-matrix` | `product.angle.matrix` | `available` | product, angle-matrix, content-strategy, local-agent |
| 竞品对标 Brief | `competitor-benchmark-brief` | `competitor.benchmark.brief` | `available` | competitor, benchmark, brief, local-agent |
| 短视频分镜脚本规划 | `short-video-storyboard-planner` | `script.storyboard.plan` | `available` | storyboard, short-video, script, prompt, local-agent |
| 公众号长文写作 | `wechat-longform-writer` | `content.wechat.longform.write` | `available` | wechat, longform, writing |
| 淘金任务匹配 | `nextide-earn-market` | `earn.task.list` | `available` | earn, task-market, monetization |
| 淘金任务接单 | `nextide-earn-market` | `earn.task.apply` | `available` | earn, task-market, apply |
| 淘金任务提交证据 | `nextide-earn-market` | `earn.task.submit_evidence` | `available` | earn, task-market, evidence |
| 插件小红书当前页采集 | `nextide-browser-plugin` | `plugin.xhs.collect` | `available` | plugin, xiaohongshu, collect |
| 插件小红书发布辅助 | `nextide-browser-plugin` | `plugin.xhs.publish` | `available` | plugin, xiaohongshu, publish |
| 插件账号同步指令 | `nextide-browser-plugin` | `plugin.account.sync` | `available` | plugin, account, sync |

<!-- END NEXTIDE AUTO-GENERATED -->

## Good Output Shape

Return:

1. 推荐 skill 或 skill chain
2. 每一步为什么用它
3. 当前 capability 状态
4. 用户需要准备什么输入
5. 如 available，给出下一步执行命令
