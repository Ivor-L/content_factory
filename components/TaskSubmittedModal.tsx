'use client';

import { CheckCircle2, Eye, RotateCcw } from 'lucide-react';
import { Modal } from './Modal';

interface TaskSubmittedModalProps {
  isOpen: boolean;
  onContinue: () => void;
  onView: () => void;
  title?: string;
  message?: string;
  continueText?: string;
  viewText?: string;
}

export function TaskSubmittedModal({
  isOpen,
  onContinue,
  onView,
  title = '任务已提交',
  message = '任务已进入异步队列，生成完成后会同步到我的作品。',
  continueText = '继续',
  viewText = '查看',
}: TaskSubmittedModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onContinue}
      title={<span className="text-base font-semibold">{title}</span>}
      maxWidth="max-w-md"
      zIndex="z-[80]"
    >
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[var(--tenant-primary-soft,#d1fae5)] text-[var(--tenant-primary-strong,#14532d)] dark:bg-[var(--tenant-primary,#16a34a)]/20 dark:text-[var(--tenant-primary-foreground,#fefce8)]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">已提交任务</p>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{message}</p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--tenant-primary-ring,#16a34a)]/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RotateCcw className="h-4 w-4" />
            {continueText}
          </button>
          <button
            type="button"
            onClick={onView}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--tenant-primary,#16a34a)] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--tenant-primary,#16a34a)]/90 focus:outline-none focus:ring-2 focus:ring-[var(--tenant-primary-ring,#16a34a)]/35"
          >
            <Eye className="h-4 w-4" />
            {viewText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
