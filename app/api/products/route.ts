import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const products = await prisma.product.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        images: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const description = typeof payload.description === "string" ? payload.description.trim() : "";
    const sellingPointsText = typeof payload.sellingPointsText === "string" ? payload.sellingPointsText.trim() : "";
    const sellingPoints = Array.isArray(payload.sellingPoints)
      ? payload.sellingPoints.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];

    const images = Array.isArray(payload.images)
      ? payload.images.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];

    const product = await prisma.product.create({
      data: {
        userId,
        name,
        description,
        sellingPoints: JSON.stringify(sellingPoints),
        sellingPointsText,
        images: JSON.stringify(images),
        status: "PENDING",
        progress: 0,
      } as any,
      select: {
        id: true,
        name: true,
        images: true,
      },
    });

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    );
  }
}
