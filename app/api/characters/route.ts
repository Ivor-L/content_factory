import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';

export async function GET(request: Request) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const characters = await prisma.character.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return NextResponse.json(characters);
  } catch (error) {
    console.error('Failed to load characters', error);
    return NextResponse.json({ error: 'Failed to fetch characters' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, avatar, voiceId } = body ?? {};
    if (!name || !avatar) {
      return NextResponse.json({ error: 'name and avatar are required' }, { status: 400 });
    }

    const character = await prisma.character.create({
      data: {
        name,
        avatar,
        voiceId: voiceId || null,
        userId,
      },
    });

    return NextResponse.json(character);
  } catch (error) {
    console.error('Failed to create character', error);
    return NextResponse.json({ error: 'Failed to create character' }, { status: 500 });
  }
}
