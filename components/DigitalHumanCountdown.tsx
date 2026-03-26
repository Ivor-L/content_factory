"use client";

import { useMemo } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountdown } from "@/hooks/useCountdown";

const DEFAULT_DURATION_MS = 30 * 60 * 1000;

type Variant = "light" | "dark";

interface DigitalHumanCountdownProps {
  startTime: string | number | Date | null;
  durationMs?: number;
  variant?: Variant;
  className?: string;
  runningText?: (formatted: string) => string;
  expiredText?: string;
}

const variantClassName: Record<Variant, string> = {
  light: "bg-purple-50/70 text-purple-800 border-purple-100",
  dark: "bg-black/40 text-white border-white/20 backdrop-blur",
};

export function DigitalHumanCountdown({
  startTime,
  durationMs = DEFAULT_DURATION_MS,
  variant = "light",
  className,
  runningText,
  expiredText = "等待结果回传...",
}: DigitalHumanCountdownProps) {
  const startTimestamp = useMemo(() => {
    if (startTime == null) return null;
    if (typeof startTime === "number") {
      return Number.isFinite(startTime) ? startTime : null;
    }
    if (startTime instanceof Date) {
      return startTime.getTime();
    }
    const parsed = new Date(startTime);
    const timestamp = parsed.getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }, [startTime]);

  const targetTimestamp = useMemo(
    () => (startTimestamp ? startTimestamp + durationMs : null),
    [durationMs, startTimestamp]
  );

  const { formatted, isExpired, targetTimestamp: resolvedTarget } = useCountdown(targetTimestamp);

  if (!resolvedTarget) return null;

  const content = isExpired ? (expiredText ?? "") : runningText ? runningText(formatted) : formatted;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold text-current",
        variantClassName[variant],
        className
      )}
    >
      <Timer className="h-3.5 w-3.5" />
      <span className={cn("leading-none", !isExpired && !runningText && "font-mono tabular-nums text-sm")}>
        {content}
      </span>
    </div>
  );
}
