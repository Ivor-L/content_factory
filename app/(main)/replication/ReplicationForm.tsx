"use client";

/* eslint-disable @next/next/no-img-element -- Replication form preview images originate from uploads/blob URLs */

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Search, ChevronDown, Check, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { Modal } from "@/components/Modal";
import { ProductForm } from "@/components/ProductForm";
import { ScriptForm } from "@/components/ScriptForm";
import { createStoryboardTask } from "@/app/actions/storyboard";
import { emitCreditsRefresh } from "@/lib/creditsBus";
import { supabase } from "@/lib/supabase";
import { useTenantPath } from "@/hooks/useTenant";
import { CharacterForm } from "@/components/CharacterForm";
import { deriveCopyInsights } from "@/lib/copyInsights";

interface ReplicationFormProps {
  products: { id: string; name: string; images?: string }[];
  scripts: {
    id: string;
    title: string;
    videoUrl?: string | null;
    blueprint?: string | null;
    breakdown?: string | null;
    status?: string | null;
    progress?: number | null;
  }[];
  characters?: { id: string; name: string; avatar: string }[];
  preselectedScriptId?: string;
  mode?: 'one-click' | 'storyboard' | 'digital-human';
  onSuccess?: () => void;
}

const COUNTRIES = [
  { id: "us", en: "United States", zh: "美国" },
  { id: "uk", en: "United Kingdom", zh: "英国" },
  { id: "ca", en: "Canada", zh: "加拿大" },
  { id: "au", en: "Australia", zh: "澳大利亚" },
  { id: "de", en: "Germany", zh: "德国" },
  { id: "fr", en: "France", zh: "法国" },
  { id: "es", en: "Spain", zh: "西班牙" },
  { id: "it", en: "Italy", zh: "意大利" },
  { id: "jp", en: "Japan", zh: "日本" },
  { id: "kr", en: "South Korea", zh: "韩国" },
  { id: "cn", en: "China", zh: "中国" },
  { id: "in", en: "India", zh: "印度" },
  { id: "br", en: "Brazil", zh: "巴西" },
  { id: "mx", en: "Mexico", zh: "墨西哥" },
  { id: "ru", en: "Russia", zh: "俄罗斯" }
];

const LANGUAGES = [
  { id: "en", en: "English", zh: "英语" },
  { id: "zh", en: "Chinese (Mandarin)", zh: "中文 (普通话)" },
  { id: "es", en: "Spanish", zh: "西班牙语" },
  { id: "ru", en: "Russian", zh: "俄语" },
  { id: "fr", en: "French", zh: "法语" },
  { id: "de", en: "German", zh: "德语" },
  { id: "jp", en: "Japanese", zh: "日语" },
  { id: "ko", en: "Korean", zh: "韩语" },
  { id: "pt", en: "Portuguese", zh: "葡萄牙语" }
];

