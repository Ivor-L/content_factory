export default function OpenClaw() {
  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-16">
      <p className="text-sm uppercase tracking-[0.4em] text-purple-300">OpenClaw</p>
      <h1 className="text-4xl font-semibold text-white">OpenClaw · 多角色内容调度</h1>
      <p className="text-base leading-relaxed text-slate-200">
        OpenClaw 聚焦在多代理协作：脚本、分镜、数字人、素材审核等节点都能拆成一个可追踪的任务。通过动作面板，你可以将不同技能栈的成员拉进一条生产线，同时通过回调把结果同步回你自己的系统。
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold text-white">核心特性</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li>节点级权限：脚本、审稿、投放团队拥有不同视图。</li>
            <li>状态流 &amp; 评论：每一步都有上下文，不用来回截图。</li>
            <li>自动触发 NexAPI 任务，保持与后端同步。</li>
          </ul>
        </article>
        <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold text-white">常见使用场景</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li>新产品发布会：脚本 → 分镜 → 数字人 demo。</li>
            <li>跨境素材本地化：自动识别语种和口播模型。</li>
            <li>复盘会议：直接导出为 PDF / Notion。</li>
          </ul>
        </article>
      </div>
    </section>
  );
}
