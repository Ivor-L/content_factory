'use client';

import type { TaskStatus } from '@/types/xhs-text2image';
import { Loader2, RefreshCw } from 'lucide-react';
import { mapTaskErrorMessage } from '../utils/errorMapping';

interface TaskStatusPanelProps {
  taskId?: string | null;
  status?: TaskStatus | null;
  progress?: number | null;
  isPolling: boolean;
  rawError?: string | null;
  onRefresh?: () => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  PROCESSING: '生成中',
  COMPLETED: '已完成',
  FAILED: '失败',
};

export function TaskStatusPanel({
  taskId,
  status,
  progress,
  isPolling,
  rawError,
  onRefresh,
}: TaskStatusPanelProps) {
  if (!taskId) return null;
  const normalizedProgress = typeof progress === 'number' ? Math.min(Math.max(progress, 0), 100) : 0;
  const friendlyError = rawError ? mapTaskErrorMessage(rawError) : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">任务 ID</p>
          <p className="font-medium text-gray-900">{taskId}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
              status === 'COMPLETED'
                ? 'bg-emerald-50 text-emerald-700'
                : status === 'FAILED'
                ? 'bg-red-50 text-red-600'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            {status ? STATUS_LABELS[status] : '等待中'}
          </span>
          {isPolling && <Loader2 className="h-4 w-4 animate-spin text-amber-500" />}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-600 hover:border-gray-300"
            >
              <RefreshCw className="h-4 w-4" /> 刷新
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>进度</span>
          <span>{normalizedProgress}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${status === 'FAILED' ? 'bg-red-400' : 'bg-gradient-to-r from-amber-400 to-orange-500'}`}
            style={{ width: `${normalizedProgress}%` }}
          />
        </div>
      </div>

      {friendlyError && (
        <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {friendlyError}
        </div>
      )}
    </div>
  );
}
