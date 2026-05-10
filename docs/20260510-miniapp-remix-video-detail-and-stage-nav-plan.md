# 小程序智能复刻第三阶段视频详情与阶段导航计划

## 目标

- 第三阶段视频生成页在生成中和生成完成后隐藏提示词，只展示视频/生成占位。
- 竖构图视频完整展示，并与占位区高度对齐。
- 点击视频进入专用视频详情页，顶部展示视频，底部支持修改提示词、选择模型、设置时长、增加参考图片并重新生成。
- 三阶段导航按当前页面点亮，其他节点灰色，并支持点击切换到对应阶段页面。

## 范围

- 小程序第三阶段页面：`digital_human_miniapp/taro/src/subpages/remix-video-generate/index.tsx`
- 新增视频详情页：`digital_human_miniapp/taro/src/subpages/remix-video-detail/`
- 阶段二分镜板页导航：`digital_human_miniapp/taro/src/subpages/storyboard-board/index.tsx`
- 小程序路由配置：`digital_human_miniapp/taro/src/app.config.ts`
- 文档索引：`docs/README.md`

## 最小调研

### 方案 A：复用通用作品详情页

- 优点：少建页面，视频展示已有基础能力。
- 缺点：通用详情页承担作品删除、下载、文案等多类型逻辑，加入分镜片段编辑会增加耦合，且不便复用第二阶段素材/重生成语义。

### 方案 B：新增智能复刻视频片段详情页

- 优点：页面语义清晰，只处理 storyboard segment 的视频编辑与重生成；不会污染通用作品详情。
- 缺点：需要新增一个路由和样式文件。

### 结论

采用方案 B。第三阶段主页只负责视频展示和阶段跳转，视频编辑与重生成集中到专用详情页。

## 兼容性

- Taro/微信小程序：新增 subPackage 页面，沿用现有 `miniappApi.updateStoryboardSegment()` 与 `miniappApi.generateStoryboardVideos()`。
- Next.js API：不新增接口，继续使用 `/api/storyboard/[id]/generate-videos`，模型、时长、参考图通过已有字段传递。
- Seedance 2.0：保留第三阶段必须使用第二步选中的分镜图作为主参考图；用户新增图片只作为额外参考，不替换主参考图。

## 风险与回滚

- 风险：视频详情页新增参考图可能触发火山敏感内容拦截。
- 风险：阶段导航如果任务尚未产生分镜，切到后续阶段需要给出提示。
- 回滚：移除新增详情页路由，第三阶段恢复原列表编辑弹窗。

## 验收标准

- 第三阶段生成中/完成状态不展示提示词正文。
- 视频区域使用 `objectFit=contain`，竖屏视频与生成占位高度一致。
- 点击已生成视频进入详情页，详情页可修改提示词、模型、时长、上传参考图并重新生成。
- 点击阶段 1/2/3 分别进入爆款拆解、产品/角色替换、视频生成页面，并只点亮当前阶段。

## Tech Debt

- `storyboard-board` 当前阶段导航仍混合了局部切换和路由跳转语义，后续可抽成共享 `RemixStageNav` 组件。
