const testimonials = [
  {
    quote:
      '我们通过 NexAPI 将自动化产线接入 CRM，任务耗时减少 42%，流程从「多系统协作」变成「一条指令完成」。',
    author: 'Growth OPS · Carrie',
  },
  {
    quote:
      'OpenClaw 让我们从脚本到数字人审核全程可视，跨部门沟通彻底在线化。',
    author: '创意总监 · Lucas',
  },
  {
    quote:
      'Infinite Canvas 是最直观的策略白板，节点之间的关系一目了然，复盘效率翻倍。',
    author: 'Strategy Lead · Mavis',
  },
];

export default function Testimonials() {
  return (
    <section className="border-y border-white/5 bg-[#050505] py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-3xl font-semibold text-white">团队反馈</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {testimonials.map((item) => (
            <figure key={item.author} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <blockquote className="text-sm leading-relaxed text-slate-100">
                “{item.quote}”
              </blockquote>
              <figcaption className="mt-4 text-xs font-semibold uppercase tracking-wide text-purple-200">
                {item.author}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
