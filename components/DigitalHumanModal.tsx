'use client';

/* eslint-disable @next/next/no-img-element -- Digital human builder shows live previews from blob/object URLs */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { X, Loader2, Mic, User, FileText, Check, Info, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { createDigitalHumanVideo } from '@/app/actions/digital-human';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Modal, useModalHeader } from '@/components/Modal';
import { CharacterForm } from '@/components/CharacterForm';
import { useTenantPath } from '@/hooks/useTenant';
import {
  DIGITAL_HUMAN_MAX_SECONDS,
  analyzeScriptDuration,
  formatScriptDurationMessage,
} from '@/lib/digitalHumanLimits';

const PRIMARY_BREAK_CHARS = new Set<string>([
  '。',
  '！',
  '!',
  '？',
  '?',
  '；',
  ';',
  '，',
  ',',
  '、',
  '：',
  ':',
  '.',
  '\n',
]);
const SECONDARY_BREAK_CHARS = new Set<string>([' ', '\t']);

function findBreakPoint(chunk: string): number {
  for (const charset of [PRIMARY_BREAK_CHARS, SECONDARY_BREAK_CHARS]) {
    for (let i = chunk.length - 1; i >= 0; i -= 1) {
      if (charset.has(chunk[i])) {
        return i + 1;
      }
    }
  }
  return -1;
}

function splitScriptIntoChunks(script: string, maxChars: number): string[] {
  const safeLimit = Math.max(1, Math.floor(maxChars));
  const normalized = (script ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const remaining = normalized.length - cursor;
    if (remaining <= safeLimit) {
      chunks.push(normalized.slice(cursor).trim());
      break;
    }

    const tentativeEnd = cursor + safeLimit;
    const slice = normalized.slice(cursor, tentativeEnd);
    let breakPoint = findBreakPoint(slice);
    if (breakPoint <= 0) breakPoint = safeLimit;

    const segment = normalized.slice(cursor, cursor + breakPoint).trim();
    if (segment) chunks.push(segment);
    cursor += breakPoint;
  }

  return chunks;
}

interface DigitalHumanModalProps {
  onClose: () => void;
  defaultScript?: string;
  sourceTaskId?: string;
  disableAutoRedirect?: boolean;
  onSuccess?: () => void | Promise<void>;
  hideInternalTitle?: boolean;
  showAssistant?: boolean;
}

interface CharacterOption {
  id: string;
  name: string;
  avatar: string;
  voiceId?: string | null;
}

