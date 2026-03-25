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
  ariaLabel?: string;
  labelClassName?: string;
  hideLabelOnMobile?: boolean;
}

const baseClass =
  'btn-openclaw inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-gray-900 transition-all hover:-translate-y-0.5 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60';

export function AddButton({
  label,
  href,
  onClick,
  icon,
  loading = false,
  disabled = false,
  className,
  ariaLabel,
  labelClassName,
  hideLabelOnMobile = false,
}: AddButtonProps) {
  const renderIcon = loading
    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-900" />
    : icon ?? <Plus className="h-3.5 w-3.5 text-gray-900" strokeWidth={2.5} />;

  const computedAriaLabel =
    hideLabelOnMobile ? ariaLabel ?? (typeof label === "string" ? label : undefined) : ariaLabel;

  const content = (
    <>
      <span className="flex h-6 w-6 items-center justify-center text-gray-900">{renderIcon}</span>
      <span className={cn(hideLabelOnMobile && "hidden sm:inline", labelClassName)}>{label}</span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(baseClass, className, (disabled || loading) && "pointer-events-none opacity-60")}
        aria-label={computedAriaLabel}
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
      aria-label={computedAriaLabel}
    >
      {content}
    </button>
  );
}
