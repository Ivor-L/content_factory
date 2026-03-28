import NexApiIntro from '../components/NexApiIntro';

export default function NexApi() {
  return (
    <>
      <NexApiIntro />
      <section className="mx-auto max-w-5xl space-y-8 px-4 pb-24">
        <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/5 to-black/40 p-8 backdrop-blur">
          <h2 className="text-2xl font-semibold text-white">统一任务合约 · 关键字段</h2>
          <pre className="mt-6 rounded-2xl bg-black/60 p-6 text-sm text-slate-100">
{`POST /nexapi/v1/tasks
Authorization: Bearer <token>
{
  "workflow": "digital_human",
  "payload": {
    "scriptId": "scr_123",
    "voice": "cn_female"
  },
  "callback": "https://example.com/hooks/nexapi"
}`}
          </pre>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {['多订阅 Webhook', '积分扣费策略', '实时任务看板'].map((title) => (
            <div key={title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                NexAPI 控制台提供可视化配置与监控，支持热切换与自动重试。
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
