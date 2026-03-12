'use client';

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

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

  // If active, poll for updates
  useEffect(() => {
    if (status === 'completed' || status === 'failed') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scripts/${scriptId}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.status !== status || data.progress !== progress) {
            setStatus(data.status);
            setProgress(data.progress || 0);
            if (data.error) setError(data.error);
            
            if (data.status === 'completed') {
                router.refresh(); // Refresh list to remove mask
            }
          }
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 5000); // Poll every 5s for list view

    return () => clearInterval(interval);
  }, [scriptId, status, progress, router]);

  if (status === 'completed') return null;

  const getStatusLabel = (s: string) => {
    switch (s) {
      case 'queued': return 'Queued';
      case 'extracting': return 'Extracting';
      case 'downloading': return 'Downloading';
      case 'analyzing': return 'Analyzing';
      case 'parsing': return 'Parsing';
      case 'failed': return 'Failed';
      default: return 'Processing';
    }
  };

  // Calculate a visual progress if backend progress is 0 but state advanced
  const displayProgress = progress > 0 ? progress : (
    status === 'queued' ? 5 :
    status === 'extracting' ? 15 :
    status === 'downloading' ? 30 :
    status === 'analyzing' ? 60 :
    status === 'parsing' ? 90 : 0
  );

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex flex-col items-center justify-center text-center transition-all duration-500 pointer-events-none",
        compact
          ? "bg-gradient-to-b from-black/80 via-black/60 to-transparent text-white p-3"
          : "bg-black/60 backdrop-blur-[2px] text-white p-4"
      )}
    >
      {status === 'failed' ? (
        <div className="text-red-400 font-bold flex flex-col items-center max-w-full">
            <span className="text-2xl mb-2">❌</span>
            <span className="uppercase tracking-wide">{getStatusLabel(status)}</span>
            {error && (
                <span className="text-xs text-red-200 mt-2 bg-red-900/50 px-2 py-1 rounded max-w-[90%] truncate" title={error}>
                    {error}
                </span>
            )}
        </div>
      ) : (
        <>
            <Loader2 className="w-6 h-6 text-white animate-spin mb-2" />
            <span className="font-bold text-sm tracking-wide uppercase">{getStatusLabel(status)}</span>
            <div className="w-full max-w-[70%] bg-white/20 rounded-full h-1 mt-2 overflow-hidden">
                <div 
                    className="bg-white h-full rounded-full transition-all duration-700 ease-out" 
                    style={{ width: `${displayProgress}%` }}
                />
            </div>
            <span className="text-white/80 text-[10px] mt-1 font-mono">{displayProgress}%</span>
        </>
      )}
    </div>
  );
}
