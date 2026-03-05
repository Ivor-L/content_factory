'use client';

import { siteContent } from '../content';
import { Play, TrendingUp, DollarSign, MousePointer } from 'lucide-react';

interface ShowcaseProps {
  lang: 'en' | 'zh';
}

// Mock Data for Showcase
const cases = [
  {
    id: 1,
    title: "Smart Home Cleaner",
    metrics: { roas: "4.2x", ctr: "3.5%", sales: "$12k+" },
    videoThumbnail: "https://images.unsplash.com/photo-1556910103-1c02745a30bf?q=80&w=1000&auto=format&fit=crop",
    productImage: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?q=80&w=1000&auto=format&fit=crop",
    category: "Home & Garden"
  },
  {
    id: 2,
    title: "Wireless Earbuds Pro",
    metrics: { roas: "3.8x", ctr: "2.9%", sales: "$45k+" },
    videoThumbnail: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?q=80&w=1000&auto=format&fit=crop",
    productImage: "https://images.unsplash.com/photo-1572569028738-411a39a74cc3?q=80&w=1000&auto=format&fit=crop",
    category: "Electronics"
  },
  {
    id: 3,
    title: "Vitamin C Serum",
    metrics: { roas: "5.1x", ctr: "4.2%", sales: "$8k+" },
    videoThumbnail: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=1000&auto=format&fit=crop",
    productImage: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=1000&auto=format&fit=crop",
    category: "Beauty"
  }
];

export function Showcase({ lang }: ShowcaseProps) {
  const t = siteContent[lang].showcase;

  return (
    <section id="showcase" className="py-24 bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t.title}
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              {t.subtitle}
            </p>
          </div>
          <button className="hidden md:flex items-center gap-2 text-blue-600 font-bold hover:underline">
            View All Cases <TrendingUp size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {cases.map((item) => (
            <div key={item.id} className="group relative rounded-3xl overflow-hidden bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-2xl transition-all duration-500 hover:-translate-y-2">
              {/* Video/Image Area */}
              <div className="aspect-[4/5] relative overflow-hidden">
                <img 
                  src={item.videoThumbnail} 
                  alt={item.title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                />
                
                {/* Play Button Overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                  <div className="w-16 h-16 bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/50 group-hover:scale-110 transition-transform duration-300">
                    <Play size={32} className="fill-white ml-1" />
                  </div>
                </div>

                {/* Product Inset */}
                <div className="absolute bottom-4 left-4 w-16 h-16 rounded-xl border-2 border-white overflow-hidden shadow-lg">
                  <img src={item.productImage} alt="Product" className="w-full h-full object-cover" />
                </div>

                {/* Category Badge */}
                <div className="absolute top-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-md text-white text-xs font-bold rounded-full">
                  {item.category}
                </div>
              </div>

              {/* Metrics Panel */}
              <div className="p-6 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{item.title}</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center justify-center gap-1">
                      <TrendingUp size={12} /> {t.metrics.roas}
                    </div>
                    <div className="text-xl font-bold text-green-600">{item.metrics.roas}</div>
                  </div>
                  <div className="text-center border-l border-gray-100 dark:border-gray-800">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center justify-center gap-1">
                      <MousePointer size={12} /> {t.metrics.ctr}
                    </div>
                    <div className="text-xl font-bold text-blue-600">{item.metrics.ctr}</div>
                  </div>
                  <div className="text-center border-l border-gray-100 dark:border-gray-800">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center justify-center gap-1">
                      <DollarSign size={12} /> {t.metrics.sales}
                    </div>
                    <div className="text-xl font-bold text-gray-900 dark:text-white">{item.metrics.sales}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button className="md:hidden w-full mt-8 flex items-center justify-center gap-2 text-blue-600 font-bold hover:underline py-4 border border-blue-100 rounded-xl">
          View All Cases <TrendingUp size={16} />
        </button>
      </div>
    </section>
  );
}
