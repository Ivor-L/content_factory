import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AtomX",
  description: "Next.js App Router + TypeScript + Tailwind CSS",
  icons: {
    icon: "/favicon-whale.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className="min-h-screen bg-[radial-gradient(circle_at_top,_var(--theme-primary-muted),_#f7f5ef)] dark:bg-[#05060b] text-gray-900 dark:text-gray-100 transition-colors duration-300"
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
