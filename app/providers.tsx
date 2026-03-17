"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { TenantProvider } from "@/hooks/useTenant";
import { TenantBrandingEffect } from "@/components/TenantBrandingEffect";
import { ReferralBindingWatcher } from "@/components/ReferralBindingWatcher";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <LanguageProvider>
        <TenantProvider>
          <TenantBrandingEffect />
          <ReferralBindingWatcher />
          <ChunkLoadRecovery />
          {children}
        </TenantProvider>
      </LanguageProvider>
    </NextThemesProvider>
  );
}
