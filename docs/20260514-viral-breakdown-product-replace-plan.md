# 爆款短视频复刻：产品替换与人物保护优化计划

## 背景

当前「爆款短视频复刻」已能输出 HTML 拆解报告、分镜网格图、源视频分析、节奏拆解、口播文案、爆款机制与 Clip 级提示词。下一步需要把报告后的交互升级为：

1. 报告生成后，询问用户是否需要替换人物或产品。
2. 支持用户上传产品图。
3. 遵守 Seedance 2.0 限制：不上传真人图片，不进行真人身份迁移。
4. 对出现人物的参考分镜/画面做脸部模糊处理。
5. 用户上传产品图后，调用 `image2` 执行产品替换。
6. 替换原则：保持原分镜图所有视觉结构完全不变，仅替换指定产品元素。

## 最小调研结论

### 现有可复用链路

- `docs/05-n8n/miniapp-viral-breakdown-workflow.md` 已明确：后续 image2 洗图只导入用户选择的产品图和参考帧，不导入人物/角色参考。
- `docs/20260505-miniapp-remix-subject-replace-plan.md` 已设计小程序第二阶段「替换产品/角色」，并确认 image2 可作为默认图片编辑模型。
- `app/api/miniapp/canvas/images/jobs/route.ts` 已有 `image2` 工作流入口，并已接入积分配置：`miniapp_canvas_image:image2`。
- `scripts/seed-credit-configs.ts` 已包含：
  - `miniapp_canvas_image:image2`
  - `storyboard_image:image2`

### 方案对比

#### 方案 A：Agent 直接调用 image2 能力（最终采用）

- 做法：爆款报告生成后，Agent 询问用户是否上传产品图；用户上传后，Agent 将产品图上传 OSS，然后在 Agent capability runner 内直接调用 `generateCanvasImageOnServer()` 的 image2 能力。
- 优点：不再绕 n8n，不依赖原 storyboard image workflow；链路短，调试透明；复用 Canvas image2 上游和积分扣费。
- 缺点：需要在 Agent capability 中补结果解析、artifact 输出、参考图安全处理。
- 结论：采用。

#### 方案 B：继续调用原 image2 n8n 工作流

- 做法：通过 `/api/miniapp/canvas/images/jobs` 或 storyboard image workflow 触发 image2。
- 优点：已有小程序链路。
- 缺点：用户已明确“不用原来的工作流”；链路长，结果回流慢。
- 结论：不采用。

### 兼容性结论

- Next.js：可复用现有 API 路由和 OSS 上传逻辑。
- Prisma：第一阶段不新增 schema；替换结果可先通过 artifact 输出，或写入 `storyboard_segments.generatedImage` / `generationParams`。
- Supabase：不需要新增表。
- n8n：本优化不使用原 storyboard image/image2 工作流；Agent 直接调用 image2 server 能力。
- 积分：必须走后台积分配置，不硬编码最终扣费；优先复用 `miniapp_canvas_image:image2` 或 `storyboard_image:image2`。
- Seedance 2.0：不把真人脸作为参考输入；人物分镜中的参考图需要人脸模糊后才能进入后续视频/图像生成上下文。

## 目标

### 用户体验目标

报告完成后，Agent 追加一句明确询问：

```text
是否需要继续替换产品？你可以上传产品图，我会在保持原分镜视觉结构不变的前提下，仅替换产品元素。
如果画面里有人物，我会先对人脸做模糊处理；Seedance 2.0 不支持真人图片参考，因此不会上传或迁移真人身份。
```

如果用户说要替换人物：

- 默认不接受真人图片用于 Seedance 2.0。
- 可解释：当前只支持产品替换；人物只能做非真人/虚拟角色或遮挡/模糊处理，不能上传真人脸做参考。

如果用户上传产品图：

- 上传产品图到 OSS。
- 从拆解结果中找出包含产品的分镜/Clip 或用户指定分镜。
- 对含人物参考帧执行脸部模糊。
- 调用 image2 进行产品替换。
- 返回替换后的图片预览、可点击 HTML 报告链接、后续生成视频片段入口。

## 范围

### 第一阶段范围

- 技能文档更新：报告后追加产品替换追问。
- Agent 输出规则更新：明确人物/产品替换边界。
- CLI/HTML 报告：增加「下一步：替换产品」提示区。
- 产品替换 Prompt 模板：生成 image2 专用替换提示词。
- 明确积分 key：优先使用 `storyboard_image:image2` 或 `miniapp_canvas_image:image2`。

### 第二阶段范围

- 增加 Agent 编排命令或 capability：输入 `taskId + productImage + selectedScenes`，调用 image2。
- 增加人脸模糊预处理：对参考帧中人物脸部区域进行模糊后再作为结构参考。
- 替换结果 artifact：输出替换图、manifest、preview.html。

## 关键规则

### 1. Seedance 2.0 真人限制

