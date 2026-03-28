import { motion } from "motion/react";
import { ArrowRight, Cpu, Zap, Globe } from "lucide-react";
import { Link } from "react-router-dom";

export default function NexApiIntro() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7 }}
        className="bg-gradient-to-br from-[#0A0A0A] to-[#111111] border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col items-center relative p-10 lg:p-16 text-center"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05)_0%,transparent_60%)] pointer-events-none"></div>
        
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-8">
          <span className="text-sm font-medium text-slate-300 tracking-wide">全新推出</span>
        </div>

        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-6 leading-tight">
          NexAPI：聚合全球顶尖 AI
        </h2>
        
        <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-12 leading-relaxed font-light">
          一站式大模型 API 中转平台。通过单一接口，无缝调用全球 500+ 主流大模型。企业级高并发且极致稳定，调用成本仅为官方的 1/10。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 w-full max-w-4xl">
          <div className="bg-black/50 border border-white/5 rounded-2xl p-6 text-left">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-4">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">500+ 模型全覆盖</h3>
            <p className="text-sm text-slate-400">涵盖文本、图像、音视频等多模态大模型，应有尽有。</p>
          </div>
          <div className="bg-black/50 border border-white/5 rounded-2xl p-6 text-left">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-4">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">极致性价比</h3>
            <p className="text-sm text-slate-400">以官方 1/10 的价格，享受同等级别的 AI 生成能力。</p>
          </div>
          <div className="bg-black/50 border border-white/5 rounded-2xl p-6 text-left">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-4">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">企业级稳定</h3>
            <p className="text-sm text-slate-400">智能路由与高可用架构，告别接口报错与限流。</p>
          </div>
        </div>

        <Link 
          to="/nexapi"
          className="px-8 py-4 rounded-full bg-white text-black font-semibold text-lg hover:bg-gray-200 hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2 shadow-[0_0_40px_rgba(255,255,255,0.2)]"
        >
          了解 NexAPI 详情
          <ArrowRight className="w-5 h-5" />
        </Link>
      </motion.div>
    </section>
  );
}
