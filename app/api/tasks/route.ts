import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { fetchUserTaskSummaries } from "@/lib/taskSummaryQueries";

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // Filtering
  const taskType = searchParams.get("taskType");
  const status = searchParams.get("status");

  // Pagination
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const offsetParam = Number(searchParams.get("offset") ?? "0");

  try {
    const { tasks, total, limit, offset, hasMore } = await fetchUserTaskSummaries({
      userId,
      taskType: taskType as any,
      status,
      limit: limitParam,
      offset: offsetParam,
      includeEnrichment: true,
      includeTotal: false,
    });

    return NextResponse.json({
      data: tasks,
      pagination: {
        total,
        limit,
        offset,
        hasMore,
      },
    });
  } catch (error) {
    console.error("Failed to fetch tasks", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
