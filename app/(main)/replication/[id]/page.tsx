export const dynamic = "force-dynamic";


import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import ReplicationDetail from "./ReplicationDetail";

export default async function ReplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const replication = await prisma.replication.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      result: true,
      type: true,
      product: { select: { name: true } },
      script: { select: { title: true } },
    },
  });

  if (!replication) {
    notFound();
  }

  // Ensure replication matches the expected type in ReplicationDetail
  const safeReplication = {
    ...replication,
    type: replication.type || "FULL", // Default to FULL if null (shouldn't happen with default value in schema)
    product: replication.product || undefined,
    script: replication.script || undefined,
  };

  return <ReplicationDetail replication={safeReplication} />;
}
