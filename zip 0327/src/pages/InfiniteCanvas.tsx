import { ReactFlowProvider } from '@xyflow/react';

export default function InfiniteCanvas() {
  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-16">
      <p className="text-sm uppercase tracking-[0.4em] text-purple-300">Infinite Canvas</p>
      <h1 className="text-4xl font-semibold text-white">无限画布 · Strategy Whiteboard</h1>
      <p className="text-base leading-relaxed text-slate-200">
        这里保留了 React Flow Provider，后续可以把节点、边、快捷键等能力补全。当前示例仅放置一个可扩展的占位层，方便继续接入。
      </p>
      <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 p-8">
        <ReactFlowProvider>
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">
            Infinite Canvas Placeholder · 未来可加载 @xyflow/react 的画布实例
          </div>
        </ReactFlowProvider>
      </div>
    </section>
  );
}
