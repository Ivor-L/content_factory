"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { AiGlowSpinner } from "@/components/AiGlowSpinner";

export function PageLoading() {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-transparent">
      <div role="status" aria-live="polite" aria-label={t.common.loading}>
        <AiGlowSpinner />
      </div>
    </div>
  );
}
