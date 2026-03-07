'use client';

import { X, CheckCircle2, Loader2, Play } from 'lucide-react';
import { useEffect, useState } from 'react';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
}

export function AnalysisModal({ isOpen, onClose, url }: AnalysisModalProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      // Simulate analysis delay
      const timer = setTimeout(() => {
        setLoading(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="font-bold text-lg text-gray-900 dark:text-white">
            Video Analysis Report
          </h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
              <p className="text-gray-500 font-medium">Analyzing video structure...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Video Info */}
              <div className="flex gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <div className="w-20 h-24 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0">
                  <Play size={24} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-blue-600 font-medium mb-1 truncate">{url}</p>
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">Viral TikTok Product Showcase</h4>
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">High Conversion</span>
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">15s Duration</span>
                  </div>
                </div>
              </div>

              {/* Analysis Results */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Detected Elements</h4>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    "Hook: Problem Agitation (0-3s)",
                    "Product Demo: Clear Usage (3-10s)",
                    "Social Proof: User Reaction (10-12s)",
                    "CTA: Strong Call to Action (12-15s)"
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 border border-gray-100 dark:border-gray-800 rounded-lg">
                      <CheckCircle2 size={18} className="text-green-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action */}
              <button 
                className="w-full py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl font-bold hover:opacity-90 transition-opacity"
                onClick={() => window.open('/dashboard', '_blank')}
              >
                Clone This Video Now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
