import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { fetchUserTaskSummaries } from "@/lib/taskSummaryQueries";
import { getShortTtlCache, setShortTtlCache } from "@/lib/shortTtlCache";

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
  const cached = getShortTtlCache<object>("api:tasks:list", cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT" },
    });
  }

  try {
    const { tasks, total, limit, offset, hasMore } = await fetchUserTaskSummaries({
      userId,
      taskType: taskType as any,
      status,
      limit: limitParam,
      offset: offsetParam,
      includeEnrichment,
      includeTotal: false,
    });

    const responseBody = {
      data: tasks,
      pagination: {
        total,
        limit,
        offset,
        hasMore,
      },
    };
    setShortTtlCache("api:tasks:list", cacheKey, responseBody, TASKS_LIST_CACHE_TTL_MS);

    return NextResponse.json(responseBody, {
      headers: { "X-Cache": "MISS" },
    });
  } catch (error) {
    console.error("Failed to fetch tasks", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
