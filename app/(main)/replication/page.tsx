export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";
import { getServerRequestUserContext } from "@/lib/serverRequestContext";
import ReplicationContent from "./ReplicationContent";

export default async function ReplicationPage() {
  const { userId } = await getServerRequestUserContext();
  if (!userId) {
    return <div className="p-8">Unauthorized</div>;
  }

  const replicationWhere = {
    OR: [
      { product: { is: { userId } } },
      { script: { is: { userId } } },
    ],
  };

  const [history, digitalHumanVideos] = await Promise.all([
    prisma.replication.findMany({
      where: replicationWhere,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true } },
        script: { select: { title: true, breakdown: true, blueprint: true } }, // Include breakdown for details
      },
      take: 50, // Increase limit
    }),
    prisma.digitalHumanVideo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
  ]);

  // Serialize history for client component
  const serializedHistory = history.map(item => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    inputParams: item.inputParams ? JSON.parse(JSON.stringify(item.inputParams)) : null,
  }));

  const serializedDigitalHumanVideos = digitalHumanVideos.map(item => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return (
    <ReplicationContent
      history={serializedHistory}
      digitalHumanVideos={serializedDigitalHumanVideos}
      showCreationActions={false}
      enableImageTab={false}
    />
  );
}
