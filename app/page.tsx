import prisma from "@/lib/prisma";
import { HomeContent } from "./components/HomeContent";

export const dynamic = 'force-dynamic';

export default async function Home() {
  // Calculate date 3 days ago
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const recentVideos = await prisma.replication.findMany({
    where: {
      createdAt: {
        gte: threeDaysAgo,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 5, // Limit to 5 for a single row
    include: {
      product: { select: { name: true } },
    },
  });

  const serializedVideos = recentVideos.map(video => ({
    ...video,
    createdAt: video.createdAt.toISOString(),
    updatedAt: video.updatedAt.toISOString(),
  }));

  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return <HomeContent recentVideos={serializedVideos} products={products} />;
}
