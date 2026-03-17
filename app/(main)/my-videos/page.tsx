export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";
import ReplicationContent from "../replication/ReplicationContent";

export default async function MyVideosPage() {
  const [history, digitalHumanVideos] = await Promise.all([
    prisma.replication.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true } },
        script: { select: { title: true, breakdown: true, blueprint: true } },
      },
      take: 50,
    }),
    prisma.digitalHumanVideo.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const serializedHistory = history.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  const serializedDigitalHumanVideos = digitalHumanVideos.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return (
    <ReplicationContent
      history={serializedHistory}
      digitalHumanVideos={serializedDigitalHumanVideos}
      context="myVideos"
      showCreationActions={false}
      enableImageTab={false}
    />
  );
}
