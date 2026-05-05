# 小程序分享有礼、记录页与积分记录修复计划

## 目标

- 修复小程序“分享有礼”页面接口失败时整页不可用的问题。
- 优化数字人生成记录页，避免一次性渲染大量 `Video` 组件导致页面和自动化截图超时。
- 将算力值记录中的工作流机器名展示为用户可理解的功能名称。

## 范围

- 后端：`app/api/referrals/route.ts`
- 小程序：`digital_human_miniapp/taro/src/subpages/records/*`
- 小程序：`digital_human_miniapp/taro/src/subpages/points-records/*`
- 文档索引：`docs/README.md`

## 最小调研结论

方案 A：仅在小程序前端吞掉分享有礼错误。
- 优点：改动小。
- 缺点：无法解决接口 500/表异常导致的真实失败，分享码也拿不到。

方案 B：后端接口降级返回可用结构，前端补充错误显示。
- 优点：即使邀请明细或外部用量汇总失败，也能保留分享码和基础页面能力。
- 缺点：需要明确区分硬失败和软失败。

采用方案 B。兼容 Next.js Route Handler、Supabase 查询、现有小程序请求方式与 `X-User-Api-Key` 鉴权。回滚方式是恢复 referrals 路由原先遇错即 500 的逻辑，以及恢复记录页直接渲染 `Video` 的实现。

## 分阶段

1. 后端 referrals 接口容错：邀请表读取失败时返回空列表和 warning；邀请人用量统计失败不阻塞主响应。
2. 记录页性能优化：列表只显示封面、状态和操作，点击播放/查看后进入详情页使用单个视频组件。
3. 积分记录名称映射：对常见 workflow/reason/type 机器名做中文功能名称映射，并保留未知项兜底。
4. 验证：构建、lint/typecheck、Taro 构建和 weapp-dev-mcp 页面复测。

## 风险

- 如果 `user_referrals` 表确实不存在，POST 绑定仍无法完成；GET 会先保持分享页可用。
- 记录页改为点击播放后，用户少了一步直接播放，但首屏性能更稳定。
- 名称映射可能覆盖不全，未知功能仍会展示格式化后的原始名称。

## 验收标准

- 分享有礼页面不再因为邀请明细异常直接白屏/失败，至少展示专属链接或明确错误。
- 记录页首屏不再一次性渲染多个视频组件。
- 算力值记录显示“分镜图片生成”“视频生成”“产品分析”等具体名称。
- `npm run lint`、`npm run typecheck`、`npm run build`、`npm run build:weapp` 通过。
- weapp-dev-mcp 复测相关页面 Console 无报错。

