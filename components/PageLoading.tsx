"use client";

import { useMemo } from "react";
import { motion, type Variants } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const pageEase: [number, number, number, number] = [0.32, 0.72, 0, 1];

const containerVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: pageEase,
    },
  },
};

const indicatorVariants: Variants = {
  animate: {
    rotate: 360,
    transition: {
      repeat: Infinity,
      duration: 1.25,
      ease: "linear",
    },
  },
};

export function PageLoading() {
  const { t, language } = useLanguage();

  const subtitle = useMemo(() => {
    switch (language) {
      case "en":
        return "Syncing your knowledge assets…";
      case "zh-TW":
        return "正在調取知識庫資產…";
      default:
        return "正在调取知识库资产…";
    }
  }, [language]);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#f5f7fb] via-white to-[#eef1f6] px-6 py-16 dark:from-gray-950 dark:via-gray-900 dark:to-black">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.09),transparent_60%)] opacity-70 dark:bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),transparent_55%)]" />
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-gray-300/40 to-transparent dark:via-gray-700/40" />
        <div className="absolute inset-x-0 top-1/3 h-px bg-gradient-to-r from-transparent via-gray-300/40 to-transparent dark:via-gray-700/40" />
      </div>

      <motion.div
        role="status"
        aria-live="polite"
        aria-label={t.common.loading}
        className="relative z-10 w-full max-w-xl rounded-[32px] border border-white/60 bg-white/80 p-10 text-center shadow-2xl shadow-gray-200/70 backdrop-blur-xl dark:border-white/10 dark:bg-gray-900/80 dark:shadow-black/40"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="mx-auto flex w-16 h-16 items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-inner shadow-gray-200/60 dark:border-white/10 dark:bg-gray-900">
          <motion.span
            className="text-gray-900 dark:text-white"
            variants={indicatorVariants}
            animate="animate"
          >
            <Loader2 className="h-7 w-7" />
          </motion.span>
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500">
          {t.assetLibrary.sidebarLabel}
        </p>
        <p className="mt-4 text-2xl font-black text-gray-900 dark:text-white">
          {t.common.loading}
        </p>
        <p className="mt-2 text-base text-gray-500 dark:text-gray-300">
          {subtitle}
        </p>
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((index) => (
            <motion.span
              /* eslint-disable-next-line react/no-array-index-key */
              key={index}
              className="h-2 rounded-full bg-gradient-to-r from-gray-200 via-white to-gray-200 shadow-inner shadow-gray-200/80 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800"
              animate={{
                opacity: [0.3, 1, 0.3],
                scaleX: [0.9, 1.02, 0.9],
              }}
              transition={{
                repeat: Infinity,
                duration: 1.6,
                delay: index * 0.2,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
