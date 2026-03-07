'use client';

import { siteContent } from '../content';

interface FooterProps {
  lang: 'en' | 'zh';
}

export function SiteFooter({ lang }: FooterProps) {
  const t = siteContent[lang].footer;

  return (
    <footer className="bg-white dark:bg-black border-t border-gray-100 dark:border-gray-800 py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand & About */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <img src="/logo.svg" alt="AtomX Logo" className="h-12" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 leading-relaxed max-w-md">
              {t.about}
            </p>
          </div>

          {/* Links Column 1 */}
          <div>
            <h4 className="font-bold text-gray-900 dark:text-white mb-6">Product</h4>
            <ul className="space-y-4">
              <li><a href="#features" className="text-gray-500 hover:text-black dark:hover:text-white transition-colors">Features</a></li>
              <li><a href="#showcase" className="text-gray-500 hover:text-black dark:hover:text-white transition-colors">Showcase</a></li>
              <li><a href="#pricing" className="text-gray-500 hover:text-black dark:hover:text-white transition-colors">Pricing</a></li>
            </ul>
          </div>

          {/* Links Column 2 */}
          <div>
            <h4 className="font-bold text-gray-900 dark:text-white mb-6">Support</h4>
            <ul className="space-y-4">
              {t.links.map((link, idx) => (
                <li key={idx}>
                  <a href="#" className="text-gray-500 hover:text-black dark:hover:text-white transition-colors">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-100 dark:border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-gray-400 text-sm">
            {t.copyright}
          </span>
        </div>
      </div>
    </footer>
  );
}
