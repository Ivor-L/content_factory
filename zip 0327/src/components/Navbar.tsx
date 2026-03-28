import { Link, NavLink } from 'react-router-dom';

const navItems = [
  { label: '首页', to: '/' },
  { label: 'NexAPI', to: '/nexapi' },
  { label: 'OpenClaw', to: '/openclaw' },
  { label: '无限画布', to: '/canvas' },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link to="/" className="flex items-center gap-3 text-white">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-base font-semibold text-black shadow-lg">
            N
          </span>
          <span className="text-lg font-semibold tracking-wide">NexTide</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-200 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `transition-colors ${isActive ? 'text-white' : 'hover:text-white/80'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/nexapi/console"
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:text-white"
          >
            控制台
          </Link>
          <a
            href="https://atomx.top/login"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-slate-100"
          >
            登录 / 注册
          </a>
        </div>
      </div>
    </header>
  );
}
