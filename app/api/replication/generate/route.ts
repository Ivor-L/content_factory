import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateReplication } from "@/lib/n8n";

export async function POST(request: Request) {
  try {
    const { productId, scriptId } = await request.json();

    if (!productId || !scriptId) {
      return NextResponse.json({ error: "Missing productId or scriptId" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    const script = await prisma.script.findUnique({ where: { id: scriptId } });

    if (!product || !script) {
      return NextResponse.json({ error: "Product or Script not found" }, { status: 404 });
    }

    const replication = await prisma.replication.create({
      data: {
        status: "pending",
        result: "{}",
        productId,
        scriptId,
      },
    });

    // Start background task (without awaiting)
    (async () => {
      try {
        const result = await generateReplication(product, script);
        await prisma.replication.update({
          where: { id: replication.id },
          data: {
            status: "completed",
            result: JSON.stringify(result),
          },
        });
      } catch (error) {
        console.error("Replication failed", error);
        await prisma.replication.update({
            where: { id: replication.id },
            data: { status: "failed", result: JSON.stringify({ error: "Replication failed" }) }
        });
      }
    })();

    return NextResponse.json({ id: replication.id });
  } catch (error) {
    console.error("Error creating replication:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
