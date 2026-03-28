---
description: 前端 UI 组件与 Canvas 模块规范
paths: "components/**,app/(main)/**,app/(auth)/**,app/(site)/**,app/(admin)/**,hooks/**"
---

# 前端 UI 规范

## 组件规范
- 所有组件必须定义 TypeScript Props 接口，不允许 `props: any`
- 使用 Tailwind CSS 编写样式，禁止内联 `style={{}}`，禁止新建 `.module.css`
- 动画优先使用已引入的 `framer-motion` 或 `gsap`，不引入额外动画库
- 图标统一使用 `lucide-react`，不引入其他图标库
- Toast 提示使用 `react-hot-toast`，不使用 `alert()`

## Canvas 模块（`app/(main)/canvas/`）
- 模型列表和别名映射在 `useCanvasModels.ts` 中维护
- 模型调用逻辑在 `useCanvasOrchestrator.ts` 中
- 当前 nano-banana-pro = `gemini-3.1-pro-preview`（旧名 `gemini-3-pro-preview` 已下线）
- 新增模型时，必须同步更新 `lib/canvasCredits.ts` 中的 `aliases` 数组

## 数据获取
- 优先使用 Next.js Server Actions（`app/actions/`）
- 客户端 fetch 封装在 `lib/api.ts`，不直接在组件中裸写 fetch

## 响应式
- 移动端优先（mobile-first），使用 Tailwind 响应式前缀 `sm:` / `md:` / `lg:`
