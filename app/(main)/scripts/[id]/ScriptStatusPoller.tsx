"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface ScriptStatusPollerProps {
  scriptId: string;
  initialStatus: string;
  initialProgress?: number;
}

export default function ScriptStatusPoller({ scriptId, initialStatus, initialProgress = 0 }: ScriptStatusPollerProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(initialProgress);

  useEffect(() => {
    if (status === "completed" || status === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scripts/${scriptId}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.status !== status) {
            setStatus(data.status);
          }
          if (data.progress !== undefined && data.progress !== progress) {
            setProgress(data.progress);
          }
          
          if (data.status === "completed" || data.status === "failed") {
            router.refresh();
          }
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [scriptId, status, progress, router]);

  if (status === "completed") {
    return null;
  }

  const getStatusText = (s: string) => {
    switch (s) {
      case "queued": return "Waiting in queue...";
      case "extracting": return "Extracting audio/video...";
      case "downloading": return "Downloading video...";
      case "analyzing": return "Analyzing content (this may take a minute)...";
      case "parsing": return "Parsing results...";
      case "failed": return "Analysis failed.";
      default: return "Processing...";
    }
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
    <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-500">
      <div className="animate-pulse flex flex-col items-center w-full max-w-md px-4">
        {status === "failed" ? (
             <span className="text-4xl mb-4">❌</span>
        ) : (
            <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-4" />
        )}
        <p className="font-medium text-lg text-gray-700">{getStatusText(status)}</p>
        
        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4 mb-2">
          <div 
            className={`bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out ${status === 'failed' ? 'bg-red-500' : ''}`} 
            style={{ width: `${currentProgress}%` }}
          ></div>
        </div>
        <p className="text-sm opacity-70 flex justify-between w-full">
            <span>AI is processing your video script.</span>
            <span>{currentProgress}%</span>
        </p>
      </div>
    </div>
  );
}
