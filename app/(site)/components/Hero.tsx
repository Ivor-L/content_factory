'use client';

import { useState } from 'react';
import { Play, Check, Link as LinkIcon, ArrowRight, Loader2 } from 'lucide-react';
import { siteContent } from '../content';
import { AnalysisModal } from './AnalysisModal';

interface HeroVideoProps {
  label: string;
  videoSrc?: string;
  poster?: string;
}

function HeroVideo({ label, videoSrc, poster }: HeroVideoProps) {
  return (
    <div className="relative w-[240px] aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl border-4 border-white dark:border-gray-800 bg-gray-900">
      {/* Label Badge */}
      <div className={`absolute top-4 left-4 z-10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white ${
        label.includes('VIRAL') || label.includes('爆款') ? 'bg-red-500' : 'bg-black'
      }`}>
        {label}
      </div>

      {/* Video Content */}
      <div className="w-full h-full relative">
        {videoSrc ? (
          <video 
            src={videoSrc}
            poster={poster}
            autoPlay 
            muted 
            loop 
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
            <Play className="text-white/20 w-12 h-12" />
          </div>
        )}
      </div>
    </div>
  );
}

interface HeroProps {
  lang: 'en' | 'zh';
}

export function Hero({ lang }: HeroProps) {
  const t = siteContent[lang].hero;
  const [url, setUrl] = useState('');
  const [showModal, setShowModal] = useState(false);

  const handleAnalyze = () => {
    if (!url) return;
    setShowModal(true);
  };

  return (
    <section className="relative pt-24 pb-20 lg:pt-32 lg:pb-32 overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gradient-to-b from-blue-50/50 to-transparent dark:from-blue-900/10 dark:to-transparent -z-10 pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left: Content */}
          <div className="text-left animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Badges */}
            <div className="flex gap-3 mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Kling 3.0 is live</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Nano Banana 2 is live</span>
              </div>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 dark:text-white mb-6 leading-[1.1]">
              {t.title.split(' ').map((word, i) => (
                word === 'Your' || word === 'Own' || word === '销量' ? 
                <span key={i} className="relative inline-block mr-3">
                  {word}
                  <span className="absolute bottom-2 left-0 w-full h-3 bg-blue-500/20 -z-10" />
                </span> : 
                <span key={i} className="mr-3">{word}</span>
              ))}
            </h1>

            <p className="text-xl text-gray-600 dark:text-gray-300 mb-10 max-w-xl leading-relaxed">
              {t.subtitle}
            </p>

            {/* Checklist */}
            <ul className="space-y-4 mb-10">
              {t.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-1 w-5 h-5 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0">
                    <Check size={12} className="text-black dark:text-white" />
                  </div>
                  <span className="text-gray-600 dark:text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>

            {/* Input & Action */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
              <div className="flex-1 relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <LinkIcon size={18} />
                </div>
                <input 
                  type="text" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t.inputPlaceholder}
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-black dark:focus:ring-white outline-none transition-all"
                />
              </div>
              <button 
                onClick={handleAnalyze}
                disabled={!url}
                className="h-12 px-6 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {t.analyzeBtn}
                <ArrowRight size={18} />
              </button>
              <button className="h-12 px-6 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center">
                {t.joinBtn}
              </button>
            </div>
          </div>

          {/* Right: Video Demo */}
          <div className="flex justify-center lg:justify-end gap-6 animate-in fade-in slide-in-from-right-8 duration-1000 delay-200 relative">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 to-purple-500/10 rounded-[40px] -z-10 blur-3xl transform rotate-3 scale-110" />
            
            <HeroVideo 
              label={t.viralLabel}
              videoSrc="/videos/demo-viral.mp4" 
            />
            <HeroVideo 
              label={t.cloneLabel}
              videoSrc="/videos/demo-clone.mp4?v=2"
            />
          </div>

        </div>

        {/* Trusted By */}
        <div className="mt-24 pt-10 border-t border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-8 uppercase tracking-wider text-center">
            {t.trustedBy}
          </p>
          
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            {/* Mock Logos - Replace with real SVGs */}
            <div className="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>

      <AnalysisModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
        url={url} 
      />
    </section>
  );
}
