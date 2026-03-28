export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} NexTide.AI · All rights reserved.</p>
        <div className="flex flex-wrap items-center gap-4">
          <a href="https://atomx.top/login" className="hover:text-white" target="_blank" rel="noreferrer">
            Dashboard
          </a>
          <a href="mailto:hello@nextide.ai" className="hover:text-white">
            hello@nextide.ai
          </a>
          <span className="text-xs text-slate-500">ICP备案：粤ICP备2025460810号-1</span>
        </div>
      </div>
    </footer>
  );
}
