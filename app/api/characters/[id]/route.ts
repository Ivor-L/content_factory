import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.character.delete({
      where: {
        id: params.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete character' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, avatar, voiceId } = body;

    const character = await prisma.character.update({
      where: {
        id: params.id,
      },
      data: {
        name,
        avatar,
        voiceId,
      },
    });

    return NextResponse.json(character);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update character' }, { status: 500 });
  }
}
