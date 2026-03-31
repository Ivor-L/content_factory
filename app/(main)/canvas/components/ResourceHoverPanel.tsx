"use client";

import { useMemo, useState } from "react";
import type { CanvasResourceRecord } from "../hooks/useCanvasResources";

type ResourceHoverPanelProps = {
  resources: CanvasResourceRecord[];
  onSelect?: (resource: CanvasResourceRecord) => void;
  label?: string;
  emptyText?: string;
  children: React.ReactNode;
};

export function ResourceHoverPanel({
  resources,
  onSelect,
  label = "资源库",
  emptyText = "暂无资源，可前往资源页上传",
  children,
}: ResourceHoverPanelProps) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => {
    const groups: Record<string, CanvasResourceRecord[]> = {};
    resources.forEach((item) => {
      const key = item.variant || item.type || "general";
      groups[key] = groups[key] || [];
      groups[key].push(item);
    });
    return Object.entries(groups).map(([variant, list]) => ({
      variant,
      list,
    }));
  }, [resources]);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-72 rounded-2xl border border-white/10 bg-[var(--canvas-bg)] p-3 text-white shadow-xl">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/40">
            <span>{label}</span>
            <span>{resources.length}</span>
          </div>
          {resources.length === 0 ? (
            <p className="text-xs text-white/50">{emptyText}</p>
          ) : (
            <div className="space-y-3">
              {grouped.map((group) => (
                <div key={group.variant}>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">
                    {group.variant === "voice"
                      ? "音色"
                      : group.variant === "emotion"
                      ? "情感"
                      : group.variant}
                  </p>
                  <div className="mt-1 space-y-1">
                    {group.list.map((resource) => (
                      <button
                        key={resource.id}
                        type="button"
                        onClick={() => onSelect?.(resource)}
                        className="w-full rounded-xl border border-white/10 px-2.5 py-1.5 text-left text-sm text-white/80 transition hover:border-white/30"
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{resource.name}</span>
                          {resource.duration ? (
                            <span className="text-[11px] text-white/40">
                              {Math.round(resource.duration)}s
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
