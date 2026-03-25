export const dynamic = "force-dynamic";



import { HomeContent } from "./components/HomeContent";
import { getServerRequestUserContext } from "@/lib/serverRequestContext";
import type { TaskType } from "@/lib/taskSummary";
import { formatDashboardTimestamp } from "@/lib/formatDashboardTimestamp";
import prisma from "@/lib/prisma";
import { fetchUserTaskSummaries } from "@/lib/taskSummaryQueries";


export default async function Home() {
  const { userId } = await getServerRequestUserContext();
  if (!userId) {
    return <div className="p-8 text-gray-600">Unauthorized</div>;
  }

  type TaskSummaryRecord = Awaited<
    ReturnType<typeof prisma.taskSummary.findMany>
  >[number];
  type SerializedTaskSummary = Omit<TaskSummaryRecord, "createdAt" | "updatedAt" | "metadata"> & {
    taskType: TaskType;
    createdAt: string;
    updatedAt: string;
    metadata: Record<string, unknown> | null;
    updatedAtFormatted: string;
  };
  type ProductSummary = { id: string; name: string };

  let serializedTasks: SerializedTaskSummary[] = [];
  let products: ProductSummary[] = [];

  try {
    const { tasks: recentTasks } = await fetchUserTaskSummaries({
      userId,
      limit: 5,
    });

    const mappedTasks = recentTasks.map((task) => ({
      ...task,
      taskType: task.taskType as TaskType,
      metadata: task.metadata ? JSON.parse(JSON.stringify(task.metadata)) : null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      updatedAtFormatted: formatDashboardTimestamp(task.updatedAt),
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

    serializedTasks = mappedTasks;
    products = fetchedProducts;
  } catch (error) {
    console.error("Failed to load dashboard data", error);
  }

  return <HomeContent recentTasks={serializedTasks} products={products} />;
}
