'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, children, maxWidth = "max-w-2xl" }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!mounted) return null;
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--tenant-primary)]/30 backdrop-blur-xl">
      <div
        ref={modalRef}
        className={`bg-white/95 dark:bg-gray-900 rounded-2xl w-full ${maxWidth} max-h-[88vh] overflow-y-auto transform transition-all border border-[var(--tenant-primary-muted)] relative flex flex-col shadow-theme-glow ${
          isActive ? "shadow-2xl" : "shadow-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={() => setIsActive(true)}
        onPointerUp={() => setIsActive(false)}
        onPointerLeave={() => setIsActive(false)}
        tabIndex={-1}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/90 dark:bg-gray-900/80 border-b border-[var(--tenant-primary-muted)] shrink-0 backdrop-blur">
          <div className="text-xl font-bold text-gray-900 dark:text-white flex-1 flex items-center gap-4">{title}</div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-[var(--tenant-primary-foreground)] rounded-full hover:bg-[var(--tenant-primary-muted)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 text-gray-900 dark:text-gray-100 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
