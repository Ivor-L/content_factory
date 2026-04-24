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
  const filtered = useMemo(
    () => options.filter((option) => option.label),
    [options]
  );
  const hasMultipleTabs = filtered.length > 1;
  const optionSignature = useMemo(
    () => filtered.map((opt) => opt.value).join("|"),
    [filtered]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicatorRect, setIndicatorRect] = useState({
    width: 0,
    x: 0,
    offsetLeft: 0,
    offsetRight: 0,
    containerHeight: 0,
  });

  const updateIndicator = useCallback(() => {
    if (!hasMultipleTabs) return;
    const container = containerRef.current;
    const activeButton = buttonRefs.current[value];
    if (!container || !activeButton) return;
    const containerRect = container.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(container);
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const activeIndex = filtered.findIndex((opt) => opt.value === value);
    const isFirst = activeIndex === 0;
    const isLast = activeIndex === filtered.length - 1;
    const activeRect = activeButton.getBoundingClientRect();
    const nextRect = {
      width: activeRect.width,
      x: activeRect.left - containerRect.left,
      offsetLeft: isFirst ? paddingLeft : 0,
      offsetRight: isLast ? paddingRight : 0,
      containerHeight: containerRect.height,
    };
    setIndicatorRect((prev) => {
      if (
        prev.width === nextRect.width &&
        prev.x === nextRect.x &&
        prev.offsetLeft === nextRect.offsetLeft &&
        prev.offsetRight === nextRect.offsetRight &&
        prev.containerHeight === nextRect.containerHeight
      ) {
        return prev;
      }
      return nextRect;
    });
  }, [filtered, hasMultipleTabs, value]);

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
        "relative inline-flex rounded-full border border-gray-200 bg-gray-100 p-0.5 backdrop-blur dark:border-gray-700 dark:bg-gray-800/80",
        className
      )}
    >
      <motion.div
        key={layoutId}
        data-indicator-id={layoutId}
        className={cn(
          "pointer-events-none absolute rounded-full bg-black text-white shadow-lg dark:bg-white dark:text-black",
          indicatorClassName
        )}
        style={{ top: 0, left: 0 }}
        initial={false}
        animate={{
          width: Math.max(0, indicatorRect.width + indicatorRect.offsetLeft + indicatorRect.offsetRight),
          x: indicatorRect.x - indicatorRect.offsetLeft,
          height: Math.max(0, indicatorRect.containerHeight),
          y: 0,
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
                ? cn("text-white dark:text-black", activeClassName)
                : cn("text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white", inactiveClassName)
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
