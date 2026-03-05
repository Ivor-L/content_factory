'use client';

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'react-hot-toast';
import { getCaretCoordinates } from '@/lib/caret';

interface Product {
  id: string;
  name: string;
  images: string;
}

interface Character {
  id: string;
  name: string;
  avatar: string;
}

interface StoryboardSegment {
  id: string;
  order: number;
  duration: number;
  imagePrompt: string | null;
  videoPrompt: string | null;
  generatedImage: string | null;
  generatedVideo: string | null;
  status: string;
}

interface StoryboardTask {
  id: string;
  status: string;
  videoUrl: string | null;
  coverImage: string | null;
  sceneImage: string | null;
  scenePrompt: string | null;
  product: { id: string, name: string, images: string } | null;
  character: { id: string, name: string, avatar: string } | null;
  segments: StoryboardSegment[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface StoryboardModalProps {
  task: StoryboardTask;
  isOpen: boolean;
  onClose: () => void;
  products?: Product[];
  characters?: Character[];
}

export function StoryboardModal({ task: initialTask, isOpen, onClose, products = [], characters = [] }: StoryboardModalProps) {
  const { t } = useLanguage();
  const [task, setTask] = useState<StoryboardTask>(initialTask);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [caretPos, setCaretPos] = useState({ top: 0, left: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize selected segment
  useEffect(() => {
    if (initialTask && initialTask.segments.length > 0 && !selectedSegmentId) {
      setSelectedSegmentId(initialTask.segments[0].id);
    }
    setTask(initialTask);
  }, [initialTask]);

  if (!isOpen) return null;

  const currentSegment = task.segments.find(s => s.id === selectedSegmentId) || task.segments[0];

  useEffect(() => {
    if (currentSegment) {
      setImagePrompt(currentSegment.imagePrompt || '');
    }
  }, [currentSegment?.id]);

  const handleImagePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
     const val = e.target.value;
     setImagePrompt(val);

     if (currentSegment) {
        const updatedSegments = task.segments.map(s => 
            s.id === currentSegment.id ? { ...s, imagePrompt: val } : s
        );
        setTask(prev => ({ ...prev, segments: updatedSegments }));
     }
 
     const selectionEnd = e.target.selectionEnd;
    const textBeforeCursor = val.slice(0, selectionEnd);
    const lastAt = textBeforeCursor.lastIndexOf('@');
    
    if (lastAt !== -1) {
        const query = textBeforeCursor.slice(lastAt + 1);
        if (!query.includes(' ')) {
            const { top, left, height } = getCaretCoordinates(e.target, selectionEnd);
            // Adjust for scroll position
            const scrollTop = e.target.scrollTop;
            
            setCaretPos({
                top: top - scrollTop + height,
                left: left
            });
            
            setMentionQuery(query);
            setShowMentions(true);
            return;
        }
    }
    setShowMentions(false);
  };

  const handleSelectMention = (name: string) => {
      if (!textareaRef.current) return;
      
      const val = imagePrompt;
      const selectionEnd = textareaRef.current.selectionEnd;
      const textBeforeCursor = val.slice(0, selectionEnd);
      const textAfterCursor = val.slice(selectionEnd);
      
      const lastAtPos = textBeforeCursor.lastIndexOf('@');
      const newText = textBeforeCursor.slice(0, lastAtPos) + `@${name} ` + textAfterCursor;
      
      setImagePrompt(newText);
      setShowMentions(false);
      
      if (currentSegment) {
          const updatedSegments = task.segments.map(s => 
              s.id === currentSegment.id ? { ...s, imagePrompt: newText } : s
          );
          setTask(prev => ({ ...prev, segments: updatedSegments }));
      }
      
      setTimeout(() => textareaRef.current?.focus(), 0);
  };

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && !textareaRef.current?.contains(event.target as Node)) {
              setShowMentions(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(mentionQuery.toLowerCase()));
  const filteredCharacters = characters.filter(c => c.name.toLowerCase().includes(mentionQuery.toLowerCase()));

  const handleGenerateImage = () => {
    toast.success(t.storyboard.generate + ' (mock)');
  };

  const handleGenerateVideo = () => {
    toast.success(t.storyboard.generate + ' (mock)');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 w-full h-full max-w-[95vw] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-700 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                <span className="font-bold text-base text-gray-900 dark:text-white">{t.storyboard.makeVideo}</span>
            </div>
          </div>
          
          {/* Stepper */}
          <div className="flex items-center gap-6 text-sm font-medium absolute left-1/2 transform -translate-x-1/2 hidden md:flex">
             <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                <span className="w-5 h-5 rounded-full bg-black text-white dark:bg-white dark:text-black flex items-center justify-center text-xs">1</span>
                <span>{t.storyboard.step1}</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
             </div>
             <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                <span className="w-5 h-5 rounded-full bg-black text-white dark:bg-white dark:text-black flex items-center justify-center text-xs">2</span>
                <span>{t.storyboard.step2}</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
             </div>
             <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                <span className="w-5 h-5 rounded-full bg-black text-white dark:bg-white dark:text-black flex items-center justify-center text-xs">3</span>
                <span>{t.storyboard.step3}</span>
             </div>
          </div>

          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
            
            {/* Left Sidebar: Segment List */}
            <div className="w-56 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex flex-col">
                <div className="h-12 px-3 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 z-10">
                    <span className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                        {t.storyboard.segments} <span className="text-gray-400 text-xs ml-1">{task.segments.length}</span>
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {task.segments.map((segment) => (
                        <div 
                            key={segment.id}
                            onClick={() => setSelectedSegmentId(segment.id)}
                            className={`p-2 rounded-lg border cursor-pointer transition-all ${
                                selectedSegmentId === segment.id 
                                    ? 'bg-white dark:bg-gray-800 border-black dark:border-white shadow-sm ring-1 ring-black dark:ring-white' 
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-xs text-gray-900 dark:text-white">{t.storyboard.segment} {segment.order + 1}</span>
                                {segment.status === 'COMPLETED' ? (
                                    <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded">{t.storyboard.ready}</span>
                                ) : (
                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t.storyboard.prepare}</span>
                                )}
                            </div>
                            <div className="text-[10px] text-gray-500 truncate">
                                {segment.imagePrompt || t.storyboard.noPrompt}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-3 border-t border-gray-200 dark:border-gray-800">
                    <button className="w-full py-2 bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                        {t.storyboard.mergeAll}
                    </button>
                </div>
            </div>

            {/* Center: Preview */}
            <div className="flex-1 bg-white dark:bg-gray-900 flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-800">
                <div className="h-12 px-4 flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10 shrink-0">
                    <svg className="w-5 h-5 text-gray-900 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white">{t.storyboard.preview}</h2>
                </div>

                <div className="flex-1 overflow-y-auto py-4 px-0 flex flex-col">
                    <div className="flex justify-evenly h-full w-full">
                        {/* Image Preview */}
                        <div className="flex flex-col h-full items-center w-full max-w-[300px]">
                            <div className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2 w-full">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                {t.storyboard.firstFrame}
                            </div>
                            <div className="w-full aspect-[9/16] bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative shadow-sm">
                                {currentSegment?.generatedImage ? (
                                    <img src={currentSegment.generatedImage} alt="Generated Frame" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                        <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                        <span className="text-sm">{t.storyboard.imageNotGenerated}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Video Preview */}
                        <div className="flex flex-col h-full items-center w-full max-w-[300px]">
                            <div className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2 w-full">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                {t.storyboard.videoSegment}
                            </div>
                            <div className="w-full aspect-[9/16] bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative shadow-sm">
                                 {currentSegment?.generatedVideo ? (
                                    <video src={currentSegment.generatedVideo} controls className="w-full h-full object-cover" />
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                        <span className="text-sm">{t.storyboard.videoNotGenerated}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Sidebar: Controls */}
            <div className="w-[550px] bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
                <div className="h-12 px-4 flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10 shrink-0">
                    <svg className="w-5 h-5 text-gray-900 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white">{t.storyboard.visualPrompt}</h2>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {/* Photo Prompt */}
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 mb-3 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                {t.storyboard.photoPrompt}
                            </div>
                            <span className="text-[10px] text-gray-400">{t.storyboard.insertProductTip}</span>
                        </div>
                        <div className="relative">
                            <textarea 
                                ref={textareaRef}
                                className="w-full h-24 text-xs p-2 bg-transparent border-none outline-none resize-none text-gray-700 dark:text-gray-300"
                                placeholder={t.storyboard.describeImage}
                                value={imagePrompt}
                                onChange={handleImagePromptChange}
                            ></textarea>

                            {/* Mentions Dropdown */}
                            {showMentions && (
                                <div 
                                    ref={dropdownRef}
                                    style={{
                                        top: caretPos.top,
                                        left: caretPos.left
                                    }}
                                    className="absolute w-64 max-h-64 overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 mt-1 p-2"
                                >
                                    {filteredProducts.length > 0 && (
                                        <>
                                            <div className="text-[10px] font-bold text-gray-500 uppercase mb-2 px-2">Products</div>
                                            {filteredProducts.map(p => {
                                                let image = '';
                                                try {
                                                    const imgs = JSON.parse(p.images);
                                                    image = Array.isArray(imgs) && imgs.length > 0 ? imgs[0] : '';
                                                } catch (e) {}
                                                return (
                                                    <div 
                                                        key={p.id}
                                                        onClick={() => handleSelectMention(p.name)}
                                                        className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-md transition-colors"
                                                    >
                                                        <div className="w-8 h-8 rounded bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200 dark:border-gray-600">
                                                            {image && <img src={image} alt={p.name} className="w-full h-full object-cover" />}
                                                        </div>
                                                        <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{p.name}</span>
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
                                    
                                    {filteredCharacters.length > 0 && (
                                        <>
                                            <div className={`text-[10px] font-bold text-gray-500 uppercase mb-2 px-2 ${filteredProducts.length > 0 ? 'mt-2 pt-2 border-t border-gray-100 dark:border-gray-700' : ''}`}>Characters</div>
                                            {filteredCharacters.map(c => (
                                                <div 
                                                    key={c.id}
                                                    onClick={() => handleSelectMention(c.name)}
                                                    className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-md transition-colors"
                                                >
                                                    <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200 dark:border-gray-600">
                                                        {c.avatar && <img src={c.avatar} alt={c.name} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{c.name}</span>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    
                                    {filteredProducts.length === 0 && filteredCharacters.length === 0 && (
                                        <div className="p-3 text-xs text-gray-400 text-center">No matches found</div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                             {/* Mock tags */}
                             <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-[10px] text-gray-600 dark:text-gray-300">@{task.product?.name || t.home.product}</span>
                        </div>
                    </div>

                    {/* Shot Details */}
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 mb-4 shadow-sm">
                         <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                {t.storyboard.shot}
                            </div>
                            <button className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50">
                                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                            </button>
                        </div>
                        
                        <div className="p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800">
                            <div className="flex justify-between items-start mb-1.5">
                                <span className="font-bold text-sm text-gray-900 dark:text-white">{t.storyboard.shot} 1</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-400 font-mono">00:00 - 00:{currentSegment?.duration.toString().padStart(2, '0')}</span>
                                    <button className="text-gray-400 hover:text-red-500">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-500">
                                {currentSegment?.videoPrompt || t.storyboard.noVideoPrompt}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                    <div className="flex gap-3">
                        <button 
                            onClick={handleGenerateImage}
                            className="flex-1 py-2 bg-black hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            {t.storyboard.generateImage}
                        </button>
                        <button 
                            onClick={handleGenerateVideo}
                            className="flex-1 py-2 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            {t.storyboard.generateVideo}
                        </button>
                    </div>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
}
