'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreativeTaskRecord, TaskStatus } from '@/types/xhs-text2image';
import { fetchCreativeTaskRecord } from '../api/text2imageClient';
import { supabase } from '@/lib/supabaseClient';

type Fetcher = (taskId: string) => Promise<CreativeTaskRecord | null>;
type StopCondition = (record: CreativeTaskRecord | null) => boolean;

const FINAL_STATUSES: TaskStatus[] = ['COMPLETED', 'FAILED'];

interface Options {
  enabled?: boolean;
  intervalMs?: number;
  fetcher?: Fetcher;
  stopCondition?: StopCondition;
}

const defaultStopCondition: StopCondition = (record) => {
  if (!record?.status) return false;
  return FINAL_STATUSES.includes(record.status);
};

export function useCreativeTaskPolling(taskId: string | null, options?: Options) {
  const {
    enabled = true,
    fetcher = fetchCreativeTaskRecord,
    stopCondition = defaultStopCondition,
  } = options ?? {};
  const [record, setRecord] = useState<CreativeTaskRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const stoppedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!taskId) return null;
    try {
      const next = await fetcher(taskId);
      setRecord(next);
      setError(null);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : '任务状态查询失败';
      setError(message);
      return null;
    }
  }, [fetcher, taskId]);

  useEffect(() => {
    if (!taskId || !enabled) {
      setIsPolling(false);
      return;
    }

    stoppedRef.current = false;
    setIsPolling(true);

    // Fetch once immediately
    void refresh().then((result) => {
      if (defaultStopCondition(result)) {
        stoppedRef.current = true;
        setIsPolling(false);
      }
    });

    const channel = supabase
      .channel(`creative-task-${taskId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'creative_tasks', filter: `id=eq.${taskId}` },
        (payload) => {
          const updated = payload.new as CreativeTaskRecord;
          setRecord(updated);
          setError(null);
          if (stopCondition(updated)) {
            stoppedRef.current = true;
            setIsPolling(false);
          }
        }
      )
      .subscribe();

    return () => {
      stoppedRef.current = true;
      setIsPolling(false);
      supabase.removeChannel(channel);
    };
  }, [enabled, taskId, refresh, stopCondition]);

  return { record, error, isPolling, refresh };
}
