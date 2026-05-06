import { NextRequest, NextResponse } from "next/server";
import { getApiKeyForUser, getRequestUserContext } from "@/lib/authServer";
import { assertStageKey } from "@/lib/creativeTaskService";
import { generateStageForTask } from "@/lib/creativeAi";
import { deductConfiguredCredits } from "@/lib/creditBilling";

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
    const apiKey = await getApiKeyForUser(userId);
    if (!apiKey) {
      return NextResponse.json({ error: "请先在设置页绑定 API Key" }, { status: 400 });
    }
    await deductConfiguredCredits({
      apiKey,
      featureKey: "creative_stage_generation",
      userId,
      defaultAmount: 1,
      modelKey: stage,
      workflowId: `creative_stage:${stage}`,
      workflowName: `创作阶段生成:${stage}`,
    });
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
