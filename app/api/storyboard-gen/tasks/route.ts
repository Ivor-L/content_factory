import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const tasks = await prisma.storyboardTask.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Failed to fetch storyboard generation tasks', error);
    return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 });
  }
}
