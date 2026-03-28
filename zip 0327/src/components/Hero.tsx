const gallery = [
  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97',
  'https://images.unsplash.com/photo-1489515217757-5fd1be406fef',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e',
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa',
  'https://images.unsplash.com/photo-1483058712412-4245e9b90334',
  'https://images.unsplash.com/photo-1500534623283-312aade485b7',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e',
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-black via-black to-[#050505] py-24">
      <div className="absolute inset-0 opacity-60">
        <div className="mx-auto grid max-w-5xl grid-cols-4 gap-4 px-8 blur-[2px]">
          {gallery.map((src) => (
            <div
              key={src}
              className="h-48 rounded-[28px] bg-cover bg-center shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
              style={{ backgroundImage: `url(${src}?auto=format&fit=crop&w=400&q=60)` }}
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/70 to-black" />
      </div>

      <div className="relative mx-auto flex max-w-5xl flex-col gap-8 px-4 text-center">
        <div className="inline-flex items-center justify-center gap-2 self-center rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-medium text-white/80 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-white" />
          NexTide 2.0 is Live
        </div>
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.6em] text-white/80">NexTide</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white drop-shadow md:text-6xl">
            下一道生产力浪潮
          </h1>
          <p className="mx-auto max-w-2xl text-base text-slate-200 md:text-lg">
            为品牌方和个人提供 AI 内容营销智能体，一键复刻 TikTok、小红书爆款，Sora2 &amp; Veo3 双擎驱动，让内容营销更简单。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-black shadow-xl transition hover:translate-y-0.5 hover:bg-slate-100">
            立即开启浪潮
          </button>
          <button className="rounded-full border border-white/30 px-8 py-3 text-sm font-semibold text-white/80 transition hover:text-white">
            观看演示
          </button>
        </div>
      </div>
    </section>
  );
}
