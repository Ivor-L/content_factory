import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateFromScript } from "@/lib/n8n";
import { getRequestUserContext } from "@/lib/authServer";
import { deductCredits } from "@/lib/credits";
import { getCreditCost } from "@/lib/creditCosts";
import { logCreditUsage } from "@/lib/logCreditUsage";

const WORKFLOW_ID = "flow_script_gen";
const WORKFLOW_NAME = "脚本生成";

export async function POST(req: NextRequest) {
  try {
    const { scriptContent, scriptId } = await req.json();

    if (!scriptContent) {
      return NextResponse.json({ error: "Script content is required" }, { status: 400 });
    }

    const { apiKey } = await getRequestUserContext(req);

    const n8nResult = await generateFromScript(scriptContent);

    const replication = await prisma.replication.create({
      data: {
        status: "completed",
        type: "SCRIPT",
        result: JSON.stringify(n8nResult),
        scriptId: scriptId || undefined,
      },
    });

    if (apiKey) {
      const amount = await getCreditCost("script_generation", 1);
      deductCredits(apiKey, {
        amount,
        reason: "script_generation",
        workflowId: WORKFLOW_ID,
        workflowName: WORKFLOW_NAME,
      }).catch((e) => console.error("[generation/script] deduct credits failed:", e));
      logCreditUsage({ featureKey: "script_generation", amount, success: true });
    }

    return NextResponse.json(replication);
  } catch (error) {
    console.error("Error generating from script:", error);
    logCreditUsage({ featureKey: "script_generation", success: false, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Failed to generate" }, { status: 500 });
  }
}
