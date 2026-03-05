import Link from 'next/link';

export default function SiteHome() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-black text-center px-4">
      <h1 className="text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
        AtomX
      </h1>
      <p className="text-xl text-gray-600 dark:text-gray-300 mb-12 max-w-2xl">
        The Future of Content Creation. AI-powered tools for modern creators.
      </p>
      
      <div className="flex gap-4">
        <Link 
          href="/dashboard" 
          className="px-8 py-4 bg-black dark:bg-white text-white dark:text-black rounded-xl font-bold text-lg hover:scale-105 transition-transform shadow-lg hover:shadow-xl"
        >
          进入工作台 (Dashboard)
        </Link>
        <a 
          href="#" 
          className="px-8 py-4 bg-white dark:bg-gray-800 text-black dark:text-white rounded-xl font-bold text-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          了解更多
        </a>
      </div>
      
      <footer className="absolute bottom-8 text-sm text-gray-400">
        © 2026 AtomX Inc. All rights reserved.
      </footer>
    </div>
  );
}