export function DigitalHumanModal({
  onClose,
  defaultScript,
  sourceTaskId,
  disableAutoRedirect = false,
  onSuccess,
  hideInternalTitle = false,
  showAssistant = true,
}: DigitalHumanModalProps) {
  const { t, language } = useLanguage();
  const normalizedLanguage = (language || '').toLowerCase();
  const isZhLocale = normalizedLanguage.startsWith('zh');
  const digitalCopy = t.contentCreation?.newTask?.digitalHuman;
  const voiceModeCopy = digitalCopy?.modes?.voice;
  const lipModeCopy = digitalCopy?.modes?.lip;
  const digitalTitle = digitalCopy?.title ?? t.storyboard.digitalHuman;
  const characterLabel = digitalCopy?.characterLabel ?? t.characters.selectCharacter;
  const characterCreateLabel = digitalCopy?.characterCreate ?? t.characters.newCharacter;
  const characterEmptyCopy = digitalCopy?.characterEmpty ?? t.characters.noCharacters;
  const characterMissingVoiceCopy = digitalCopy?.characterMissingVoice;
  const scriptLabel = digitalCopy?.scriptLabel ?? t.storyboard.voiceoverScript;
  const scriptPlaceholder = digitalCopy?.scriptPlaceholder ?? t.storyboard.voiceoverPlaceholder;
  const audioLabelCopy = digitalCopy?.audioLabel ?? t.storyboard.voiceRef;
  const audioPlaceholderCopy = digitalCopy?.audioPlaceholder ?? t.storyboard.voiceRefPlaceholder;
  const audioDurationLabel =
    digitalCopy?.audioDurationLabel ?? t.storyboard.audioDurationLabel ?? "Detected duration";
  const uploadHint =
    digitalCopy?.uploadHint ?? t.storyboard.uploadHint ?? "Click or drag audio file to upload";
  const replaceAudioLabel =
    digitalCopy?.replaceAudio ?? t.storyboard.replaceAudio ?? "Replace audio";
  const removeAudioLabel =
    digitalCopy?.removeAudio ?? t.storyboard.removeAudio ?? "Remove audio";
  const defaultVoiceLabel = digitalCopy?.defaultVoiceLabel ?? t.storyboard.voiceRef;
  const stickyNote = digitalCopy?.stickyNote ?? t.storyboard.digitalHumanNote;
  const submitLabel = digitalCopy?.submit ?? t.storyboard.generateDigitalHumanVideo;
  const generatingLabel = digitalCopy?.generating ?? t.storyboard.generatingDigitalHumanVideo;
  const characterRequiredMessage = digitalCopy?.characterRequired ?? t.characters.selectCharacterWarning;
  const audioRequiredMessage = digitalCopy?.audioRequired ?? t.characters.uploadVoice;
  const scriptRequiredMessage = digitalCopy?.scriptRequired ?? t.storyboard.voiceoverScript;
  const router = useRouter();
  const myProjectsPath = useTenantPath('/my-works?type=digitalHuman');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isCompactLayout, setIsCompactLayout] = useState(true);
  const modes = useMemo(
    () => [
      {
        key: 'VOICE_CLONE' as const,
        label: voiceModeCopy?.label ?? t.storyboard.voiceClone,
        description: voiceModeCopy?.description,
        icon: <FileText size={16} />,
      },
      {
        key: 'LIP_SYNC' as const,
        label: lipModeCopy?.label ?? t.storyboard.lipSync,
        description: lipModeCopy?.description,
        icon: <Mic size={16} />,
      },
    ],
    [voiceModeCopy?.label, voiceModeCopy?.description, lipModeCopy?.label, lipModeCopy?.description, t.storyboard.voiceClone, t.storyboard.lipSync]
  );
  const [mode, setMode] = useState<typeof modes[number]['key']>('VOICE_CLONE');
  const [isCharacterModalOpen, setIsCharacterModalOpen] = useState(false);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [charactersLoading, setCharactersLoading] = useState(true);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId]
  );
  const modeLabelText =
    digitalCopy?.modeLabel ??
    t.storyboard.modeLabel ??
    (isZhLocale ? '驱动方式' : 'Mode');
  const modalHeader = useModalHeader();
  const headerPortalActive = Boolean(modalHeader);

  const ModeSwitcher = ({ fullWidth = true }: { fullWidth?: boolean }) => (
    <nav
      aria-label={modeLabelText}
      className={cn('flex w-full', fullWidth ? 'justify-center' : 'justify-end')}
    >
      <div
        className={cn(
          'flex gap-2 rounded-full border border-gray-200 bg-gray-50/80 p-1.5 dark:border-gray-700 dark:bg-gray-800/70',
          fullWidth ? 'w-full max-w-xl' : 'w-auto'
        )}
      >
        {modes.map((item) => {
          const isActive = mode === item.key;
          return (
            <button
              type="button"
              key={item.key}
              onClick={() => setMode(item.key)}
              className={cn(
                'relative flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-1 dark:focus-visible:ring-white/30',
                fullWidth ? 'flex-1' : 'flex-none min-w-[120px]',
                isActive
                  ? 'bg-black text-white shadow-sm dark:bg-white dark:text-black'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
              )}
              aria-pressed={isActive}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  useEffect(() => {
    if (!modalHeader) return;
    modalHeader.setContent(<ModeSwitcher fullWidth />);
    return () => modalHeader.setContent(null);
  }, [modalHeader, mode]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateLayout = (width: number) => {
      const next = width < 960;
      setIsCompactLayout((prev) => (prev === next ? prev : next));
    };

    updateLayout(element.offsetWidth);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (width != null) updateLayout(width);
      });
      observer.observe(element);
      return () => observer.disconnect();
    }

    const handleResize = () => updateLayout(element.offsetWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchCharacters = useCallback(async () => {
    const token = await supabase.auth.getSession().then(({ data: { session } }) => session?.access_token);
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch('/api/characters', { headers });
    if (!res.ok) throw new Error('Failed to load characters');
    const data: CharacterOption[] = await res.json();
    return data;
  }, []);

  const charactersFetchErrorMessage = t.characters.fetchError;

  useEffect(() => {
    let isMounted = true;
    setCharactersLoading(true);
    fetchCharacters()
      .then((data) => {
        if (isMounted) {
          setCharacters(data);
        }
      })
      .catch((error) => {
        console.error('Failed to load characters', error);
        if (isMounted) toast.error(charactersFetchErrorMessage);
      })
      .finally(() => {
        if (isMounted) setCharactersLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [fetchCharacters, charactersFetchErrorMessage]);

  useEffect(() => {
    if (!selectedCharacter) {
      setImageUrl('');
      if (mode === 'VOICE_CLONE') {
        setAudioUrl('');
        setAudioFile(null);
        setAudioDuration(0);
      }
      return;
    }
    let cancelled = false;

    if (selectedCharacter.avatar) {
      setImageUrl(selectedCharacter.avatar);
    } else {
      setImageUrl('');
    }

    if (mode === 'VOICE_CLONE') {
      if (selectedCharacter.voiceId) {
        const voiceUrl = selectedCharacter.voiceId;
        setAudioUrl(voiceUrl);
        setAudioFile(null);
        getDuration(voiceUrl).then((duration) => {
          if (!cancelled) {
            setAudioDuration(duration);
          }
        });
      } else {
        setAudioUrl('');
        setAudioFile(null);
        setAudioDuration(0);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [selectedCharacter, mode]);

  const handleCharacterModalSuccess = async () => {
    setIsCharacterModalOpen(false);
    setCharactersLoading(true);
    try {
      const data = await fetchCharacters();
      setCharacters(data);
      if (data.length) {
        setSelectedCharacterId(data[0].id);
      }
    } catch (error) {
      console.error('Failed to refresh characters', error);
      toast.error(t.characters.fetchError);
    } finally {
      setCharactersLoading(false);
    }
  };
  
  const [loading, setLoading] = useState(false);
  
  const [imageUrl, setImageUrl] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState('');

  const [emoAudioFile, setEmoAudioFile] = useState<File | null>(null);
  const [emoAudioUrl, setEmoAudioUrl] = useState('');
  const [emoAudioDragActive, setEmoAudioDragActive] = useState(false);
  const [splitChunks, setSplitChunks] = useState<string[]>([]);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitMeta, setSplitMeta] = useState<{
    limitChars: number;
    chunkSeconds: number;
    limitSeconds: number;
    estimatedSeconds: number;
  } | null>(null);
  
  const [script, setScript] = useState(defaultScript ?? '');
  useEffect(() => {
    setScript(defaultScript ?? '');
  }, [defaultScript]);
  const [uploading, setUploading] = useState(false);
  
  const [audioDragActive, setAudioDragActive] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const hasCharacterVoice = Boolean(selectedCharacter?.voiceId);
  const shouldShowVoiceUpload = mode === 'LIP_SYNC' || !hasCharacterVoice;
  const shouldShowEmoUpload = mode === 'VOICE_CLONE';
  const shouldRenderAudioUploads = shouldShowVoiceUpload || shouldShowEmoUpload;
  const shouldSplitAudioUploads = shouldShowVoiceUpload && shouldShowEmoUpload;
  const voicePlaceholder = audioPlaceholderCopy;
  const emoPlaceholder = t.storyboard.emoRefPlaceholder;
  const scriptStats = useMemo(() => analyzeScriptDuration(script), [script]);
  const scriptMessage = useMemo(
    () => formatScriptDurationMessage(scriptStats, { locale: language }),
    [language, scriptStats]
  );
  const splitChunkSummary = useMemo(
    () =>
      splitChunks.map((chunk, index) => {
        const trimmed = chunk.trim();
        const preview =
          trimmed.length > 42 ? `${trimmed.slice(0, 42)}...` : trimmed;
        return {
          index: index + 1,
          length: trimmed.length,
          preview: preview || '(empty chunk)',
        };
      }),
    [splitChunks]
  );
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(isZhLocale ? 'zh-CN' : 'en-US'),
    [isZhLocale]
  );
  const splitModalHints = useMemo(() => {
    const chunkSeconds =
      splitMeta?.chunkSeconds ?? Math.max(1, Math.round(scriptStats.limitSeconds * scriptStats.safety));
    const limitChars = splitMeta?.limitChars ?? scriptStats.limitChars;
    const limitSeconds = splitMeta?.limitSeconds ?? scriptStats.limitSeconds;
    const estimatedSeconds = splitMeta?.estimatedSeconds ?? scriptStats.estimatedSeconds;
    return { chunkSeconds, limitChars, limitSeconds, estimatedSeconds };
  }, [splitMeta, scriptStats]);
  const scriptHasContent = script.trim().length > 0;
  const scriptTooLong = mode === 'VOICE_CLONE' && scriptHasContent && scriptStats.needSplit;
  const audioLimitSeconds = DIGITAL_HUMAN_MAX_SECONDS;
  const audioTooLong = audioDuration > audioLimitSeconds;
  const audioLimitReminder = useMemo(() => {
    if (isZhLocale) {
      return `音频需控制在 ${audioLimitSeconds}s 内，超出请拆分后上传。`;
    }
    return `Audio must be ≤ ${audioLimitSeconds}s. Please split longer clips.`;
  }, [audioLimitSeconds, isZhLocale]);

  useEffect(() => {
    if (mode !== 'LIP_SYNC') return;
    if (!selectedCharacter?.voiceId) return;
    if (audioFile) return;
    if (!audioUrl) return;
    if (audioUrl !== selectedCharacter.voiceId) return;

    // Ensure lip-sync mode never falls back to the character's default voice; user must upload audio.
    setAudioFile(null);
    setAudioUrl('');
    setAudioDuration(0);
  }, [mode, selectedCharacter, audioFile, audioUrl]);

  const getDuration = (source: File | string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      let url: string | null = null;

      if (source instanceof File) {
        url = URL.createObjectURL(source);
        audio.src = url;
      } else {
        audio.src = source;
        audio.crossOrigin = 'anonymous';
      }

      audio.onloadedmetadata = () => {
        if (url) URL.revokeObjectURL(url);
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        resolve(duration);
      };
      audio.onerror = () => {
        if (url) URL.revokeObjectURL(url);
        resolve(0);
      };
    });
  };

  const uploadFile = async (file: File, type: 'audio' | 'emo_audio') => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      
      if (type === 'audio') {
        setAudioUrl(data.url);
        setAudioFile(file);
        
        const duration = await getDuration(file);
        setAudioDuration(duration);
        if (duration > audioLimitSeconds) {
          toast.error(audioLimitReminder);
        }
      } else if (type === 'emo_audio') {
        setEmoAudioUrl(data.url);
        setEmoAudioFile(file);
      }
    } catch (error) {
      toast.error(`Failed to upload ${type}`);
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'emo_audio') => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, type);
  };

  const handleAudioDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setAudioDragActive(true);
    } else if (e.type === "dragleave") {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setAudioDragActive(false);
    }
  };

  const handleEmoAudioDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setEmoAudioDragActive(true);
    } else if (e.type === "dragleave") {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setEmoAudioDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent, type: 'audio' | 'emo_audio') => {
    e.preventDefault();
    e.stopPropagation();
    
    if (type === 'audio') setAudioDragActive(false);
    if (type === 'emo_audio') setEmoAudioDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.type.startsWith('audio/')) {
        return toast.error('Please upload an audio file');
      }
      uploadFile(file, type);
    }
  };

  const handleAudioRemove = () => {
    setAudioUrl('');
    setAudioFile(null);
    setAudioDuration(0);
  };

  const handleEmoAudioRemove = () => {
    setEmoAudioUrl('');
    setEmoAudioFile(null);
  };

  const submitDigitalHumanJobs = async (scriptChunks?: string[]) => {
    const trimmedScriptChunks =
      mode === 'VOICE_CLONE'
        ? (scriptChunks ?? [script])
            .map((chunk) => (chunk ?? '').trim())
            .filter((chunk) => chunk.length > 0)
        : [null];

    if (mode === 'VOICE_CLONE' && trimmedScriptChunks.length === 0) {
      toast.error(scriptRequiredMessage || 'Please enter script');
      return;
    }

    const jobCount = trimmedScriptChunks.length;
    const isSplitFlow = jobCount > 1;
    const loadingMessage = isSplitFlow
      ? isZhLocale
        ? `正在提交 ${jobCount} 段数字人任务...`
        : `Submitting ${jobCount} split digital human jobs...`
      : t.contentCreation?.newTask?.digitalHuman?.submitting ??
        t.storyboard.generatingDigitalHumanVideo ??
        'Submitting digital human job...';
    const successMessage = isSplitFlow
      ? isZhLocale
        ? `已拆分并提交 ${jobCount} 段数字人任务，系统将依次生成。`
        : `Submitted ${jobCount} split digital human jobs.`
      : digitalCopy?.success ??
        t.contentCreation?.common?.success ??
        'Digital human task created';
    const failureMessage = isSplitFlow
      ? isZhLocale
        ? '拆分任务创建失败，请稍后重试。'
        : 'Failed to submit split jobs. Please try again.'
      : 'Failed to create task';

    const toastId = isSplitFlow ? toast.loading(loadingMessage) : undefined;
    setLoading(true);
    try {
      for (const chunk of trimmedScriptChunks) {
        const formData = new FormData();
        formData.append('type', mode);
        formData.append('imageUrl', imageUrl);
        formData.append('audioUrl', audioUrl);
        formData.append('duration', audioDuration.toString());
        if (userId) formData.append('userId', userId);
        if (sourceTaskId) formData.append('sourceTaskId', sourceTaskId);
        if (mode === 'VOICE_CLONE') {
          formData.append('script', chunk ?? '');
          if (emoAudioUrl) {
            formData.append('emoAudioUrl', emoAudioUrl);
          }
        }
        await createDigitalHumanVideo(formData);
      }

      if (toastId) {
        toast.success(successMessage, { id: toastId });
      } else {
        toast.success(successMessage);
      }

      if (onSuccess) {
        await onSuccess();
      }
      if (!disableAutoRedirect) {
        router.push(myProjectsPath);
      }
      onClose();
    } catch (error) {
      console.error(error);
      if (toastId) {
        toast.error(failureMessage, { id: toastId });
      } else {
        toast.error(failureMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedCharacter || !imageUrl) return toast.error(characterRequiredMessage);
    if (!audioUrl) return toast.error(audioRequiredMessage || 'Please upload audio');
    if (audioDuration > audioLimitSeconds && audioDuration > 0) {
      toast.error(audioLimitReminder);
      return;
    }

    if (mode === 'VOICE_CLONE') {
      const trimmedScript = script.trim();
      if (!trimmedScript) return toast.error(scriptRequiredMessage || 'Please enter script');

      if (scriptTooLong) {
        const limitChars =
          scriptStats.limitChars && scriptStats.limitChars > 0
            ? scriptStats.limitChars
            : Math.max(scriptStats.cleanedLength, 120);
        const chunks = splitScriptIntoChunks(trimmedScript, limitChars);
        if (chunks.length > 1) {
          setSplitChunks(chunks);
          setSplitMeta({
            limitChars,
            chunkSeconds: Math.max(1, Math.round(scriptStats.limitSeconds * scriptStats.safety)),
            limitSeconds: scriptStats.limitSeconds,
            estimatedSeconds: scriptStats.estimatedSeconds,
          });
          setIsSplitModalOpen(true);
          return;
        }
      }

      await submitDigitalHumanJobs([trimmedScript]);
      return;
    }

    await submitDigitalHumanJobs();
  };

  const closeSplitModal = () => {
    setIsSplitModalOpen(false);
    setSplitChunks([]);
    setSplitMeta(null);
  };

  const handleSplitConfirm = async () => {
    if (!splitChunks.length) {
      closeSplitModal();
      return;
    }
    const chunksToSubmit = [...splitChunks];
    closeSplitModal();
    await submitDigitalHumanJobs(chunksToSubmit);
  };

  const layoutClass = showAssistant
    ? isCompactLayout
      ? 'flex flex-col gap-6'
      : 'grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6'
    : 'flex flex-col gap-6';

  return (
    <>
    <div
      ref={containerRef}
      className={cn('relative h-full bg-white dark:bg-gray-900', layoutClass)}
    >
      {/* Left Content */}
      <div className="min-h-0 flex flex-col bg-white dark:bg-gray-900">
        {/* Header */}
        {!hideInternalTitle && (
          <div className="flex flex-col gap-4 p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <User className="text-black dark:text-white" />
                {digitalTitle}
              </h2>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 md:hidden">
                <X size={20} />
              </button>
            </div>
            {!headerPortalActive && !isCompactLayout && <ModeSwitcher fullWidth={false} />}
          </div>
        )}

        {(hideInternalTitle || isCompactLayout) && !headerPortalActive && (
          <div
            className={cn(
              "px-6 pb-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900",
              hideInternalTitle ? 'pt-4' : 'pt-0'
            )}
          >
            <ModeSwitcher fullWidth />
          </div>
        )}

        {/* Scrollable Content */}
        <div
          className={cn(
            'flex-1 p-6 space-y-6',
            isCompactLayout && 'overflow-y-auto'
          )}
        >
            {/* Character Library */}
            <div>
              <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {characterLabel}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t.characters.libraryHint}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {selectedCharacter && (
                    <button
                      type="button"
                      onClick={() => setSelectedCharacterId(null)}
                      className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                    >
                      {t.characters.clearSelection}
                    </button>
                  )}
                </div>
              </div>

              {charactersLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t.common.loading}</p>
              ) : characters.length === 0 ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span>{characterEmptyCopy}</span>
                  <button
                    type="button"
                    onClick={() => setIsCharacterModalOpen(true)}
                    className="text-primary hover:text-primary-hover font-medium"
                  >
                    {characterCreateLabel}
                  </button>
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                  <button
                    type="button"
                    onClick={() => setIsCharacterModalOpen(true)}
                    className="min-w-[180px] flex-shrink-0 border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center text-center text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-black/60 dark:hover:border-white/60 transition-colors"
                  >
                    <PlusCircle className="w-6 h-6 mb-2" />
                    {characterCreateLabel}
                  </button>
                  {characters.map((character) => {
                    const isSelected = character.id === selectedCharacterId;
                    return (
                      <button
                        type="button"
                        key={character.id}
                        onClick={() =>
                          setSelectedCharacterId((prev) =>
                            prev === character.id ? null : character.id
                          )
                        }
                        className={cn(
                          "min-w-[180px] flex-shrink-0 border-2 rounded-xl p-3 text-left transition-colors focus:outline-none",
                          isSelected
                            ? "border-black dark:border-white bg-black/5 dark:bg-white/10"
                            : "border-gray-200 dark:border-gray-700 hover:border-black/40 dark:hover:border-white/50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden border border-gray-200 dark:border-gray-700">
                            {character.avatar ? (
                              <img
                                src={character.avatar}
                                alt={character.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                                N/A
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {character.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {character.voiceId ? defaultVoiceLabel : audioPlaceholderCopy}
                            </p>
                            {mode === 'VOICE_CLONE' && !character.voiceId && characterMissingVoiceCopy && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                                {characterMissingVoiceCopy}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Audio Upload + Emotional Reference */}
            {shouldRenderAudioUploads && (
              <div
                className={cn(
                  'grid gap-6 items-start',
                  shouldSplitAudioUploads ? 'md:grid-cols-2' : 'grid-cols-1'
                )}
              >
                {shouldShowVoiceUpload && (
                  <div className="flex flex-col gap-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {audioLabelCopy}
                    </label>
                    <div>
                      <label
                        onDragEnter={handleAudioDrag}
                        onDragLeave={handleAudioDrag}
                        onDragOver={handleAudioDrag}
                        onDrop={(e) => handleDrop(e, 'audio')}
                        className={cn(
                          'relative flex w-full items-center gap-4 h-20 border-2 rounded-lg cursor-pointer transition-colors overflow-hidden px-4',
                          audioDragActive
                            ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-800 border-dashed'
                            : audioUrl
                              ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 border-solid'
                              : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 border-dashed',
                          !audioUrl && 'justify-center'
                        )}
                      >
                        {audioUrl ? (
                          <div className="flex items-center gap-4 w-full">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Mic className="w-5 h-5 text-gray-400 shrink-0" />
                              <span className="text-sm text-gray-900 dark:text-white truncate">
                                {audioFile ? audioFile.name : voicePlaceholder}
                              </span>
                            </div>
                            <audio
                              controls
                              src={audioUrl}
                              className="h-9 w-40 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1 text-center pointer-events-none text-gray-500 dark:text-gray-400">
                            <Mic className="w-5 h-5 text-gray-400" />
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                              {uploadHint}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {audioPlaceholderCopy}
                            </span>
                          </div>
                        )}
                        {audioDragActive && (
                          <div className="absolute inset-0 bg-black/5 flex items-center justify-center pointer-events-none">
                            <p className="text-black dark:text-white text-sm font-medium bg-white/80 dark:bg-black/80 px-2 py-1 rounded">
                              {t.storyboard.dropToReplace}
                            </p>
                          </div>
                        )}
                        <input
                          ref={audioInputRef}
                          type="file"
                          className="hidden"
                          onChange={(e) => handleUpload(e, 'audio')}
                          accept="audio/*"
                        />
                      </label>
                      {audioUrl && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
                          {audioDuration > 0 && (
                            <span>
                              {audioDurationLabel}: {Math.round(audioDuration)}s
                            </span>
                          )}
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => audioInputRef.current?.click()}
                              className="font-semibold underline"
                            >
                              {replaceAudioLabel}
                            </button>
                            <button
                              type="button"
                              onClick={handleAudioRemove}
                              className="font-semibold underline text-red-600 dark:text-red-400"
                            >
                              {removeAudioLabel}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {shouldShowEmoUpload && (
                  <div className="flex flex-col gap-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t.storyboard.emoRef}
                    </label>
                    <div>
                      <label
                        onDragEnter={handleEmoAudioDrag}
                        onDragLeave={handleEmoAudioDrag}
                        onDragOver={handleEmoAudioDrag}
                        onDrop={(e) => handleDrop(e, 'emo_audio')}
                        className={cn(
                          'relative flex w-full items-center gap-4 h-20 border-2 rounded-lg cursor-pointer transition-colors overflow-hidden px-4',
                          emoAudioDragActive
                            ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-800 border-dashed'
                            : emoAudioUrl
                              ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 border-solid'
                              : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 border-dashed',
                          !emoAudioUrl && 'justify-center'
                        )}
                      >
                        {emoAudioUrl ? (
                          <div className="flex items-center gap-4 w-full">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Mic className="w-5 h-5 text-gray-400 shrink-0" />
                              <span className="text-sm text-gray-900 dark:text-white truncate">
                                {emoAudioFile ? emoAudioFile.name : emoPlaceholder}
                              </span>
                            </div>
                            <audio
                              controls
                              src={emoAudioUrl}
                              className="h-9 w-40 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1 text-center pointer-events-none text-gray-500 dark:text-gray-400">
                            <Mic className="w-5 h-5 text-gray-400" />
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                              {uploadHint}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {emoPlaceholder}
                            </span>
                          </div>
                        )}
                        {emoAudioDragActive && (
                          <div className="absolute inset-0 bg-black/5 flex items-center justify-center pointer-events-none">
                            <p className="text-black dark:text-white text-sm font-medium bg-white/80 dark:bg-black/80 px-2 py-1 rounded">
                              {t.storyboard.dropToReplace}
                            </p>
                          </div>
                        )}
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => handleUpload(e, 'emo_audio')}
                          accept="audio/*"
                        />
                      </label>
                      {emoAudioUrl && (
                        <div className="mt-2 flex flex-wrap items-center justify-end gap-3 text-xs text-gray-600 dark:text-gray-300">
                          <button
                            type="button"
                            onClick={handleEmoAudioRemove}
                            className="font-semibold underline text-red-600 dark:text-red-400"
                          >
                            {removeAudioLabel}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {audioTooLong && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{audioLimitReminder}</p>
                )}
              </div>
            )}

            {/* Script (Voice Clone Only) */}
            {mode === 'VOICE_CLONE' && (
            <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {scriptLabel}
                </label>
                <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={scriptPlaceholder}
                className="w-full h-32 p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary outline-none resize-none"
                />
                {scriptHasContent && (
                  <p
                    className={cn(
                      "mt-2 text-xs",
                      scriptTooLong
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-gray-500 dark:text-gray-400"
                    )}
                  >
                    {scriptMessage}
                  </p>
                )}
                {scriptTooLong && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {isZhLocale
                      ? '系统会沿用当前角色与音色，拆成多段依次生成。'
                      : 'We will reuse the selected character and voice, auto-splitting into multiple jobs.'}
                  </p>
                )}
            </div>
            )}
        </div>

        {/* Footer */}
      <div className="px-6 pt-6 border-t dark:border-gray-700">
        <button
          onClick={handleSubmit}
          disabled={loading || uploading || audioTooLong}
          className="btn-openclaw w-full py-3 font-bold flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Check size={20} />}
          {loading ? generatingLabel : submitLabel}
        </button>
      </div>
      </div>

      {/* Right Panel */}
      {showAssistant && (
        <aside
          className={cn(
            'flex flex-col gap-6',
            isCompactLayout
              ? 'mt-0'
              : 'sticky top-0 min-h-0 max-h-[calc(88vh-4rem)] overflow-y-auto'
          )}
        >
          <div className="bg-gray-50 dark:bg-gray-800/70 p-6 rounded-2xl border border-gray-200/70 dark:border-gray-800/70 text-gray-800 dark:text-gray-100">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Info size={18} className="text-gray-600 dark:text-gray-200" />
              {t.storyboard.guide}
            </h3>
            
            <div className="space-y-6 text-gray-600 dark:text-gray-300">
              <div>
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <Mic size={14} /> {lipModeCopy?.label ?? t.storyboard.lipSync}
                </h4>
                <p className="text-xs leading-relaxed">
                  {lipModeCopy?.description ?? t.storyboard.lipSyncDesc}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <User size={14} /> {voiceModeCopy?.label ?? t.storyboard.voiceClone}
                </h4>
                <p className="text-xs leading-relaxed">
                  {voiceModeCopy?.description ?? t.storyboard.voiceCloneDesc}
                </p>
              </div>

              <div className="bg-white/80 dark:bg-gray-900/60 p-3 rounded-lg border border-gray-200/70 dark:border-gray-700/60 space-y-2 text-gray-700 dark:text-gray-200">
                <p className="text-xs font-medium">
                  {stickyNote}
                </p>
                <p className="text-xs font-medium">
                  {t.storyboard.highQualityNote}
                </p>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
    <Modal
      isOpen={isSplitModalOpen}
      onClose={closeSplitModal}
      title={isZhLocale ? '字数超限，拆分生成？' : 'Script Too Long'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5 text-sm text-gray-700 dark:text-gray-200">
        <p>
          {isZhLocale
            ? `当前文案预计 ${numberFormatter.format(splitModalHints.estimatedSeconds || 0)}s，超过单次上限 ${numberFormatter.format(splitModalHints.limitSeconds || DIGITAL_HUMAN_MAX_SECONDS)}s。系统将拆分成 ${splitChunks.length} 段，每段建议 ≤ ${numberFormatter.format(splitModalHints.chunkSeconds)}s（≈${numberFormatter.format(splitModalHints.limitChars || 0)} 字）。`
            : `This script is about ${numberFormatter.format(splitModalHints.estimatedSeconds || 0)}s, above the ${numberFormatter.format(splitModalHints.limitSeconds || DIGITAL_HUMAN_MAX_SECONDS)}s limit. We'll split it into ${splitChunks.length} chunks (~${numberFormatter.format(splitModalHints.chunkSeconds)}s / ${numberFormatter.format(splitModalHints.limitChars || 0)} chars each).`}
        </p>
        {splitChunkSummary.length > 0 && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 p-3 space-y-2 max-h-60 overflow-y-auto">
            {splitChunkSummary.map((segment) => (
              <div key={segment.index} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
                <span className="font-semibold text-gray-900 dark:text-white">#{segment.index}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {numberFormatter.format(segment.length)} {isZhLocale ? '字' : 'chars'}
                </span>
                <span className="flex-1 truncate text-gray-700 dark:text-gray-100">{segment.preview}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isZhLocale
            ? '点击继续后会沿用当前角色与音色，逐段提交任务。'
            : 'We will reuse the selected character and voice for every chunk.'}
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={closeSplitModal}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-200 bg-white/90 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {isZhLocale ? '返回修改' : 'Edit Script'}
          </button>
          <button
            onClick={handleSplitConfirm}
            className="btn-openclaw inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
          >
            {isZhLocale ? '拆分并继续' : 'Split & Continue'}
          </button>
        </div>
      </div>
    </Modal>
    <Modal
      isOpen={isCharacterModalOpen}
      onClose={() => setIsCharacterModalOpen(false)}
      title={t.characters.formTitle}
      maxWidth="max-w-xl"
    >
      <CharacterForm onSuccess={handleCharacterModalSuccess} key={Number(isCharacterModalOpen)} />
    </Modal>
    </>
  );
}
