'use client';

import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AddButtonProps {
  label: ReactNode;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

const baseClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-theme-glow transition-all hover:-translate-y-0.5 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 disabled:pointer-events-none disabled:opacity-60 dark:bg-primary dark:hover:bg-primary-hover";

export function AddButton({
  label,
  href,
  onClick,
  icon,
  loading = false,
  disabled = false,
  className,
}: AddButtonProps) {
  const renderIcon = loading ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
  ) : (
    icon ?? <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
  );

  const content = (
    <>
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/60 bg-white/10 text-primary dark:border-black/20 dark:bg-black/10 dark:text-primary">
        {renderIcon}
      </span>
      <span>{label}</span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(baseClass, className, (disabled || loading) && "pointer-events-none opacity-60")}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(baseClass, className)}
    >
      {content}
    </button>
  );
}
