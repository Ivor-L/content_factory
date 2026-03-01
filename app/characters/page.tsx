import prisma from '@/lib/prisma';
import { CharacterList } from './CharacterList';

export default async function CharacterPage() {
  const characters = await prisma.character.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });

  return <CharacterList initialCharacters={characters} />;
}
