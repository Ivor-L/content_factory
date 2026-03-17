"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import type { Transition } from "framer-motion";
import { cn } from "@/lib/utils";

export type ModeTabOption<T extends string = "manual" | "bulk"> = {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
};

type ModeTabsProps<T extends string = "manual" | "bulk"> = {
  value: T;
  options: ModeTabOption<T>[];
  onChange: (value: T) => void;
  layoutId?: string;
  className?: string;
  buttonClassName?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  indicatorClassName?: string;
  indicatorTransition?: Transition;
};

export function ModeTabs<T extends string = "manual" | "bulk">({
  value,
  options,
  onChange,
  layoutId = "mode-pill",
  className,
  buttonClassName,
  activeClassName,
  inactiveClassName,
  indicatorClassName,
  indicatorTransition,
}: ModeTabsProps<T>) {
  const filtered = options.filter((option) => option.label);
  const hasMultipleTabs = filtered.length > 1;
  const optionSignature = useMemo(
    () => filtered.map((opt) => opt.value).join("|"),
    [filtered]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicatorRect, setIndicatorRect] = useState({ width: 0, x: 0 });

  const updateIndicator = useCallback(() => {
    if (!hasMultipleTabs) return;
    const container = containerRef.current;
    const activeButton = buttonRefs.current[value];
    if (!container || !activeButton) return;
    const containerRect = container.getBoundingClientRect();
    const activeRect = activeButton.getBoundingClientRect();
    setIndicatorRect({
      width: activeRect.width,
      x: activeRect.left - containerRect.left,
    });
  }, [hasMultipleTabs, value]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [optionSignature, updateIndicator]);

  useEffect(() => {
    if (!hasMultipleTabs) return undefined;
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [hasMultipleTabs, updateIndicator]);

  if (!hasMultipleTabs) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative inline-flex rounded-full border border-primary-border/40 bg-primary-soft/60 p-0.5 backdrop-blur dark:bg-gray-800/80",
        className
      )}
    >
      <motion.div
        key={layoutId}
        data-indicator-id={layoutId}
        className={cn(
          "pointer-events-none absolute top-0 bottom-0 rounded-full bg-primary text-primary-foreground shadow-theme-glow dark:bg-primary",
          indicatorClassName
        )}
        initial={false}
        animate={{
          width: indicatorRect.width,
          x: indicatorRect.x,
        }}
        transition={
          indicatorTransition ?? { type: "spring", stiffness: 420, damping: 32, mass: 0.6 }
        }
      />
      {filtered.map((option) => {
        const isActive = value === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            ref={(node) => {
              if (node) {
                buttonRefs.current[option.value] = node;
              } else {
                delete buttonRefs.current[option.value];
              }
            }}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-10 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              buttonClassName,
              isActive
                ? cn("text-primary-foreground", activeClassName)
                : cn("text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-primary", inactiveClassName)
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
