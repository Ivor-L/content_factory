import { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8 dark:text-gray-100">
        {children}
      </main>
    </div>
  );
}
