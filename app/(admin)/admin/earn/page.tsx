import { notFound } from 'next/navigation';
import { isEarnMarketEnabled } from '@/lib/earnFeatureFlag';
import { AdminEarnPageClient } from './AdminEarnPageClient';

export default function AdminEarnPage() {
  if (!isEarnMarketEnabled) notFound();

  return <AdminEarnPageClient />;
}
