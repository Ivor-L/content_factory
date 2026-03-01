import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "react-hot-toast";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AtomX",
  description: "Next.js App Router + TypeScript + Tailwind CSS"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300" suppressHydrationWarning={true}>
        <Providers>
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-8 dark:text-gray-100">
            {children}
          </main>
          <Toaster position="top-center" />
        </Providers>
      </body>
    </html>
  );
}
