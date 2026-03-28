import { motion } from "motion/react";
import { Bot, Sparkles, ArrowRight } from "lucide-react";

export default function AgentSection() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7 }}
        className="bg-[#0A0A0A] border border-white/5 rounded-[2.5rem] overflow-hidden flex flex-col lg:flex-row items-center relative"
      >
        {/* Left Content */}
        <div className="w-full lg:w-1/2 p-10 lg:p-16 xl:p-20 z-10">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-8 leading-tight">
            全自动 <span className="text-[#FDE047]">Agent</span> 营销大师
          </h2>
          <p className="text-lg md:text-xl text-slate-400 leading-relaxed font-light mb-12">
            只需一个链接或爆款视频，Agent 自动串联全流程：<br className="hidden md:block" />
            <span className="flex flex-wrap items-center gap-2 mt-6 text-slate-300 text-base md:text-lg">
              爆款拆解 <ArrowRight className="w-4 h-4 text-slate-500" /> 
              提示词撰写 <ArrowRight className="w-4 h-4 text-slate-500" /> 
              分镜生成 <ArrowRight className="w-4 h-4 text-slate-500" /> 
              自动剪辑 <ArrowRight className="w-4 h-4 text-slate-500" /> 
              音画同步
            </span>
          </p>
          <button className="px-8 py-3.5 rounded-full border border-white/20 text-white font-medium hover:bg-white hover:text-black transition-all duration-300 flex items-center gap-2">
            立即体验
          </button>
        </div>

        {/* Right Mockup */}
        <div className="w-full lg:w-1/2 p-10 lg:p-16 relative min-h-[500px] flex items-center justify-center lg:justify-end">
          {/* Main Storyboard Window */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, x: 20 }}
            whileInView={{ opacity: 1, scale: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="w-full max-w-[500px] bg-[#111111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative z-10"
          >
            {/* Window Header */}
            <div className="bg-[#1A1A1A] px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-white/10 border border-white/20"></div>
              <div className="w-3 h-3 rounded-full bg-white/10 border border-white/20"></div>
              <div className="w-3 h-3 rounded-full bg-white/10 border border-white/20"></div>
            </div>
            
            {/* Window Body */}
            <div className="p-4 space-y-4">
              {/* Scene 1 */}
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-medium text-slate-300">场景1: 引入痛点</span>
                  <span className="text-[10px] text-slate-500 bg-black/50 px-2 py-1 rounded">00:00 - 00:03</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="aspect-video bg-black rounded-lg overflow-hidden relative group">
                      <img src={`https://picsum.photos/seed/scene1${i}/200/150`} alt="scene" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Scene 2 */}
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-medium text-slate-300">场景2: 产品展示</span>
                  <span className="text-[10px] text-slate-500 bg-black/50 px-2 py-1 rounded">00:03 - 00:08</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="aspect-video bg-black rounded-lg overflow-hidden relative group">
                      <img src={`https://picsum.photos/seed/scene2${i}/200/150`} alt="scene" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Overlapping Chat Window */}
          <motion.div 
            initial={{ opacity: 0, y: 30, x: 20 }}
            whileInView={{ opacity: 1, y: 0, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="absolute bottom-0 right-0 lg:-bottom-8 lg:-right-4 w-72 bg-[#1A1A1A]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] overflow-hidden z-20"
          >
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 bg-white/5">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#FDE047] to-orange-500 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-black" />
              </div>
              <span className="text-sm font-medium text-white">NexTide Agent</span>
            </div>
            
            <div className="p-4 space-y-3">
              <div className="bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm p-3 text-xs text-slate-300 leading-relaxed">
                我已为您拆解爆款视频，并生成了第一版分镜脚本！
              </div>
              <div className="bg-white/5 border border-white/5 rounded-2xl rounded-tl-sm p-3 text-xs text-slate-300 leading-relaxed">
                对当前的分镜满意吗？
              </div>
              
              <div className="space-y-2 pt-2">
                <button className="w-full py-2 px-3 bg-[#FDE047]/10 hover:bg-[#FDE047]/20 border border-[#FDE047]/30 text-[#FDE047] text-xs rounded-lg transition-colors text-center">
                  满意！开始生成视频
                </button>
                <button className="w-full py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors text-center">
                  继续扩写更多场景
                </button>
              </div>
            </div>
            
            <div className="p-3 bg-black/40 border-t border-white/5">
              <div className="bg-white/5 border border-white/10 rounded-full px-4 py-2 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">输入您的修改意见...</span>
              </div>
            </div>
          </motion.div>

        </div>
      </motion.div>
    </section>
  );
}
