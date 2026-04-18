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

type Listener = (now: number) => void;
type TickerEntry = {
  listeners: Set<Listener>;
  timerId: number | null;
};

const tickerRegistry = new Map<number, TickerEntry>();

function subscribeTicker(intervalMs: number, listener: Listener): () => void {
  let entry = tickerRegistry.get(intervalMs);
  if (!entry) {
    entry = {
      listeners: new Set(),
      timerId: null,
    };
    tickerRegistry.set(intervalMs, entry);
  }

  entry.listeners.add(listener);

  if (entry.timerId == null && typeof window !== "undefined") {
    entry.timerId = window.setInterval(() => {
      const now = Date.now();
      entry?.listeners.forEach((notify) => notify(now));
    }, intervalMs);
  }

  return () => {
    const current = tickerRegistry.get(intervalMs);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      if (current.timerId != null) {
        window.clearInterval(current.timerId);
      }
      tickerRegistry.delete(intervalMs);
    }
  };
}

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
    const unsubscribe = subscribeTicker(intervalMs, setNow);
    return () => unsubscribe();
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
