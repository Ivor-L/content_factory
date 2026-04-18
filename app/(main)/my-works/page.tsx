import { getServerRequestUserContext } from "@/lib/serverRequestContext";
import { MyProjectsClient } from "./MyProjectsClient";
import { fetchUserTaskSummaries } from "@/lib/taskSummaryQueries";
import type { TaskType } from "@/lib/taskSummary";

export const dynamic = "force-dynamic";

const INITIAL_PAGE_SIZE = 12;

type SerializableTaskSummary = {
  id: string;
  userId: string;
  taskType: TaskType;
  taskId: string;
  title: string | null;
  status: string;
  preview: string | null;
  thumbnailUrl: string | null;
  progress: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export default async function MyProjectsPage() {
  const { userId } = await getServerRequestUserContext();

  if (!userId) {
    return <div className="p-8 text-gray-600">Unauthorized</div>;
  }

  let initialTasks: SerializableTaskSummary[] = [];
  let hasMore = false;

  try {
    const { tasks, hasMore: more } = await fetchUserTaskSummaries({
      userId,
      limit: INITIAL_PAGE_SIZE,
      offset: 0,
      includeEnrichment: false,
    });

    initialTasks = tasks.map((task) => ({
      ...task,
      taskType: task.taskType as TaskType,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      metadata: task.metadata ? (JSON.parse(JSON.stringify(task.metadata)) as Record<string, unknown>) : null,
    }));
    hasMore = more;
  } catch (error) {
    console.error("Failed to load initial my-works data", error);
  }

  return (
    <MyProjectsClient
      initialTasks={initialTasks}
      initialHasMore={hasMore}
      initialPageSize={INITIAL_PAGE_SIZE}
    />
  );
}
