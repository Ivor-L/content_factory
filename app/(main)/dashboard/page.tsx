export const dynamic = "force-dynamic";



import prisma from "@/lib/prisma";
import { HomeContent } from "./components/HomeContent";


export default async function Home() {
  // Calculate date 3 days ago
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  type RecentVideo = Awaited<
    ReturnType<typeof prisma.replication.findMany>
  >[number];
  type SerializedVideo = Omit<RecentVideo, "createdAt" | "updatedAt"> & {
    createdAt: string;
    updatedAt: string;
  };
  type ProductSummary = { id: string; name: string };

  let serializedVideos: SerializedVideo[] = [];
  let products: ProductSummary[] = [];

  try {
    const recentVideos = await prisma.replication.findMany({
      where: {
        createdAt: {
          gte: threeDaysAgo,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
      include: {
        product: { select: { name: true } },
      },
    });

    const mappedVideos = recentVideos.map((video: RecentVideo) => ({
      ...video,
      createdAt: video.createdAt.toISOString(),
      updatedAt: video.updatedAt.toISOString(),
    }));

    const fetchedProducts = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    serializedVideos = mappedVideos;
    products = fetchedProducts;
  } catch (error) {
    console.error("Failed to load dashboard data", error);
  }

  return <HomeContent recentVideos={serializedVideos} products={products} />;
}
