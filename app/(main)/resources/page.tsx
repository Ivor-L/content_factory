export const dynamic = "force-dynamic";

import { ResourceTabs } from "./ResourceTabs";
import prisma from "@/lib/prisma";
import { getServerRequestUserContext } from "@/lib/serverRequestContext";

export default async function ResourcesPage() {
  const { userId } = await getServerRequestUserContext();
  if (!userId) {
    return <div className="p-8">Unauthorized</div>;
  }

  const [products, characters] = await Promise.all([
    prisma.product.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.character.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);

  const serializedProducts = products.map((product) => ({
    ...product,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }));

  return (
    <ResourceTabs
      products={serializedProducts}
      characters={characters}
    />
  );
}
