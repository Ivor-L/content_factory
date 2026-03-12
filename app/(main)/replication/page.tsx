export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";
import ReplicationContent from "./ReplicationContent";

export default async function ReplicationPage() {
  const [history, digitalHumanVideos] = await Promise.all([
    prisma.replication.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true } },
        script: { select: { title: true, breakdown: true } }, // Include breakdown for details
      },
      take: 50, // Increase limit
    }),
    prisma.digitalHumanVideo.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    })
  ]);

  // Serialize history for client component
  const serializedHistory = history.map(item => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  const serializedDigitalHumanVideos = digitalHumanVideos.map(item => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return <ReplicationContent history={serializedHistory} digitalHumanVideos={serializedDigitalHumanVideos} />;
}