// Reusable Combobox Component
function Combobox({ 
    options, 
    value, 
    onChange, 
    placeholder, 
    searchPlaceholder,
    renderOption,
    onAddNew,
    addNewLabel
}: { 
    options: { id: string; label: string }[]; 
    value: string; 
    onChange: (val: string) => void; 
    placeholder: string;
    searchPlaceholder: string;
    renderOption?: (option: { id: string; label: string; image?: string }) => React.ReactNode;
    onAddNew?: () => void;
    addNewLabel?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    const filteredOptions = options.filter(opt => 
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    const selectedOption = options.find(opt => opt.id === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={containerRef}>
            <div 
                className={cn(
                    "w-full px-4 py-2 border rounded-lg flex items-center justify-between cursor-pointer bg-white dark:bg-gray-700 transition-all overflow-hidden",
                    isOpen ? "ring-2 ring-inset ring-black dark:ring-white border-transparent" : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                )}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2 truncate mr-2 w-full">
                    {selectedOption ? (
                        renderOption ? renderOption(selectedOption) : (
                            <span className={cn(
                                "truncate", 
                                "text-gray-900 dark:text-white"
                            )}>
                                {selectedOption.label}
                            </span>
                        )
                    ) : (
                        <span className={cn(
                            "truncate", 
                            "text-gray-400 dark:text-gray-400"
                        )}>
                            {placeholder}
                        </span>
                    )}
                </div>
                <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-hidden flex flex-col left-0">
                    <div className="p-2 border-b border-gray-50 dark:border-gray-700">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3" />
                            <input 
                                type="text"
                                className="w-full pl-7 pr-2 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 rounded-md border-none focus:ring-0 outline-none text-gray-900 dark:text-white placeholder-gray-400"
                                placeholder={searchPlaceholder}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-1">
                        {onAddNew && (
                            <div 
                                className="px-3 py-2 text-sm rounded-md cursor-pointer flex items-center gap-2 text-primary hover:bg-primary-soft dark:hover:bg-primary/10 mb-1"
                                onClick={() => {
                                    onAddNew();
                                    setIsOpen(false);
                                }}
                            >
                                <PlusCircle size={14} />
                                <span className="font-medium">{addNewLabel || "Add New"}</span>
                            </div>
                        )}
                        
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-400 text-center">No results found</div>
                        ) : (
                            filteredOptions.map((opt) => (
                                <div 
                                    key={opt.id}
                                    className={cn(
                                        "px-3 py-2 text-sm rounded-md cursor-pointer flex items-center justify-between",
                                        value === opt.id ? "bg-black/5 dark:bg-white/10 text-black dark:text-white font-medium" : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                                    )}
                                    onClick={() => {
                                        onChange(opt.id);
                                        setIsOpen(false);
                                        setSearch("");
                                    }}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        {renderOption ? renderOption(opt) : opt.label}
                                    </div>
                                    {value === opt.id && <Check size={14} className="text-black dark:text-white shrink-0 ml-2" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// Reusable Select Component (Unified Style)
function CustomSelect({
    options,
    value,
    onChange,
    placeholder,
    language = 'en'
}: {
    options: { id: string; en: string; zh: string }[];
    value: string;
    onChange: (val: string) => void;
    placeholder: string;
    language?: 'en' | 'zh';
}) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.id === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={containerRef}>
            <div 
                className={cn(
                    "w-full px-4 py-2 border rounded-lg flex items-center justify-between cursor-pointer bg-white dark:bg-gray-700 transition-all overflow-hidden",
                    isOpen ? "ring-2 ring-inset ring-black dark:ring-white border-transparent" : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                )}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={cn(
                    "truncate mr-2",
                    value ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-400"
                )}>
                    {selectedOption ? (language === 'en' ? selectedOption.en : selectedOption.zh) : placeholder}
                </span>
                <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto p-1 left-0">
                    {options.map((opt) => (
                        <div 
                            key={opt.id}
                            className={cn(
                                "px-3 py-2 text-sm rounded-md cursor-pointer flex items-center justify-between",
                                value === opt.id ? "bg-black/5 dark:bg-white/10 text-black dark:text-white font-medium" : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                            )}
                            onClick={() => {
                                onChange(opt.id);
                                setIsOpen(false);
                            }}
                        >
                            {language === 'en' ? opt.en : opt.zh}
                            {value === opt.id && <Check size={14} className="text-black dark:text-white" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ReplicationForm({ products, scripts, characters = [], preselectedScriptId, mode = 'one-click', onSuccess }: ReplicationFormProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t, language } = useLanguage();
  const myVideosPath = useTenantPath('/my-videos');
  
  // Form State
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedScript, setSelectedScript] = useState(preselectedScriptId || "");
  const [targetCountry, setTargetCountry] = useState("us"); // Default to US
  const [targetLanguage, setTargetLanguage] = useState("en"); // Default to English
  const [duration, setDuration] = useState(mode === 'storyboard' ? "32" : "15"); // Default based on mode
  const [quantity, setQuantity] = useState("1");
  const [selectedCharacter, setSelectedCharacter] = useState("");
  
  // Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [isCharacterModalOpen, setIsCharacterModalOpen] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [digitalTaskTitle, setDigitalTaskTitle] = useState("");
  const [digitalIdea, setDigitalIdea] = useState("");
  const [digitalAudience, setDigitalAudience] = useState("");
  const [digitalWordCount, setDigitalWordCount] = useState("320");
  const digitalPrefillRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  // Update selectedScript when preselectedScriptId changes
  useEffect(() => {
    if (preselectedScriptId) {
      setSelectedScript(preselectedScriptId);
    }
  }, [preselectedScriptId]);

  // Load saved preferences on mount or mode change
  useEffect(() => {
    if (mode === 'digital-human') {
        setTargetCountry("us");
        setTargetLanguage("en");
        setDuration("15");
        setQuantity("1");
        return;
    }
    const prefix = `replication_${mode}_`;
    const savedCountry = localStorage.getItem(`${prefix}targetCountry`);
    const savedLanguage = localStorage.getItem(`${prefix}targetLanguage`);
    const savedDuration = localStorage.getItem(`${prefix}duration`);
    const savedQuantity = localStorage.getItem(`${prefix}quantity`);

    // Only set if value exists in our options
    if (savedCountry && COUNTRIES.some(c => c.id === savedCountry)) {
        setTargetCountry(savedCountry);
    } else {
        setTargetCountry("us");
    }

    if (savedLanguage && LANGUAGES.some(l => l.id === savedLanguage)) {
        setTargetLanguage(savedLanguage);
    } else {
        setTargetLanguage("en");
    }

    if (savedDuration) {
        setDuration(savedDuration);
    } else {
        setDuration(mode === 'storyboard' ? "32" : "15");
    }

    if (savedQuantity) {
        setQuantity(savedQuantity);
    } else {
        setQuantity("1");
    }
  }, [mode]);

  // Helper to save preferences
  const savePreference = (key: string, value: string) => {
    if (mode === 'digital-human') return;
    const prefix = `replication_${mode}_`;
    localStorage.setItem(`${prefix}${key}`, value);
  };
  
  // Parse blueprint if available
  const currentScript = scripts.find(s => s.id === selectedScript);
  const analysisData = useMemo(() => {
    if (!currentScript?.blueprint) return null;
    try {
      return JSON.parse(currentScript.blueprint);
    } catch (error) {
      console.warn("Failed to parse script blueprint JSON", error);
      return null;
    }
  }, [currentScript]);
  const copyInsights = useMemo(() => {
    if (!currentScript) return null;
    return deriveCopyInsights({
      breakdown: currentScript.breakdown,
      blueprint: currentScript.blueprint,
    });
  }, [currentScript]);

  const scriptStatusMessages = (t.scripts?.statusMessages || {}) as Record<string, string>;
  const getStatusLabel = (status?: string | null) => {
    if (!status) return undefined;
    return (
      scriptStatusMessages[status] ||
      scriptStatusMessages.processing ||
      t.replication.processing ||
      t.common?.loading ||
      "Processing..."
    );
  };
  const isScriptProcessing = Boolean(currentScript?.status && currentScript.status !== "completed");
  const scriptStatusText = getStatusLabel(currentScript?.status);
  const scriptLockedHint = scriptStatusMessages.ctaLocked;
  useEffect(() => {
    if (mode !== 'digital-human') {
      digitalPrefillRef.current = null;
      return;
    }
    if (!currentScript) return;
    const key = currentScript.id;
    if (digitalPrefillRef.current === key) return;

    if (!digitalTaskTitle.trim()) {
      setDigitalTaskTitle(`${currentScript.title} · ${(t.replication.digitalHumanModeLabel || 'Digital Human')}`);
    }
    if (!digitalIdea.trim()) {
      if (copyInsights?.copyText) {
        setDigitalIdea(copyInsights.copyText);
      } else if (copyInsights?.coreViewpoint) {
        setDigitalIdea(copyInsights.coreViewpoint);
      } else if (currentScript.title) {
        setDigitalIdea(currentScript.title);
      }
    }
    if (!digitalAudience.trim()) {
      const fallbackAudience = copyInsights?.painPoints?.[0] || copyInsights?.coreViewpoint || "";
      if (fallbackAudience) {
        setDigitalAudience(fallbackAudience);
      }
    }
    if (!digitalWordCount.trim()) {
      const approxWords = copyInsights?.copyText
        ? Math.round(copyInsights.copyText.replace(/\\s+/g, " ").length / 2)
        : 320;
      setDigitalWordCount(String(Math.max(200, Math.min(600, approxWords))));
    }
    digitalPrefillRef.current = key;
  }, [
    mode,
    currentScript,
    copyInsights?.copyText,
    copyInsights?.painPoints,
    copyInsights?.coreViewpoint,
    digitalTaskTitle,
    digitalIdea,
    digitalAudience,
    digitalWordCount,
    t.replication.digitalHumanModeLabel,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedScript) {
        toast.error("Please select a script");
        return;
    }
    if (mode !== 'digital-human' && !selectedProduct) {
        toast.error("Please select product and script");
        return;
    }
    
    setLoading(true);

    try {
      if (mode === 'storyboard') {
        const formData = new FormData();
        formData.append('productId', selectedProduct);
        // We need to pass the video URL from the script. 
        // Since we only have scriptId here, we might need to fetch script details or pass videoUrl in props.
        // For now, let's assume the script object in props has videoUrl or we fetch it.
        // Actually, props.scripts only has id and title.
        // Let's modify the props to include videoUrl if possible, or fetch it.
        // BUT, ReplicationForm is used in ScriptList where we have the full script object.
        // Let's assume we can get the videoUrl from the `scripts` prop if we update the interface.
        
        // However, updating the interface might break other usages if not careful.
        // A better approach for now without changing props structure too much:
        // We can't easily get videoUrl here without fetching.
        // Let's try to find the script in the `scripts` array if it has extra data, 
        // OR we just use the script ID and let the backend handle it?
        // createStoryboardTask expects videoUrl.
        
        // Let's update the interface to allow finding the videoUrl.
        const script = scripts.find(s => s.id === selectedScript);
        // We need to cast or ensure scripts has videoUrl.
        // Let's just pass videoUrl as a hidden field or assume backend can handle scriptId -> videoUrl resolution.
        // But createStoryboardTask takes videoUrl directly.
        
        // Workaround: We'll modify the props in the next step to include videoUrl in the scripts array items.
        // For now, let's assume we can get it.
        const selectedScriptObj = scripts.find(s => s.id === selectedScript);
        // @ts-ignore
        const videoUrl = selectedScriptObj?.videoUrl || ""; 

        formData.append('videoUrl', videoUrl);
        
        if (selectedCharacter) {
            formData.append('characterId', selectedCharacter);
        }
        
        if (session?.user?.id) {
          formData.append('userId', session.user.id);
        }

        const result = await createStoryboardTask(formData);
        emitCreditsRefresh();
        toast.success("Storyboard task created! Redirecting...", { icon: "🚀" });
        router.push(`/storyboard/${result.taskId}`);

      } else if (mode === 'digital-human') {
        if (!selectedCharacter) {
          toast.error(t.characters.selectCharacter);
          setLoading(false);
          return;
        }
        if (!session?.access_token) {
          toast.error(t.replication.digitalHumanAuthError || "请先登录以创建数字人脚本");
          setLoading(false);
          return;
        }

        const headers: HeadersInit = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        };
        const ideaText =
          digitalIdea.trim() ||
          copyInsights?.copyText ||
          copyInsights?.coreViewpoint ||
          currentScript?.title ||
          "Digital Human Script";
        const fallbackAudience =
          digitalAudience.trim() ||
          copyInsights?.painPoints?.[0] ||
          copyInsights?.coreViewpoint ||
          undefined;

        const payload = {
          scriptId: selectedScript,
          characterId: selectedCharacter,
          wordCount: digitalWordCount.trim(),
          ideaText,
          audience: fallbackAudience,
          title: digitalTaskTitle.trim(),
        };

        const response = await fetch("/api/replication/digital-human", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed with status ${response.status}`);
        }

        await response.json().catch(() => ({}));
        toast.success(t.replication.digitalHumanSuccess || t.common.success, { icon: "🤖" });
        onSuccess?.();
        router.push("/replication?tab=DIGITAL_HUMAN");

      } else {
        // Existing One-Click Logic
        const headers: HeadersInit = { 
          "Content-Type": "application/json" 
        };
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }

        const response = await fetch("/api/replication/generate", {
            method: "POST",
            headers,
            body: JSON.stringify({ 
                productId: selectedProduct, 
                scriptId: selectedScript,
                targetCountry,
                targetLanguage,
                duration,
                quantity,
                blueprint: currentScript?.blueprint || null
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed with status ${response.status}`);
        }

        emitCreditsRefresh();
        toast.success(t.replication.toastStarted || t.common.success, { icon: "🚀" });
        onSuccess?.();
        router.push(myVideosPath);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to start replication.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 h-full flex flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
          {/* Product Selection */}
          {mode !== 'digital-human' && (
          <div>
            <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.replication.selectProduct}</label>
            <Combobox 
                options={products.map(p => {
                    let image = "";
                    try {
                        const images = JSON.parse(p.images || "[]");
                        if (images.length > 0) image = images[0];
                    } catch (e) {}
                    return { id: p.id, label: p.name, image };
                })}
                value={selectedProduct}
                onChange={setSelectedProduct}
                placeholder={t.replication.selectProduct + "..."}
                searchPlaceholder={t.common.search}
                renderOption={(opt) => (
                    <div className="flex items-center gap-2">
                        {opt.image ? (
                            <img src={opt.image} alt={opt.label} className="w-6 h-6 rounded object-cover border border-gray-200 dark:border-gray-600" />
                        ) : (
                            <div className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-600 flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-300 font-bold">
                                {opt.label.charAt(0)}
                            </div>
                        )}
                        <span className="truncate">{opt.label}</span>
                    </div>
                )}
                onAddNew={() => setIsProductModalOpen(true)}
                addNewLabel={t.products.newProduct}
            />
          </div>
          )}

          {/* Script Selection - Only show if not preselected */}
          {!preselectedScriptId && (
          <div>
            <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.replication.selectScript}</label>
            <Combobox 
                options={scripts.map(s => ({ id: s.id, label: s.title }))}
                value={selectedScript}
                onChange={setSelectedScript}
                placeholder={t.replication.selectScript + "..."}
                searchPlaceholder={t.common.search}
                onAddNew={() => setIsScriptModalOpen(true)}
                addNewLabel={t.scripts.newScript}
                renderOption={(opt) => (
                    <div className="flex items-center gap-2">
                        <span className="truncate">{opt.label}</span>
                    </div>
                )}
            />
          </div>
          )}

          {/* Analysis Result Display */}
          {/* Removed Analysis Result from here as it is now in a separate tab in the Modal */}

          {mode === 'digital-human' && (
            <>
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.replication.digitalHumanForm?.title || "任务名称"}</label>
                <input
                  type="text"
                  value={digitalTaskTitle}
                  onChange={(e) => setDigitalTaskTitle(e.target.value)}
                  placeholder={t.replication.digitalHumanForm?.titlePlaceholder || "例如：小红书·数字人口播任务"}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary focus:ring-inset focus:border-primary outline-none"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t.replication.digitalHumanForm?.helper || "系统会自动注入爆款拆解结果，创作类型固定为口播稿。"}
                </p>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.replication.digitalHumanForm?.wordCount || "字数"}</label>
                <input
                  type="number"
                  min={100}
                  max={800}
                  value={digitalWordCount}
                  onChange={(e) => setDigitalWordCount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary focus:ring-inset focus:border-primary outline-none"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t.replication.digitalHumanForm?.wordCountHelper || "系统自动拉齐口播长度，可在这里微调字数。"}
                </p>
              </div>
            </>
          )}

          {/* Character Selection - Storyboard & Digital Human */}
          {(mode === 'storyboard' || mode === 'digital-human') && (
            <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.characters.selectCharacter}</label>
                <Combobox 
                    options={characters.map(c => ({ id: c.id, label: c.name, image: c.avatar }))}
                    value={selectedCharacter}
                    onChange={setSelectedCharacter}
                    placeholder={(t.characters.selectCharacter) + "..."}
                    searchPlaceholder={t.common.search}
                    renderOption={(opt) => (
                        <div className="flex items-center gap-2">
                            {opt.image ? (
                                <img src={opt.image} alt={opt.label} className="w-6 h-6 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
                            ) : (
                                <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-300 font-bold">
                                    {opt.label.charAt(0)}
                                </div>
                            )}
                            <span className="truncate">{opt.label}</span>
                        </div>
                    )}
                    onAddNew={() => setIsCharacterModalOpen(true)}
                    addNewLabel={t.characters.newCharacter}
                />
            </div>
          )}

          {mode !== 'digital-human' && (
            <>
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.replication.targetCountry}</label>
                <Combobox 
                    options={COUNTRIES.map(c => ({ id: c.id, label: language === 'en' ? c.en : c.zh }))}
                    value={targetCountry}
                    onChange={(val) => {
                        setTargetCountry(val);
                        savePreference('targetCountry', val);
                    }}
                    placeholder={t.replication.targetCountry + "..."}
                    searchPlaceholder={t.common.search}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.replication.videoLanguage}</label>
                <CustomSelect 
                    options={LANGUAGES}
                    value={targetLanguage}
                    onChange={(val) => {
                        setTargetLanguage(val);
                        savePreference('targetLanguage', val);
                    }}
                    placeholder={t.replication.videoLanguage + "..."}
                    language={language === 'zh' ? 'zh' : 'en'}
                />
              </div>
            </>
          )}

          {mode === 'storyboard' && (
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.replication.duration}</label>
                    <div className="grid grid-cols-3 gap-2">
                        {['16', '24', '32', '40', '48', '56'].map((d) => (
                            <div 
                                key={d}
                                onClick={() => {
                                    setDuration(d);
                                    savePreference('duration', d);
                                }}
                                className={cn(
                                    "text-center py-2 border rounded-lg cursor-pointer transition-all text-sm font-medium",
                                    duration === d 
                                        ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white" 
                                        : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                                )}
                            >
                                {d}s
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.replication.quantity}</label>
                    <input 
                        type="number" 
                        name="quantity" 
                        min="1" 
                        max="10" 
                        value={quantity}
                        onChange={(e) => {
                            setQuantity(e.target.value);
                            savePreference('quantity', e.target.value);
                        }}
                        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none h-[38px]" 
                        required 
                    />
                </div>
            </div>
          )}

          {mode === 'one-click' && (
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.replication.duration}</label>
                    <div className="flex gap-2">
                        {['10', '15'].map((d) => (
                            <div 
                                key={d}
                                onClick={() => {
                                    setDuration(d);
                                    savePreference('duration', d);
                                }}
                                className={cn(
                                    "flex-1 text-center py-2 border rounded-lg cursor-pointer transition-all text-sm font-medium",
                                    duration === d 
                                        ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white" 
                                        : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                                )}
                            >
                                {d}s
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">{t.replication.quantity}</label>
                    <input 
                        type="number" 
                        name="quantity" 
                        min="1" 
                        max="10" 
                        value={quantity}
                        onChange={(e) => {
                            setQuantity(e.target.value);
                            savePreference('quantity', e.target.value);
                        }}
                        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-yellow focus:border-transparent outline-none h-[38px]" 
                        required 
                    />
                </div>
            </div>
          )}
      </div>

      <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-auto">
        <button
          type="submit"
          disabled={loading || isScriptProcessing}
          className={cn(
            "w-full py-3 bg-black text-white dark:bg-white dark:text-black font-bold rounded-xl transition-colors shadow-sm uppercase tracking-wide flex items-center justify-center gap-2",
            "hover:bg-gray-900 dark:hover:bg-gray-100",
            (loading || isScriptProcessing) && "opacity-60 cursor-not-allowed pointer-events-none"
          )}
        >
          {loading ? (
            <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t.replication.processing}
            </>
          ) : isScriptProcessing ? (
            <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {scriptStatusText || t.replication.processing}
            </>
          ) : (
            <>
                <span>⚡</span> {t.replication.start}
            </>
          )}
        </button>
        {isScriptProcessing && (
          <p className="text-xs text-amber-600 dark:text-amber-300 mt-3 text-center">
            {scriptLockedHint || "请等待拆解完成后再发起复刻。"}
          </p>
        )}
      </div>

      <Modal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        title={t.products.formTitle}
      >
        <ProductForm 
            onSuccess={() => {
                setIsProductModalOpen(false);
                router.refresh();
            }} 
        />
      </Modal>

      <Modal
        isOpen={isScriptModalOpen}
        onClose={() => setIsScriptModalOpen(false)}
        title={t.scripts.formTitle}
      >
        <ScriptForm 
            onSuccess={() => {
                setIsScriptModalOpen(false);
                router.refresh();
            }} 
        />
      </Modal>
      <Modal
        isOpen={isCharacterModalOpen}
        onClose={() => setIsCharacterModalOpen(false)}
        title={t.characters.formTitle}
      >
        <CharacterForm 
            onSuccess={() => {
                setIsCharacterModalOpen(false);
                router.refresh();
            }} 
        />
      </Modal>
    </form>
  );
}
