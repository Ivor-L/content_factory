import { Text2ImageClient } from "./Text2ImageClient";

export const dynamic = "force-dynamic";

interface Text2ImagePageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

export default function Text2ImagePage({ searchParams }: Text2ImagePageProps) {
  return <Text2ImageClient searchParams={searchParams} />;
}
