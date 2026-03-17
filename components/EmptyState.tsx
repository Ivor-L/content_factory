'use client';

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AddButton } from "@/components/AddButton";

type EmptyStateAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
};

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
  innerClassName?: string;
  fullHeight?: boolean;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  innerClassName,
  fullHeight = false,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex items-center justify-center text-center",
        compact ? "px-6 py-10" : "px-8 py-16",
        fullHeight && !compact && "min-h-[320px]",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-sm flex-col items-center",
          compact ? "gap-3" : "gap-4",
          innerClassName
        )}
      >
        {icon && (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
            {icon}
          </div>
        )}
        <div className="space-y-2">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{title}</p>
          {description && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
        {action && action.label && (
          <AddButton
            label={action.label}
            href={action.href}
            onClick={action.onClick}
            icon={action.icon}
            loading={action.loading}
            disabled={action.disabled}
          />
        )}
      </div>
    </div>
  );
}
