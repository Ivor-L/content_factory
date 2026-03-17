import React from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Sparkles, ArrowRight, Users, PenSquare } from 'lucide-react';
import { useUser } from '../contexts/UserContext';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useUser();

  return (
    <div className="space-y-8 pb-4">
      {/* Hero Section */}
      <div className="px-2">
        <h2 className="text-lg text-text-secondary font-medium mb-1">欢迎回来</h2>
        <h1 className="text-4xl font-bold text-primary mb-8">{user.name}</h1>
        
        <div className="bg-white rounded-[2rem] p-6 soft-shadow relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full opacity-50"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={20} className="text-blue-500" />
              <span className="font-semibold text-primary">AI 视频生成</span>
            </div>
            <p className="text-text-secondary text-sm mb-6 max-w-[200px]">
              一键生成逼真数字人视频，支持音频驱动与文字驱动。
            </p>
            <button 
              onClick={() => navigate('/generate')}
              className="bg-primary text-white px-6 py-3 rounded-full font-semibold text-sm flex items-center justify-center gap-2 w-full hover:bg-black/80 transition-colors"
            >
              立即开始 <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-2 gap-4 px-2">
        <ActionCard 
          icon={<Users size={24} className="text-blue-500" />}
          title="我的数字人"
          desc="管理形象与音色"
          onClick={() => navigate('/warehouse')}
        />
        <ActionCard 
          icon={<History size={24} className="text-purple-500" />}
          title="生成记录"
          desc="查看历史任务"
          onClick={() => navigate('/records')}
        />
        <ActionCard
          icon={<PenSquare size={24} className="text-green-500" />}
          title="内容创作"
          desc="阶段式AI写作"
          onClick={() => navigate('/content')}
          fullWidth
        />
      </div>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  desc,
  onClick,
  fullWidth = false,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  fullWidth?: boolean;
}) {
  return (
    <button 
      onClick={onClick}
      className={`bg-white rounded-[1.5rem] p-5 text-left flex flex-col gap-4 soft-shadow hover:scale-[1.02] transition-transform ${fullWidth ? 'col-span-2' : ''}`}
    >
      <div className="bg-secondary w-12 h-12 rounded-full flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-primary mb-1">{title}</h3>
        <p className="text-xs text-text-secondary">{desc}</p>
      </div>
    </button>
  );
}
