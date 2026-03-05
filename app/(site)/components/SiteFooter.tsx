'use client';

import { siteContent } from '../content';

interface FooterProps {
  lang: 'en' | 'zh';
}

export function SiteFooter({ lang }: FooterProps) {
  const t = siteContent[lang].footer;

  return (
    <footer className="bg-white dark:bg-black border-t border-gray-100 dark:border-gray-800 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-black dark:bg-white rounded flex items-center justify-center text-white dark:text-black font-bold text-xs">
            A
          </div>
          <span className="font-bold text-gray-900 dark:text-white">AtomX</span>
          <span className="text-gray-400 text-sm ml-4">
            {t.copyright}
          </span>
        </div>
        
        <div className="flex gap-8">
          {t.links.map((link, idx) => (
            <a key={idx} href="#" className="text-sm text-gray-500 hover:text-black dark:hover:text-white transition-colors">
              {link}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
