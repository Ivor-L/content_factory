import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { fetchUserTaskSummaries } from "@/lib/taskSummaryQueries";
import { getOrSetShortTtlCache } from "@/lib/shortTtlCache";

const TASKS_LIST_CACHE_TTL_MS = 3_000;

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request, { skipProfileKeys: true });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // Filtering
  const taskType = searchParams.get("taskType");
  const status = searchParams.get("status");
  const includeEnrichment = searchParams.get("includeEnrichment") === "1";
  const forceRefresh = searchParams.get("forceRefresh") === "1" || searchParams.get("forceRefresh") === "true";

  // Pagination
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const offsetParam = Number(searchParams.get("offset") ?? "0");

  const cacheKey = JSON.stringify({
    userId,
    taskType,
    status,
    limit: limitParam,
    offset: offsetParam,
    includeEnrichment,
  });

  try {
    const buildResponseBody = async () => {
      const { tasks, total, limit, offset, hasMore } = await fetchUserTaskSummaries({
        userId,
        taskType: taskType as any,
        status,
        limit: limitParam,
        offset: offsetParam,
        includeEnrichment,
        includeTotal: false,
      });

      return {
        data: tasks,
        pagination: {
          total,
          limit,
          offset,
          hasMore,
        },
      };
    };

    const { value: responseBody, cacheStatus } = forceRefresh
      ? { value: await buildResponseBody(), cacheStatus: "MISS" as const }
      : await getOrSetShortTtlCache(
          "api:tasks:list",
          cacheKey,
          TASKS_LIST_CACHE_TTL_MS,
          buildResponseBody,
        );

    return NextResponse.json(responseBody, {
      headers: { "X-Cache": forceRefresh ? "SKIP" : cacheStatus },
    });
  } catch (error) {
    console.error("Failed to fetch tasks", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
