# 小程序全局分享能力补齐计划

## 目标

补齐小蚁AI小程序右上角菜单的「发送给朋友」和「分享到朋友圈」能力，并为页面提供统一的分享标题、落点和分享图。

## 范围

- 小程序 Taro 页面配置：开启 `enableShareAppMessage` 与 `enableShareTimeline`。
- 小程序页面逻辑：统一注册 `useShareAppMessage` 与 `useShareTimeline`。
- 保留邀请页的专属邀请码分享路径。

## 方案调研

### 方案 A：只开启页面配置

- 做法：在每个页面 config 中增加 `enableShareAppMessage` / `enableShareTimeline`。
- 优点：改动最少，能让微信菜单出现分享项。
- 缺点：分享标题、图片和落点依赖默认值，体验不可控。

### 方案 B：页面配置 + 通用分享 Hook

- 做法：封装共享配置和 `useMiniappShare`，各页面启用菜单并注册分享回调。
- 优点：标题、路径、图片一致；邀请页可覆盖为专属路径；回归范围清晰。
- 缺点：需要接入所有页面入口，改动文件较多。

结论：采用方案 B。Taro 4 类型与 loader 均支持 `enableShareAppMessage`、`enableShareTimeline`、`useShareAppMessage`、`useShareTimeline`。

## 里程碑

1. 新增共享分享工具与页面配置 helper。
2. 所有主包页面与分包页面启用分享菜单。
3. 页面组件接入通用分享 Hook，邀请页保留专属分享。
4. 执行小程序构建与 weapp-dev-mcp 联调验证。

## 风险

- 页面遗漏导致个别页面右上角仍没有分享项。
- 朋友圈分享只支持标题、query 和 1:1 图片，不能使用好友分享的 path 字段。
- 微信开发者工具或自动化连接异常可能阻塞联调。

## 回滚

- 移除共享分享工具。
- 删除页面 config 中的分享开关。
- 删除页面组件中的 `useMiniappShare` 接入。

## 验收标准

- `npm run build:weapp` 通过。
- 使用 `weapp-dev-mcp` 打开关键页面，确认页面可渲染、日志无异常。
- 至少验证首页、爆款广场、我的页面与分享有礼页面的分享菜单/按钮行为。

## Tech Debt

- 后续可根据不同页面内容生成更细的分享标题和图片，例如爆款详情页分享具体作品。