- 禁止把用户上传真人图片作为 Seedance 2.0 参考图。
- 禁止从源视频中抽取真人脸作为角色参考。
- 出现人物的参考帧必须做脸部模糊或遮挡。
- 用户要求替换人物时，默认解释限制并建议改为产品替换或非真人角色。

### 2. 产品替换 Prompt 模板

```text
Use the storyboard/reference frame as the structural anchor.
Keep the entire visual structure exactly unchanged: same camera angle, composition, lighting, background, pose, object positions, perspective, depth of field, color tone, and UGC phone-shot texture.
Only replace the specified product with the product shown in the uploaded product reference image.
Do not change the person, pet, scene, hand pose, camera framing, text layout, or any other object.
If a face appears in the reference frame, keep it blurred/anonymized and do not reconstruct identity.
No new logos or text unless they are visible on the product reference image.
Output a natural photorealistic image.
```

中文说明：

```text
以分镜参考帧为结构锚点。保持原画面的镜头角度、构图、光线、背景、人物/宠物姿态、物体位置、透视、景深、色调和手机 UGC 质感完全不变。仅将指定产品替换为用户上传产品图中的产品。不要改变人物、宠物、场景、手势、画幅、文字布局或其他物体。如果参考帧中出现人脸，保持模糊/匿名化，不还原身份。
```

### 3. 替换对象选择

默认选择：

- 默认替换所有 `has_product=true` 的 scenes/segments。
- 仅当用户明确指定 `sceneOrder` 或 `replaceMode=single` 时，才只替换单个分镜。
- 如果没有明确产品分镜，则回退使用分镜网格图/参考帧进行一次产品替换，并提示用户可指定具体分镜。

### 4. 产物展示

替换完成后返回：

- 替换后图片预览。
- 原分镜网格图链接。
- 产品替换结果 HTML/preview 链接。
- 可继续生成视频片段的下一步提示。

## 分阶段实施

### Phase 1：技能与报告输出优化

- 更新 `viral-breakdown-to-video-prompts` skill：报告后必须询问产品替换。
- 更新 HTML 报告「下一步」区：突出上传产品图替换产品。
- 增加 Seedance 2.0 真人限制说明。

### Phase 2：Agent 产品替换编排

- 新增 Agent capability：`viral.breakdown.product_replace`。
- 识别用户后续上传的产品图。
- 上传产品图到 OSS。
- 从 run result 或 taskId 中读取 `detailedBreakdown.scenes`、`segments`、`storyboard_grid_url`。
- 默认选择所有 `has_product=true` 分镜；用户指定 `sceneOrder` 时才单独替换。
- 组装 image2 prompt。
- 在 runner 内直接调用 `generateCanvasImageOnServer({ model: 'image2', images: [safeReferenceFrame, productImage], prompt })`。
- 解析返回图片 URL/data URL，作为 Agent artifacts 返回。

### Phase 3：人脸模糊预处理

- 对 `has_person=true` 的参考帧执行脸部模糊。
- 若暂时没有自动脸检能力，第一版先在 prompt 和流程中禁止使用真人身份参考，并只使用产品图 + 已匿名化/网格结构图。
- 第二版接入自动检测/模糊工具后再允许参考帧进入 image2。

### Phase 4：结果回写和展示

- 替换图作为 artifact 输出。
- 可选回写 `StoryboardSegment.generatedImage` 和 `generationParams.product_replace`。
- HTML 报告增加「产品替换结果」区。

## 风险

- image2 可能改变画面结构：通过强约束 prompt 和参考图顺序降低风险。
- 人脸模糊如果不到位，可能违反 Seedance 2.0 真人参考限制：第一版宁可不用人物参考帧，也不上传真人脸。
- 产品图可能包含真人模特：需要提示用户上传纯产品图；如产品图含真人，要求裁剪为纯产品或做人物模糊。
- 积分扣费必须使用后台配置，不能新增硬编码价格。

## 回滚策略

- 若产品替换失败，不影响已生成的拆解报告。
- 保持第一阶段拆解 capability 不变。
- image2 替换作为可选后续步骤，失败时返回原因和重试建议。

## 验收标准

- 拆解报告生成后，Agent 会主动询问是否上传产品图替换产品。
- 用户上传产品图后，默认替换所有出现产品的分镜；不会要求或上传真人图片。
- 对 `has_person=true` 的场景，流程会执行或声明人脸模糊/匿名化保护。
- image2 prompt 明确「保持视觉结构完全不变，仅替换指定产品」。
- 替换结果能以可点击链接或预览形式返回。
- `npm run lint`、`npm run typecheck` 通过。

## Tech Debt

- 当前缺少独立的 Agent 产品替换 capability，需要新增 `viral.breakdown.product_replace` 并封装 image2 直接调用。
- 自动人脸检测/模糊能力尚未标准化，需要抽象为复用工具。
- StoryboardTask 对「替换图」的版本管理还不清晰，后续建议增加替换历史或 artifact manifest。
