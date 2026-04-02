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
import {
  DIGITAL_HUMAN_CPS,
  DIGITAL_HUMAN_MAX_SECONDS,
  DIGITAL_HUMAN_SAFETY,
} from "@/lib/digitalHumanLimits";
import { DHSetupModal } from "@/components/DHSetupModal";

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

const DIGITAL_WORD_MIN = 80;
const DIGITAL_WORD_LIMIT = Math.floor(
  DIGITAL_HUMAN_CPS * DIGITAL_HUMAN_MAX_SECONDS * DIGITAL_HUMAN_SAFETY
);

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
                    "w-full px-4 py-2 border rounded-lg flex items-center justify-between cursor-pointer bg-white dark:bg-gray-800 transition-all overflow-hidden",
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
                                className="px-3 py-2 text-sm rounded-md cursor-pointer flex items-center gap-2 text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 mb-1"
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
                                        value === opt.id ? "bg-yellow-50 dark:bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 font-medium" : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
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
                                    {value === opt.id && <Check size={14} className="text-yellow-600 dark:text-yellow-300 shrink-0 ml-2" />}
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
                    "w-full px-4 py-2 border rounded-lg flex items-center justify-between cursor-pointer bg-white dark:bg-gray-800 transition-all overflow-hidden",
                    isOpen ? "ring-2 ring-inset ring-black dark:ring-white border-transparent" : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                )}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={cn(
                    "truncate mr-2",
                    value ? "text-gray-900 dark:text-white" : "text-gray-400"
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
                                value === opt.id ? "bg-yellow-50 dark:bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 font-medium" : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                            )}
                            onClick={() => {
                                onChange(opt.id);
                                setIsOpen(false);
                            }}
                        >
                            {language === 'en' ? opt.en : opt.zh}
                            {value === opt.id && <Check size={14} className="text-yellow-600 dark:text-yellow-300" />}
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
  const myProjectsReplicationPath = useTenantPath('/my-works?type=replication');
  const myProjectsDigitalHumanPath = useTenantPath('/my-works?type=digitalHuman');
  const storyboardBasePath = useTenantPath('/storyboard');
  
  // Form State
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedScript, setSelectedScript] = useState(preselectedScriptId || "");
  const [targetCountry, setTargetCountry] = useState("us"); // Default to US
  const [targetLanguage, setTargetLanguage] = useState("en"); // Default to English
  const [duration, setDuration] = useState(mode === 'storyboard' ? "32" : "15"); // Default based on mode
  const [quantity, setQuantity] = useState("1");
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [imageModel, setImageModel] = useState("nanoBananapro"); // Image generation model
  const [videoModel, setVideoModel] = useState("veo_3_1-fast"); // Video generation model
  const [soraProvider, setSoraProvider] = useState<'kie' | 'yunwu'>('kie'); // Sora provider for one-click mode
  
  // Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [isCharacterModalOpen, setIsCharacterModalOpen] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [digitalTaskTitle, setDigitalTaskTitle] = useState("");
  const [digitalIdea, setDigitalIdea] = useState("");
  const [digitalAudience, setDigitalAudience] = useState("");
  const digitalPrefillRef = useRef<string | null>(null);
  const [isDHSetupOpen, setIsDHSetupOpen] = useState(false);

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
  const normalizedScriptStatus = (currentScript?.status || "").toLowerCase();
  const scriptReadyStatuses = new Set(["completed", "success", "script_ready", "breakdown_completed"]);
  const scriptFailedStatuses = new Set(["failed", "error", "script_failed", "breakdown_failed"]);
  const isScriptProcessing = Boolean(
    normalizedScriptStatus &&
    !scriptReadyStatuses.has(normalizedScriptStatus) &&
    !scriptFailedStatuses.has(normalizedScriptStatus)
  );
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
    t.replication.digitalHumanModeLabel,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedScript) {
        toast.error("Please select a script");
        return;
    }
    setLoading(true);

    try {
      if (mode === 'storyboard') {
        const formData = new FormData();
        if (selectedProduct) formData.append('productId', selectedProduct);
        const selectedScriptObj = scripts.find((s) => s.id === selectedScript);
        const videoUrl = selectedScriptObj?.videoUrl || "";
        if (videoUrl) {
          formData.append('videoUrl', videoUrl);
        }

        const scriptContent =
          copyInsights?.copyText ||
          [
            copyInsights?.segments?.intro,
            copyInsights?.segments?.body,
            copyInsights?.segments?.conclusion,
          ]
            .filter(Boolean)
            .join('\n\n');
        if (scriptContent?.trim()) {
          formData.append('scriptContent', scriptContent.trim());
        }
        formData.append('scriptId', selectedScript);
        
        if (selectedCharacter) {
            formData.append('characterId', selectedCharacter);
        }

        const activeSession = session || (await supabase.auth.getSession()).data.session;
        if (activeSession?.user?.id) {
          formData.append('userId', activeSession.user.id);
        }
        formData.append('imageModel', imageModel);
        formData.append('videoModel', videoModel);

        // 按模式固定工作流：分镜成片始终走同一条 workflow，不依赖脚本是否已有分析结果
        const replicationModeForTask = 'viral-clone';
        if (!videoUrl) {
          throw new Error("当前脚本缺少视频地址，无法发起分镜拆解。请先重新上传脚本视频。");
        }
        formData.append('replicationMode', replicationModeForTask);

        if (targetCountry) formData.append('targetCountry', targetCountry);
        if (targetLanguage) formData.append('targetLanguage', targetLanguage);
        const result = await createStoryboardTask(formData);
        emitCreditsRefresh();
        toast.success("分镜成片任务已发起，正在跳转...", { icon: "🚀" });
        router.push(`${storyboardBasePath}/${result.taskId}`);

      } else if (mode === 'digital-human') {
        if (!session?.access_token) {
          toast.error(t.replication.digitalHumanAuthError || "请先登录以创建数字人脚本");
          setLoading(false);
          return;
        }
        // Open the standalone setup modal; all further logic is handled there
        setIsDHSetupOpen(true);

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
                soraProvider,
                blueprint: currentScript?.blueprint || null,
                videoModel,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed with status ${response.status}`);
        }

        emitCreditsRefresh();
        toast.success(t.replication.toastStarted || t.common.success, { icon: "🚀" });
        onSuccess?.();
        router.push(myProjectsReplicationPath);
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
          {/* 2-column grid: product, character, country, language, quantity */}
          <div className="grid grid-cols-2 gap-4">
            {/* Product Selection */}
            {mode !== 'digital-human' && (
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                {t.replication.selectProduct}
                <span className="ml-1 text-xs font-normal text-gray-400 dark:text-gray-500">{language === 'en' ? '(optional)' : '（可选）'}</span>
              </label>
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

            {/* Character Selection - Storyboard only */}
            {mode === 'storyboard' && (
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

            {/* Target Country */}
            {mode !== 'digital-human' && (
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
            )}

            {/* Video Language */}
            {mode !== 'digital-human' && (
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
            )}

            {/* Quantity removed */}
          </div>

          {mode === 'storyboard' && (
            <div className="space-y-3">
                <div>
                    <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">首帧图生成模型</label>
                    <div className="flex gap-2">
                        {[
                          { id: 'nanoBananapro', label: 'Banana Pro', desc: '高质量' },
                          { id: 'nanoBanana2', label: 'Banana 2', desc: '快速' },
                        ].map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setImageModel(m.id)}
                                className={cn(
                                    "flex-1 py-2 px-3 border rounded-lg cursor-pointer transition-all text-sm font-medium text-center",
                                    imageModel === m.id
                                        ? "bg-black text-white dark:bg-yellow-300 dark:text-black border-black dark:border-yellow-300"
                                        : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                                )}
                            >
                                <div>{m.label}</div>
                                <div className="text-[10px] opacity-60">{m.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">视频生成模型</label>
                    <div className="flex gap-2">
                        {[
                          { id: 'veo_3_1-fast', label: 'Veo 3.1 Fast', desc: '自然' },
                          { id: 'grok', label: 'Grok', desc: '创意' },
                        ].map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setVideoModel(m.id)}
                                className={cn(
                                    "flex-1 py-2 px-3 border rounded-lg cursor-pointer transition-all text-sm font-medium text-center",
                                    videoModel === m.id
                                        ? "bg-black text-white dark:bg-yellow-300 dark:text-black border-black dark:border-yellow-300"
                                        : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                                )}
                            >
                                <div>{m.label}</div>
                                <div className="text-[10px] opacity-60">{m.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
          )}

          {mode === 'one-click' && (
            <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">路线选择</label>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => setSoraProvider('kie')}
                        className={cn(
                            "p-3 rounded-lg border-2 transition-all text-left",
                            soraProvider === 'kie'
                                ? "border-black bg-black/5 dark:border-yellow-300 dark:bg-yellow-300"
                                : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                        )}
                    >
                        <div
                          className={cn(
                            "font-semibold",
                            soraProvider === "kie"
                              ? "text-gray-900 dark:text-black"
                              : "text-gray-900 dark:text-white"
                          )}
                        >
                          路线一
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setSoraProvider('yunwu')}
                        className={cn(
                            "p-3 rounded-lg border-2 transition-all text-left",
                            soraProvider === 'yunwu'
                                ? "border-black bg-black/5 dark:border-yellow-300 dark:bg-yellow-300"
                                : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                        )}
                    >
                        <div
                          className={cn(
                            "font-semibold",
                            soraProvider === "yunwu"
                              ? "text-gray-900 dark:text-black"
                              : "text-gray-900 dark:text-white"
                          )}
                        >
                          路线二
                        </div>
                    </button>
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
                                        ? "bg-black text-white dark:bg-yellow-300 dark:text-black border-black dark:border-yellow-300" 
                                        : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                                )}
                            >
                                {d}s
                            </div>
                        ))}
                    </div>
                </div>
                {/* Quantity removed */}
            </div>
          )}
      </div>

      <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-auto">
        <button
          type="submit"
          disabled={loading || isScriptProcessing}
          className={cn(
            "w-full py-3 bg-black text-white dark:bg-yellow-300 dark:text-black font-bold rounded-xl transition-colors shadow-sm uppercase tracking-wide flex items-center justify-center gap-2",
            "hover:bg-gray-900 dark:hover:bg-yellow-200",
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
            assistantLayout="floating"
        />
      </Modal>

      <Modal
        isOpen={isScriptModalOpen}
        onClose={() => setIsScriptModalOpen(false)}
        title={t.scripts.formTitle}
        zIndex="z-[60]"
      >
        <ScriptForm 
            onSuccess={() => {
                setIsScriptModalOpen(false);
                router.refresh();
            }}
            assistantLayout="floating"
            showAssistant={false}
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
      {isDHSetupOpen && session?.access_token && (
        <DHSetupModal
          scriptId={selectedScript}
          ideaText={
            digitalIdea.trim() ||
            copyInsights?.copyText ||
            copyInsights?.coreViewpoint ||
            currentScript?.title ||
            "Digital Human Script"
          }
          audience={
            digitalAudience.trim() ||
            copyInsights?.painPoints?.[0] ||
            copyInsights?.coreViewpoint
          }
          title={digitalTaskTitle.trim()}
          characters={characters}
          authToken={session.access_token}
          onConfirmed={() => {
            setIsDHSetupOpen(false);
            toast.success("视频生成已启动", { icon: "🎬" });
            onSuccess?.();
            router.push(myProjectsDigitalHumanPath);
          }}
          onClose={() => setIsDHSetupOpen(false)}
          onAddCharacter={() => {
            setIsDHSetupOpen(false);
            setIsCharacterModalOpen(true);
          }}
        />
      )}
    </form>
  );
}
