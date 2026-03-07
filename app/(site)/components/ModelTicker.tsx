'use client';

import { siteContent } from '../content';

interface ModelTickerProps {
  lang: 'en' | 'zh';
}

function ModelLogo({ name, iconSrc }: { name: string, iconSrc: string }) {
  return (
    <div className="flex flex-col items-center gap-4 group cursor-default">
      <div className="w-12 h-12 transition-transform duration-300 group-hover:scale-110 flex items-center justify-center">
        <img src={iconSrc} alt={name} className="w-full h-full object-contain" />
      </div>
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
        {name}
      </span>
    </div>
  );
}

export function ModelTicker({ lang }: ModelTickerProps) {
  const t = siteContent[lang].hero;

  return (
    <section className="py-16 bg-white dark:bg-black border-t border-gray-100 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-10 uppercase tracking-wider">
          {t.poweredBy}
        </p>
        
        <div className="relative w-full overflow-hidden">
          {/* Gradients for smooth fade effect at edges */}
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white dark:from-black to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white dark:from-black to-transparent z-10" />
          
          <div className="flex items-center gap-32 animate-scroll whitespace-nowrap">
            {/* First set of logos */}
            {[...Array(2)].map((_, setIndex) => (
              <div key={setIndex} className="flex items-center gap-32">
                <ModelLogo name="Google VEO" iconSrc="/models/gemini-color.svg" />
                <ModelLogo name="ByteDance Seedance" iconSrc="/models/bytedance-color.svg" />
                <ModelLogo name="Kuaishou Kling" iconSrc="/models/kling-color.svg" />
                <ModelLogo name="Wan 2.1" iconSrc="/models/wan.svg" />
                <ModelLogo name="Nano Banana Pro" iconSrc="/models/gemini-color.svg" />
                <ModelLogo name="OpenAI Sora" iconSrc="/models/sora-color (1).svg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
