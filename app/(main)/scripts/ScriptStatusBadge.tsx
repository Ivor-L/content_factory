'use client';

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/lib/supabaseClient";

interface ScriptStatusBadgeProps {
  status: string;
  progress: number;
  scriptId: string;
  error?: string;
  compact?: boolean;
}

export function ScriptStatusBadge({ status: initialStatus, progress: initialProgress, scriptId, error: initialError, compact = false }: ScriptStatusBadgeProps) {
  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(initialProgress);
  const [error, setError] = useState(initialError);
  const router = useRouter();
  const finalRefreshedRef = useRef(false);
  const { t } = useLanguage();
  const statusBadgeCopy = t?.scripts?.statusBadge;

  // Subscribe to Realtime updates for this script
  useEffect(() => {
    const initial = (initialStatus || "").toLowerCase();
    if (initial === 'completed' || initial === 'failed') {
      return;
    }

    const channel = supabase
      .channel(`script-badge-${scriptId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scripts", filter: `id=eq.${scriptId}` },
        (payload) => {
          const data = payload.new as { status: string; progress?: number; error?: string };
          setStatus(data.status);
          if (data.progress !== undefined) setProgress(data.progress);
          if (data.error) setError(data.error);
          const nextStatus = (data.status || "").toLowerCase();
          if ((nextStatus === 'completed' || nextStatus === 'failed') && !finalRefreshedRef.current) {
            finalRefreshedRef.current = true;
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [scriptId, router, initialStatus]);

  if (status === 'completed') return null;

  const defaultStatusLabels: Record<string, string> = {
    queued: "Queued",
    extracting: "Extracting",
    downloading: "Downloading",
    analyzing: "Analyzing",
    parsing: "Parsing",
    failed: "Failed",
    processing: "Processing",
  };

  const getStatusLabel = (s: string) => {
    const normalized = (s || "").toLowerCase();
    const localizedStatuses = statusBadgeCopy?.statuses as Record<string, string> | undefined;
    const localized = normalized && localizedStatuses ? localizedStatuses[normalized] : undefined;

    if (localized) return localized;
    return defaultStatusLabels[normalized] ?? localizedStatuses?.processing ?? defaultStatusLabels.processing;
  };

  // Calculate a visual progress if backend progress is 0 but state advanced
  const displayProgress = progress > 0 ? progress : (
    status === 'queued' ? 5 :
    status === 'extracting' ? 15 :
    status === 'downloading' ? 30 :
    status === 'analyzing' ? 60 :
    status === 'parsing' ? 90 : 0
  );

  const normalizedProgress = Math.min(100, Math.max(0, Math.round(displayProgress)));
  const fillWidth = normalizedProgress <= 2 ? 2 : normalizedProgress;
  const statusLabel = getStatusLabel(status).toUpperCase();
  const isFailed = status === 'failed';

  const overlayRadiusStyle = { borderRadius: 'inherit' as const };

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 overflow-hidden pointer-events-none transition-all duration-700",
        compact ? "shadow-[0_20px_45px_rgba(0,0,0,0.65)]" : "shadow-[0_35px_90px_rgba(0,0,0,0.55)]"
      )}
      style={overlayRadiusStyle}
    >
      <div
        className={cn(
          "absolute inset-0 backdrop-blur-[1.5px]",
          isFailed
            ? "bg-gradient-to-b from-red-900/50 via-black/80 to-black/90"
            : "bg-gradient-to-b from-black/30 via-black/70 to-black/90"
        )}
        style={overlayRadiusStyle}
      />
      <div
        className={cn(
          "absolute inset-[-25%] blur-3xl opacity-60",
          isFailed ? "bg-[radial-gradient(circle,_rgba(255,75,75,0.4),_transparent_55%)]" : "bg-[radial-gradient(circle,_rgba(255,255,255,0.35),_transparent_55%)]"
        )}
      />
      <div
        className="absolute inset-0 border border-white/15 opacity-50 mix-blend-screen"
        style={overlayRadiusStyle}
      />
      <div
        className="absolute inset-0 shadow-[inset_0_0_40px_rgba(255,255,255,0.05)]"
        style={overlayRadiusStyle}
      />

      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center text-white drop-shadow-[0_5px_25px_rgba(0,0,0,0.8)]">
        {isFailed ? (
          <div className="flex flex-col items-center gap-3 text-red-100">
            <div className="text-4xl">⚠️</div>
            <span className="text-xs font-semibold tracking-[0.35em] text-red-100/90">{statusLabel}</span>
            {error && (
              <span className="max-w-[220px] rounded-full bg-red-950/70 px-3 py-1 text-[11px] font-medium tracking-wide text-red-50">
                {error}
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="relative flex h-14 w-14 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-white/15 blur-lg animate-pulse" />
              <div className="h-full w-full rounded-full border-2 border-white/20" />
              <div className="absolute inset-0 rounded-full border-t-2 border-white animate-spin" />
            </div>

            <span className="text-lg font-semibold uppercase tracking-[0.28em] text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
              {statusLabel}
            </span>
            <p className="text-[9px] uppercase tracking-[0.32em] text-white/70">
              {compact ? (statusBadgeCopy?.compactLabel ?? 'Script Status') : (statusBadgeCopy?.defaultLabel ?? 'Processing')}
            </p>

            <div className="mt-1 w-full max-w-[220px]">
              <div className="relative h-[6px] rounded-full bg-white/15 shadow-[inset_0_1px_4px_rgba(0,0,0,0.45)]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-white/30 via-white to-white/80 transition-all duration-700 ease-out"
                  style={{ width: `${fillWidth}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.85)] transition-all duration-700"
                  style={{ left: `${Math.min(98, Math.max(2, normalizedProgress))}%` }}
                />
              </div>
              <div className="mt-2 text-xs font-mono tracking-[0.3em] text-white/90">
                {normalizedProgress}%
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
