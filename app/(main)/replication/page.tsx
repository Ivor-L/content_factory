import prisma from "@/lib/prisma";
import ReplicationContent from "./ReplicationContent";

export default async function ReplicationPage() {
  const history = await prisma.replication.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      product: { select: { name: true } },
      script: { select: { title: true, breakdown: true } }, // Include breakdown for details
    },
    take: 50, // Increase limit
  });

  // Serialize history for client component
  const serializedHistory = history.map(item => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return <ReplicationContent history={serializedHistory} />;
}
