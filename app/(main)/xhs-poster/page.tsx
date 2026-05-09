import { Text2ImageClient } from "./Text2ImageClient";

export const dynamic = "force-dynamic";

interface Text2ImagePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Text2ImagePage({ searchParams }: Text2ImagePageProps) {
  return <Text2ImageClient searchParams={await searchParams} />;
}
