export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";
import { ScriptList } from "./ScriptList";
import { getServerRequestUserContext } from "@/lib/serverRequestContext";

export default async function ScriptsPage() {
  const { userId } = await getServerRequestUserContext();
  if (!userId) {
    return <div className="p-8">Unauthorized</div>;
  }

  const scripts = await prisma.script.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      videoUrl: true,
      breakdown: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      progress: true,
      error: true,
      blueprint: true
    }
  });

  const products = await prisma.product.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, images: true },
  });

  const characters = await prisma.character.findMany({
    where: { userId },
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
