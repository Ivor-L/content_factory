"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { TenantProvider } from "@/hooks/useTenant";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <LanguageProvider>
        <TenantProvider>
          {children}
        </TenantProvider>
      </LanguageProvider>
    </NextThemesProvider>
  );
}
