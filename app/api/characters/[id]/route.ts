
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';

async function resolveCharacter(id: string, userId: string) {
  return prisma.character.findFirst({ where: { id, userId } });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const character = await resolveCharacter(id, userId);
    if (!character) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.character.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete character', error);
    return NextResponse.json({ error: 'Failed to delete character' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await resolveCharacter(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, avatar, voiceId } = body ?? {};
    if (!name || !avatar) {
      return NextResponse.json({ error: 'name and avatar are required' }, { status: 400 });
    }

    const character = await prisma.character.update({
      where: {
        id,
      },
      data: {
        name,
        avatar,
        voiceId: voiceId || null,
      },
    });

    return NextResponse.json(character);
  } catch (error) {
    console.error('Failed to update character', error);
    return NextResponse.json({ error: 'Failed to update character' }, { status: 500 });
  }
}
