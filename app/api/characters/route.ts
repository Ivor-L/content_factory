import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const characters = await prisma.character.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    return NextResponse.json(characters);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch characters' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, avatar, voiceId } = body;

    const character = await prisma.character.create({
      data: {
        name,
        avatar,
        voiceId,
      },
    });

    return NextResponse.json(character);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create character' }, { status: 500 });
  }
}
