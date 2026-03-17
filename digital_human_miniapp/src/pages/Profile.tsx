import React, { useState, useEffect, useRef } from 'react';
import { User, Key, Zap, Save, CheckCircle2, Edit2, X, Camera } from 'lucide-react';
import { useUser } from '../contexts/UserContext';

const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mimi',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie',
];

export default function Profile() {
  const { user, updateUser } = useUser();
  const [apiKey, setApiKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isKeyEditing, setIsKeyEditing] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editAvatar, setEditAvatar] = useState(user.avatar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('API_KEY');
    if (savedKey) {
      setApiKey(savedKey);
      setIsKeyEditing(false);
    }
  }, []);

  const handleSaveKey = () => {
    localStorage.setItem('API_KEY', apiKey);
    setIsSaved(true);
    setIsKeyEditing(false);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleSaveProfile = () => {
    if (editName.trim()) {
      updateUser({ name: editName.trim(), avatar: editAvatar });
      setIsEditing(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const pointsPercentage = Math.min(100, (user.pointsUsed / user.pointsTotal) * 100);

  return (
    <div className="space-y-6 py-4 px-2">
      {/* User Info Card */}
      <div className="bg-white rounded-[2rem] p-6 soft-shadow flex flex-col items-center text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-blue-100 to-purple-50 opacity-50"></div>
        
        {!isEditing && (
          <button 
            onClick={() => {
              setEditName(user.name);
              setEditAvatar(user.avatar);
              setIsEditing(true);
            }}
            className="absolute top-4 right-4 z-20 p-2 bg-white/80 backdrop-blur-sm rounded-full text-text-secondary hover:text-primary transition-colors"
          >
            <Edit2 size={18} />
          </button>
        )}

        <div className="relative z-10 w-full">
          {isEditing ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-primary">编辑个人资料</h3>
                <button onClick={() => setIsEditing(false)} className="text-text-secondary hover:text-primary">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-text-secondary text-left mb-2">选择头像</label>
                  <div className="flex gap-3 overflow-x-auto py-2 px-1 -mx-1 scrollbar-hide items-center">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={`shrink-0 w-16 h-16 rounded-full flex items-center justify-center border-2 border-dashed transition-all ${
                        !AVATARS.includes(editAvatar) ? 'border-primary text-primary scale-110 bg-blue-50' : 'border-gray-300 text-text-secondary hover:bg-gray-50'
                      }`}
                    >
                      {!AVATARS.includes(editAvatar) ? (
                        <img src={editAvatar} alt="Custom avatar" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <Camera size={24} />
                      )}
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                    {AVATARS.map((avatarUrl, idx) => (
                      <button
                        key={idx}
                        onClick={() => setEditAvatar(avatarUrl)}
                        className={`shrink-0 w-16 h-16 rounded-full p-1 transition-all ${editAvatar === avatarUrl ? 'bg-primary scale-110' : 'bg-secondary hover:bg-gray-200'}`}
                      >
                        <img src={avatarUrl} alt="Avatar option" className="w-full h-full rounded-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-secondary text-left mb-2">用户名</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-secondary rounded-xl p-3 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                    placeholder="输入用户名"
                    maxLength={20}
                  />
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={!editName.trim()}
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  保存修改
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="w-24 h-24 bg-white rounded-full p-1 soft-shadow mb-4 mx-auto">
                <img src={user.avatar} alt="Avatar" className="w-full h-full rounded-full object-cover bg-secondary" />
              </div>
              <h2 className="text-2xl font-bold text-primary mb-1">{user.name}</h2>
              <p className="text-sm text-text-secondary font-medium">高级版用户</p>
            </>
          )}
        </div>
      </div>

      {/* Points Usage */}
      <div className="bg-white rounded-[2rem] p-6 soft-shadow space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 bg-yellow-50 rounded-full flex items-center justify-center">
            <Zap size={20} className="text-yellow-500" />
          </div>
          <div>
            <h3 className="font-bold text-primary">积分使用情况</h3>
            <p className="text-xs text-text-secondary">用于生成数字人视频</p>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-bold text-primary">
            <span>已用 {user.pointsUsed}</span>
            <span className="text-text-secondary">总计 {user.pointsTotal}</span>
          </div>
          <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${pointsPercentage}%` }}
            />
          </div>
          <p className="text-xs text-text-secondary text-right mt-1">
            剩余 {user.pointsTotal - user.pointsUsed} 积分
          </p>
        </div>
      </div>

      {/* API Key Binding */}
      <div className="bg-white rounded-[2rem] p-6 soft-shadow space-y-4">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
            <Key size={20} className="text-blue-500" />
          </div>
          <div className="flex-1 ml-2">
            <h3 className="font-bold text-primary">绑定 API Key</h3>
            <p className="text-xs text-text-secondary">配置您的专属密钥以解锁更多功能</p>
          </div>
          {!isKeyEditing && (
            <button
              onClick={() => setIsKeyEditing(true)}
              className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full hover:bg-primary/20 transition-colors"
            >
              编辑
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div className="relative">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              disabled={!isKeyEditing}
              className={`w-full bg-secondary rounded-xl p-4 text-sm text-primary placeholder-text-secondary focus:outline-none font-mono transition-all ${
                isKeyEditing ? 'focus:ring-2 focus:ring-primary/20' : 'opacity-70 cursor-not-allowed'
              }`}
            />
          </div>
          <button
            onClick={handleSaveKey}
            disabled={!apiKey || !isKeyEditing}
            className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${
              !apiKey || !isKeyEditing
                ? 'bg-secondary text-text-secondary cursor-not-allowed' 
                : isSaved 
                  ? 'bg-green-500' 
                  : 'bg-primary hover:opacity-90 active:scale-[0.98]'
            }`}
          >
            {isSaved ? (
              <>
                <CheckCircle2 size={18} /> 已保存
              </>
            ) : (
              <>
                <Save size={18} /> 保存配置
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
