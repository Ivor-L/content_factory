import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, Image as ImageIcon, History, ChevronLeft, Users, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useUser } from '../contexts/UserContext';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { user } = useUser();

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-app">
      {/* Header */}
      <header className="px-6 pt-14 pb-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3 w-full">
          {!isHome && (
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-black/5 transition-colors">
              <ChevronLeft size={24} className="text-primary" />
            </button>
          )}
          <h1 className={`text-2xl font-bold tracking-tight text-primary flex-1 ${!isHome ? 'text-center pr-8' : ''}`}>
            {isHome ? '' : 
             location.pathname === '/generate' ? '生成' :
             location.pathname === '/warehouse' ? '我的数字人' :
             location.pathname === '/records' ? '记录' :
             location.pathname === '/profile' ? '个人中心' : ''}
          </h1>
          {isHome && (
            <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full bg-white soft-shadow flex items-center justify-center overflow-hidden hover:scale-105 transition-transform">
              <img src={user.avatar} alt="Profile" className="w-full h-full object-cover bg-secondary" />
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-28 scrollbar-hide relative px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[448px] bg-white rounded-full soft-shadow z-20 px-6 py-4">
        <div className="flex justify-between items-center">
          <NavItem icon={<Home size={24} />} active={isHome} onClick={() => navigate('/')} />
          <NavItem icon={<Users size={24} />} active={location.pathname === '/warehouse'} onClick={() => navigate('/warehouse')} />
          <NavItem icon={<History size={24} />} active={location.pathname === '/records'} onClick={() => navigate('/records')} />
          <NavItem icon={<User size={24} />} active={location.pathname === '/profile'} onClick={() => navigate('/profile')} />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ icon, active, onClick }: { icon: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-2 rounded-full transition-all duration-300 ${active ? 'text-white bg-primary scale-110' : 'text-text-secondary hover:text-primary'}`}
    >
      {icon}
    </button>
  );
}
