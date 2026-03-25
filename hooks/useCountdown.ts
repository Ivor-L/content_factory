"use client";

import { useEffect, useMemo, useState } from "react";

type CountdownInput = number | Date | string | null | undefined;

export interface UseCountdownOptions {
  intervalMs?: number;
}

export interface UseCountdownResult {
  targetTimestamp: number | null;
  remainingMs: number;
  seconds: number;
  minutes: number;
  hours: number;
  formatted: string;
  isExpired: boolean;
}

const DEFAULT_INTERVAL = 1000;

export function useCountdown(targetTime: CountdownInput, options?: UseCountdownOptions): UseCountdownResult {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL;
  const targetTimestamp = useMemo(() => {
    if (targetTime == null) return null;
    if (typeof targetTime === "number") {
      return Number.isFinite(targetTime) ? targetTime : null;
    }
    if (targetTime instanceof Date) {
      return targetTime.getTime();
    }
    const parsed = new Date(targetTime);
    const timestamp = parsed.getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }, [targetTime]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetTimestamp) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, targetTimestamp]);

  const remainingMs = targetTimestamp ? Math.max(targetTimestamp - now, 0) : 0;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const formatted = [hours, minutes, seconds]
    .filter((_, index) => index === 0 ? hours > 0 : true)
    .map((unit) => String(unit).padStart(2, "0"))
    .join(":");

  return {
    targetTimestamp,
    remainingMs,
    seconds,
    minutes,
    hours,
    formatted: formatted || "00:00",
    isExpired: targetTimestamp ? now >= targetTimestamp : true,
  };
}
