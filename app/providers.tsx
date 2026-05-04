"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { TenantProvider } from "@/hooks/useTenant";
import { TenantBrandingEffect } from "@/components/TenantBrandingEffect";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { ReferralBindingWatcher } from "@/components/ReferralBindingWatcher";
import { ReferralCodeCapture } from "@/components/ReferralCodeCapture";

const ENABLE_REFERRAL_WATCHER = process.env.NEXT_PUBLIC_ENABLE_REFERRAL_WATCHER !== "false";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <LanguageProvider>
        <TenantProvider>
          <TenantBrandingEffect />
          <ReferralCodeCapture />
          {ENABLE_REFERRAL_WATCHER ? <ReferralBindingWatcher /> : null}
          <ChunkLoadRecovery />
          {children}
        </TenantProvider>
      </LanguageProvider>
    </NextThemesProvider>
  );
}
