'use client';

import { useEffect, useRef, useState, useCallback, useMemo, useContext, createContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalHeaderContextValue {
  setContent: (node: ReactNode | null) => void;
}

const ModalHeaderContext = createContext<ModalHeaderContextValue | null>(null);

export function useModalHeader() {
  return useContext(ModalHeaderContext);
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  zIndex?: string;
}

export function Modal({ isOpen, onClose, title, children, maxWidth = "max-w-2xl", zIndex = "z-50" }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [headerContent, setHeaderContent] = useState<ReactNode | null>(null);

  const setHeaderPortalContent = useCallback((node: ReactNode | null) => {
    setHeaderContent(node);
  }, []);

  const headerContextValue = useMemo<ModalHeaderContextValue>(() => ({
    setContent: setHeaderPortalContent,
  }), [setHeaderPortalContent]);

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

  const headerHasContent = Boolean(headerContent);

  return createPortal(
    <ModalHeaderContext.Provider value={headerContextValue}>
      <div className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4 bg-[var(--tenant-primary)]/30 backdrop-blur-xl`}>
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
        <div
          className={`sticky top-0 z-10 px-6 py-4 bg-white/90 dark:bg-gray-900/80 border-b border-[var(--tenant-primary-muted)] shrink-0 backdrop-blur ${
            headerHasContent ? 'grid gap-3 grid-cols-1 md:grid-cols-[auto_1fr_auto]' : 'flex items-center justify-between'
          }`}
        >
          <div className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-4">
            {title}
          </div>
          {headerHasContent && (
            <div className="flex justify-center">
              <div className="w-full max-w-xl">{headerContent}</div>
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-[var(--tenant-primary-foreground)] rounded-full hover:bg-[var(--tenant-primary-muted)] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="p-6 text-gray-900 dark:text-gray-100 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </div>
    </ModalHeaderContext.Provider>,
    document.body
  );
}
