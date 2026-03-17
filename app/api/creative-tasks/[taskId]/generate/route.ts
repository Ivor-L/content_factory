import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { assertStageKey } from "@/lib/creativeTaskService";
import { generateStageForTask } from "@/lib/creativeAi";

type Params = {
  params: Promise<{ taskId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { stage: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.stage) {
    return NextResponse.json({ error: "stage is required" }, { status: 400 });
  }

  const stage = assertStageKey(body.stage);

  const { taskId } = await params;
  try {
    const result = await generateStageForTask(taskId, userId, stage);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("Stage generation failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 400 }
    );
  }
}
