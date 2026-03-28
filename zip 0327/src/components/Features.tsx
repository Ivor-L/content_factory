const features = [
  {
    title: 'NexAPI 合约层',
    description: '统一的 API 入口，封装任务队列、积分结算、回调事件，让你的业务只关注业务逻辑。',
  },
  {
    title: 'OpenClaw 多角色调度',
    description: '可视化代理，分派脚本、分镜与数字人任务，实时输出状态流。',
  },
  {
    title: 'Infinite Canvas',
    description: '无限画布模式，使用 @xyflow/react 构建节点流，实现跨项目的结构化思考。',
  },
];

export default function Features() {
  return (
    <section className="border-t border-white/5 bg-black py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-3xl font-semibold text-white">系统能力地图</h2>
        <p className="mt-3 max-w-2xl text-slate-300">
          NexTide.AI 用模块化引擎重构增长流程，无缝衔接内容产线与运营系统。
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
