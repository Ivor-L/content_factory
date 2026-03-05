
'use client';

import { DigitalHumanModal } from '@/components/DigitalHumanModal';
import { useRouter } from 'next/navigation';

export default function DigitalHumanPage() {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="w-full max-w-6xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden h-[85vh]">
            <DigitalHumanModal onClose={() => router.back()} />
        </div>
    </div>
  );
}
