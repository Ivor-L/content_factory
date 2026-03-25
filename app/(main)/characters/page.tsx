export const dynamic = "force-dynamic";

import prisma from '@/lib/prisma';
import { CharacterList } from './CharacterList';
import { getServerRequestUserContext } from '@/lib/serverRequestContext';

export default async function CharacterPage() {
  const { userId } = await getServerRequestUserContext();
  if (!userId) {
    return <div className="p-8">Unauthorized</div>;
  }

  const characters = await prisma.character.findMany({
    where: { userId },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return <CharacterList initialCharacters={characters} />;
}
