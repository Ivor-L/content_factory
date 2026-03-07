'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { Download, Share2, ThumbsUp, ThumbsDown, Check, ChevronDown, Calendar, Clock, Languages, Coins, Monitor, Maximize } from 'lucide-react';
import { deleteVideos } from "@/app/actions/video";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { useState } from "react";

interface VideoDetailsModalProps {
  item: any;
  onClose: () => void;
}

export function VideoDetailsModal({ item, onClose }: VideoDetailsModalProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  
  const resultData = typeof item.result === 'string' ? JSON.parse(item.result || '{}') : item.result;
  const product = item.product || {};
  const script = item.script || {};

  const isDigitalHuman = item.type === 'LIP_SYNC' || item.type === 'VOICE_CLONE';

  // Mock data filling if missing
  const model = resultData?.model || (isDigitalHuman ? "Digital Human" : "Veo3.1 Fast");
  const ratio = resultData?.ratio || "9:16";
  const duration = resultData?.duration || "8s";
  const language = resultData?.language || "EN";
  const credits = resultData?.credits || (isDigitalHuman ? "10" : "20");
  const createdAt = new Date(item.createdAt).toLocaleDateString();
  
  const scene1Text = isDigitalHuman 
    ? (item.scriptContent || "No script content.") 
    : (script.breakdown ? JSON.parse(script.breakdown)[0]?.visual || "Scene 1 visual description..." : "No script breakdown available.");
  
  const spokenText = isDigitalHuman 
    ? (item.scriptContent || "No audio script.") 
    : (script.breakdown ? JSON.parse(script.breakdown)[0]?.audio || "No audio script available." : "No script audio available.");
    
  const promptText = isDigitalHuman
    ? (item.type === 'LIP_SYNC' ? "Lip Sync from audio" : "Voice Clone from text")
    : (resultData?.prompt || "A confident young man, appearing to be in his early 20s, with short brown hair and striking green eyes, wearing a dark casual shirt. Context: A modern, clean kitchen with white countertops and light-colored walls, suggesting a home setting.");

  const handleDelete = async () => {
    if (!confirm(t.common.confirmDelete)) return;
    
    setIsDeleting(true);
    try {
      const res = await deleteVideos([item.id]);
      if (res.success) {
        toast.success(t.common.success);
        onClose();
        router.refresh();
      } else {
        toast.error(t.common.error);
      }
    } catch (error) {
      console.error(error);
      toast.error(t.common.error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(85vh-8rem)] overflow-hidden bg-white dark:bg-gray-900 -m-6">
      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
          {/* Left: Video Preview */}
          <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-hidden flex items-center justify-center relative min-h-[400px] lg:h-full">
            {resultData?.videoUrl ? (
              <video 
                src={resultData.videoUrl} 
                className="w-full h-full object-contain" 
                controls 
                autoPlay
                loop
              />
            ) : (
              <div className="text-gray-400 text-center">
                <p>No video available</p>
              </div>
            )}
          </div>

          {/* Right: Info Panels */}
          <div className="flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
            
            {/* Project Info Panel */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t.replication.projectInfo}</h3>
                <span className="bg-black dark:bg-white text-white dark:text-black px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <Check size={12} strokeWidth={3} /> {t.replication.completed}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                {!isDigitalHuman && (
                  <>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                        <Monitor size={12} /> {t.replication.videoModel}
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">{model}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                        <Maximize size={12} /> {t.replication.ratio}
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">{ratio}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                        <Clock size={12} /> {t.replication.duration}
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">{duration}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                        <Languages size={12} /> {t.replication.language}
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">{language}</div>
                    </div>
                  </>
                )}
                <div>
                  <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                    <Calendar size={12} /> {t.replication.createdAt}
                  </div>
                  <div className="font-bold text-gray-900 dark:text-white text-sm" suppressHydrationWarning>{createdAt}</div>
                </div>
              </div>
            </div>

            {/* Prompts Panel */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 flex-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-6">
                {isDigitalHuman ? "Task Parameters" : t.replication.aiPrompts}
              </h3>
              
              <div className="space-y-6">
                {isDigitalHuman ? (
                  <>
                    {/* Reference Image */}
                    {item.imageUrl && (
                      <div>
                        <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                          {t.characters.avatar}
                        </div>
                        <img 
                          src={item.imageUrl} 
                          alt="Reference" 
                          className="w-32 h-32 object-contain rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" 
                        />
                      </div>
                    )}

                    {/* Reference Audio */}
                    {item.audioUrl && (
                      <div>
                        <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                          {t.characters.voice}
                        </div>
                        <audio controls src={item.audioUrl} className="w-full h-10" />
                      </div>
                    )}

                    {/* Script */}
                    {item.scriptContent && (
                      <div>
                        <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                          {t.generation.scriptContent}
                        </div>
                        <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
                          {item.scriptContent}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                        <Monitor size={12} /> {t.replication.scene} 1
                      </div>
                      <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 italic relative">
                        <span className="absolute top-2 left-2 text-gray-300 text-2xl font-serif">"</span>
                        <p className="pl-4">{spokenText}</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                        <Share2 size={12} /> {t.replication.prompt}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {promptText}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 flex justify-end items-center gap-3 shrink-0 z-10">
        <div className="flex gap-2 mr-auto">
            <button 
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-sm font-medium transition-colors text-red-600 dark:text-red-400"
            >
                {isDeleting ? t.common.loading : t.common.delete}
            </button>
        </div>

        {!isDigitalHuman && (
          <>
            <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors text-gray-700 dark:text-gray-300">
                <Share2 size={16} /> {t.replication.shareTiktok}
            </button>

            <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors text-gray-700 dark:text-gray-300">
                {t.replication.original} 720p <ChevronDown size={16} />
            </button>
          </>
        )}

        <button className="flex items-center gap-2 px-6 py-2 bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-black/20">
            <Download size={16} /> {t.replication.download} 
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] ml-1">Free</span>
        </button>
      </div>
    </div>
  );
}
