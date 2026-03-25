"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { WritingStyleLibrary } from "@/components/assets/WritingStyleLibrary";
import { AssetLibrary } from "@/components/assets/AssetLibrary";

type StyleLibraryTab = "writingStyles" | "stylePresets";

type StyleLibraryHubProps = {
  showHeader?: boolean;
};

const TABS: StyleLibraryTab[] = ["writingStyles", "stylePresets"];

const TAB_LABELS: Record<StyleLibraryTab, string> = {
  writingStyles: "写作风格",
  stylePresets: "视觉预设",
};

export function StyleLibraryHub({ showHeader = true }: StyleLibraryHubProps) {
  const [activeTab, setActiveTab] = useState<StyleLibraryTab>("writingStyles");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {showHeader && (
        <div className="mb-4 space-y-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">风格库</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            将写作风格与视觉预设统一管理：一个入口切换使用。
          </p>
        </div>
      )}

      <div className="border-b border-gray-200 dark:border-gray-800 flex flex-wrap gap-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "relative px-4 py-3 text-lg font-semibold tracking-wide text-gray-400 dark:text-gray-500 transition-all duration-200",
              activeTab === tab
                ? "text-gray-900 dark:text-white"
                : "hover:text-gray-900 dark:hover:text-white"
            )}
          >
            {TAB_LABELS[tab]}
            {activeTab === tab && (
              <span className="absolute left-0 -bottom-[1px] w-full h-0.5 bg-gray-900 dark:bg-white" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
          >
            {activeTab === "writingStyles" ? (
              <WritingStyleLibrary showHeader={false} />
            ) : (
              <AssetLibrary showHeader={false} initialTab="styles" tabs={["styles"]} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
