import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateFromSellingPoints } from "@/lib/n8n";
import { getRequestUserContext } from "@/lib/authServer";
import { deductConfiguredCredits } from "@/lib/creditBilling";
import { logCreditUsage } from "@/lib/logCreditUsage";

const WORKFLOW_ID = "flow_selling_points_gen";
const WORKFLOW_NAME = "卖点生成脚本";

export async function POST(req: NextRequest) {
  try {
    const { sellingPoints, productId } = await req.json();

    if (!sellingPoints) {
      return NextResponse.json({ error: "Selling points are required" }, { status: 400 });
    }

    const { apiKey } = await getRequestUserContext(req);

    const n8nResult = await generateFromSellingPoints(sellingPoints);

    const replication = await prisma.replication.create({
      data: {
        status: "completed",
        type: "SELLING_POINTS",
        result: JSON.stringify(n8nResult),
        productId: productId || undefined,
      },
    });

    if (apiKey) {
      try {
        await deductConfiguredCredits({
          apiKey,
          featureKey: "selling_points_generation",
          defaultAmount: 1,
          workflowId: WORKFLOW_ID,
          workflowName: WORKFLOW_NAME,
        });
      } catch (error) {
        console.error("[generation/selling-points] deduct credits failed:", error);
        return NextResponse.json({ error: "积分不足或扣费失败" }, { status: 402 });
      }
    }

    return NextResponse.json(replication);
  } catch (error) {
    console.error("Error generating from selling points:", error);
    logCreditUsage({ featureKey: "selling_points_generation", success: false, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Failed to generate" }, { status: 500 });
  }
}
