const tiers = [
  {
    name: 'Starter',
    price: '¥3,999 / 月',
    bullets: ['10 万 API Credits', 'OpenClaw 单工作区', '基础无限画布模板'],
  },
  {
    name: 'Growth',
    price: '¥12,999 / 月',
    bullets: ['50 万 API Credits', '多工作区 + 审批流', 'NexAPI 专属支持'],
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '定制方案',
    bullets: ['私有化部署', '积分结算对接', '联合 roadmap'],
  },
];

export default function Pricing() {
  return (
    <section className="bg-black py-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-purple-300">Pricing</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">根据团队规模灵活选择</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-3xl border border-white/10 p-6 ${tier.highlighted ? 'bg-white text-black shadow-2xl' : 'bg-white/5 text-white'}`}
            >
              <h3 className="text-xl font-semibold">{tier.name}</h3>
              <p className="mt-4 text-2xl font-bold">{tier.price}</p>
              <ul className="mt-6 space-y-2 text-sm">
                {tier.bullets.map((bullet) => (
                  <li key={bullet} className="leading-relaxed">
                    {bullet}
                  </li>
                ))}
              </ul>
              <button
                className={`mt-8 w-full rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  tier.highlighted
                    ? 'border-black/10 bg-black text-white'
                    : 'border-white/30 text-white hover:bg-white/10'
                }`}
              >
                联系我们
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
