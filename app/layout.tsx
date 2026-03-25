import "./globals.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import { getTenantConfig } from "@/lib/tenants/config";
import { Providers } from "./providers";

export const dynamic = "force-dynamic";

const DEFAULT_TITLE = "NexTide";
const DEFAULT_DESCRIPTION = "Next.js App Router + TypeScript + Tailwind CSS";
const DEFAULT_ICON = "/favicon-whale.svg";

export async function generateMetadata(): Promise<Metadata> {
  let tenantSlug: string | undefined;
  try {
    const headerList = await headers();
    tenantSlug = typeof headerList?.get === "function" ? headerList.get("x-tenant-slug") ?? undefined : undefined;
  } catch {
    tenantSlug = undefined;
  }
  tenantSlug = tenantSlug ?? "nextide";
  const tenant = getTenantConfig(tenantSlug);

  return {
    title: tenant.name || DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    icons: {
      icon: tenant.browserLogo || DEFAULT_ICON,
    },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className="min-h-screen bg-[#F6F7F9] dark:bg-[#05060b] text-gray-900 dark:text-gray-100 transition-colors duration-300"
        suppressHydrationWarning={true}
      >
        <Providers>
          {children}
          <Toaster position="top-center" />
        </Providers>
      </body>
    </html>
  );
}
