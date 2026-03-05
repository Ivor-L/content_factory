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
      <body className="h-screen bg-[#F6F7F9] dark:bg-black transition-colors duration-300" suppressHydrationWarning={true}>
        <Providers>
          {children}
          <Toaster position="top-center" />
        </Providers>
      </body>
    </html>
  );
}
