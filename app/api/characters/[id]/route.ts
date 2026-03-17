
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.character.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete character' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, avatar, voiceId } = body;

    const character = await prisma.character.update({
      where: {
        id,
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
