import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import {
  CanvasProjectInput,
  createCanvasProject,
  listCanvasProjects,
} from '@/lib/canvasProjects';

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) ? limitParam : undefined;

  try {
    const projects = await listCanvasProjects(userId, limit ?? 100);
    return NextResponse.json({ data: projects });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'CANVAS_PROJECTS_QUERY_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load projects',
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CanvasProjectInput | null = null;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === 'object' ? (parsed as CanvasProjectInput) : null;
  } catch {
    body = null;
  }

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const project = await createCanvasProject(userId, body);
    return NextResponse.json({ data: project }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'CANVAS_PROJECT_CREATE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create project',
        },
      },
      { status: 500 },
    );
  }
}
