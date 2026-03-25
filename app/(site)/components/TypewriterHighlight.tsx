'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface TypewriterHighlightProps {
  tokens: string[];
  className?: string;
  caretClassName?: string;
  typingDelay?: number;
  holdDelay?: number;
  ariaLabel?: string;
  color?: string;
  caretColor?: string;
}

const DEFAULT_TYPING_DELAY = 80;
const DEFAULT_HOLD_DELAY = 1400;
export function TypewriterHighlight({
  tokens,
  className,
  caretClassName,
  typingDelay = DEFAULT_TYPING_DELAY,
  holdDelay = DEFAULT_HOLD_DELAY,
  ariaLabel,
  color,
  caretColor,
}: TypewriterHighlightProps) {
  const [typedIndex, setTypedIndex] = useState(0);
  const [typedText, setTypedText] = useState('');

  const tokensKey = useMemo(() => tokens.join('|'), [tokens]);
  const totalTokens = tokens.length || 1;
  const currentToken = tokens[typedIndex % totalTokens] ?? tokens[0] ?? '';
  const highlightStyle: CSSProperties | undefined = color ? { color } : undefined;
  const caretStyle: CSSProperties | undefined =
    caretColor || color ? { backgroundColor: caretColor ?? color } : undefined;

  useEffect(() => {
    setTypedText('');
    setTypedIndex(0);
  }, [tokensKey]);

  useEffect(() => {
    if (!tokens.length) return;

    const targetToken = tokens[typedIndex % totalTokens] ?? '';
    let timeout: ReturnType<typeof setTimeout>;

    if (!targetToken) {
      timeout = setTimeout(() => {
        setTypedIndex((prev) => (prev + 1) % totalTokens);
      }, 400);
      return () => clearTimeout(timeout);
    }

    if (typedText.length < targetToken.length) {
      timeout = setTimeout(() => {
        setTypedText(targetToken.slice(0, typedText.length + 1));
      }, typingDelay);
    } else {
      timeout = setTimeout(() => {
        setTypedText('');
        setTypedIndex((prev) => (prev + 1) % totalTokens);
      }, holdDelay);
    }

    return () => clearTimeout(timeout);
  }, [holdDelay, typedIndex, typedText, tokensKey, totalTokens, typingDelay, tokens]);

  if (!tokens.length) {
    return null;
  }

  return (
    <span
      className={cn(
        'relative inline-block min-w-[12ch] whitespace-nowrap font-semibold leading-tight text-[#f1a40b] dark:text-yellow-200',
        className,
      )}
      style={highlightStyle}
      aria-label={ariaLabel}
    >
      <span className="invisible pointer-events-none select-none">{currentToken}</span>
      <span className="absolute inset-0 flex items-center justify-center" aria-live="polite">
        <span>{typedText}</span>
        <span
          className={cn(
            'ml-1 inline-block h-6 w-0.5 bg-[#f1a40b] dark:bg-yellow-200 animate-pulse',
            caretClassName,
          )}
          style={caretStyle}
        />
      </span>
    </span>
  );
}
