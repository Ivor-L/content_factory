"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/lib/supabaseClient";

interface ScriptStatusPollerProps {
  scriptId: string;
  initialStatus: string;
  initialProgress?: number;
}

export default function ScriptStatusPoller({ scriptId, initialStatus, initialProgress = 0 }: ScriptStatusPollerProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(initialProgress);
  const finalRefreshedRef = useRef(false);

  useEffect(() => {
    const initial = (initialStatus || "").toLowerCase();
    if (initial === "completed" || initial === "failed") return;

    const channel = supabase
      .channel(`script-${scriptId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scripts", filter: `id=eq.${scriptId}` },
        (payload) => {
          const data = payload.new as { status: string; progress?: number };
          setStatus(data.status);
          if (data.progress !== undefined) setProgress(data.progress);
          const nextStatus = (data.status || "").toLowerCase();
          if ((nextStatus === "completed" || nextStatus === "failed") && !finalRefreshedRef.current) {
            finalRefreshedRef.current = true;
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [scriptId, router, initialStatus]);

  if (status === "completed") {
    return null;
  }

  const statusMessages = t.scripts?.statusMessages || {};
  const getStatusText = (s: string) => {
    return statusMessages[s as keyof typeof statusMessages] || statusMessages.processing || "Processing...";
  };
  
  // Calculate progress bar width based on status if progress is not provided by backend
  const getEstimatedProgress = () => {
    if (progress > 0) return progress;
    
    switch (status) {
      case "queued": return 5;
      case "extracting": return 15;
      case "downloading": return 30;
      case "analyzing": return 60;
      case "parsing": return 90;
      case "failed": return 100;
      case "completed": return 100;
      default: return 10;
    }
  };
  
  const currentProgress = getEstimatedProgress();

  return (
    <div className="w-full h-full flex items-center justify-center py-16 px-6">
      <div className="relative w-full max-w-md">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/70 via-white/50 to-white/20 dark:from-gray-900/80 dark:via-gray-900/60 dark:to-gray-900/30 blur-xl"></div>
        <div className="relative rounded-3xl border border-white/80 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70 backdrop-blur-xl shadow-2xl px-8 py-10 flex flex-col items-center gap-6 text-center">
          <div className={`w-16 h-16 rounded-2xl border ${status === 'failed' ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'} flex items-center justify-center`}>
            {status === "failed" ? (
              <span className="text-2xl">❌</span>
            ) : (
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            )}
          </div>

          <div className="space-y-2">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{getStatusText(status)}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{statusMessages.progressNote || "AI is processing your video script."}</p>
          </div>

          <div className="w-full text-left space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <span>{statusMessages.progressLabel || "Progress"}</span>
              <span>{currentProgress}%</span>
            </div>
            <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 ease-out",
                  status === "failed"
                    ? "bg-gradient-to-r from-red-400 to-red-600"
                    : "bg-gradient-to-r from-primary via-primary-active to-primary"
                )}
                style={{ width: `${currentProgress}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">
            {statusMessages.ctaLocked || "Please wait for the analysis to complete before launching a clone task."}
          </p>
        </div>
      </div>
    </div>
  );
}
