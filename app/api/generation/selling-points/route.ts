import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateFromSellingPoints } from "@/lib/n8n";

export async function POST(req: NextRequest) {
  try {
    const { sellingPoints, productId } = await req.json();

    if (!sellingPoints) {
      return NextResponse.json({ error: "Selling points are required" }, { status: 400 });
    }

    const n8nResult = await generateFromSellingPoints(sellingPoints);

    const replication = await prisma.replication.create({
      data: {
        status: "completed",
        type: "SELLING_POINTS",
        result: JSON.stringify(n8nResult),
        productId: productId || undefined,
      },
    });

    return NextResponse.json(replication);
  } catch (error) {
    console.error("Error generating from selling points:", error);
    return NextResponse.json({ error: "Failed to generate" }, { status: 500 });
  }
}
