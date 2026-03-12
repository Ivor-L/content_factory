export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";
import { ScriptList } from "./ScriptList";

export default async function ScriptsPage() {
  const scripts = await prisma.script.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      videoUrl: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      progress: true,
      error: true,
      blueprint: true
    }
  });

  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, images: true },
  });

  const characters = await prisma.character.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, avatar: true },
  });

  const serializedScripts = scripts.map(s => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  return <ScriptList initialScripts={serializedScripts} products={products} characters={characters} />;
}
