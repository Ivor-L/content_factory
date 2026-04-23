'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'outline';
type Size = 'default' | 'sm';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
};

export function Button({
  variant = 'default',
  size = 'default',
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center rounded-md border font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
  const variantClass =
    variant === 'outline'
      ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
      : 'border-transparent bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200';
  const sizeClass = size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm';

  return (
    <button
      type={type}
      className={`${base} ${variantClass} ${sizeClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
