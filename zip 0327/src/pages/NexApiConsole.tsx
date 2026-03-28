export default function NexApiConsole() {
  return (
    <section className="mx-auto max-w-5xl space-y-6 px-4 py-16">
      <p className="text-sm uppercase tracking-[0.4em] text-purple-300">NexAPI Console</p>
      <h1 className="text-4xl font-semibold text-white">控制台 · 管理密钥与任务</h1>
      <p className="text-base leading-relaxed text-slate-200">
        通过控制台可以创建/禁用 API Key、查看任务排队情况、以及查看每一次回调的 payload。下方是一个占位区域，你可以在后续对接真实的控制台 iframe 或交互表格。
      </p>
      <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 p-10 text-center text-sm text-slate-400">
        NexAPI Console Placeholder · 在此嵌入最新的控制台 UI
      </div>
    </section>
  );
}
