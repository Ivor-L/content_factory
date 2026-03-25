import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import {
  CanvasProjectInput,
  deleteCanvasProject,
  getCanvasProject,
  updateCanvasProject,
} from '@/lib/canvasProjects';

type RouteParams = {
  params: Promise<{ projectId: string }>;
};

function notFound() {
  return NextResponse.json({ error: 'Project not found' }, { status: 404 });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { userId } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId } = await params;
  const project = await getCanvasProject(userId, projectId);
  if (!project) {
    return notFound();
  }
  return NextResponse.json({ data: project });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { userId } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId } = await params;

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
    const project = await updateCanvasProject(userId, projectId, body);
    if (!project) {
      return notFound();
    }
    return NextResponse.json({ data: project });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'CANVAS_PROJECT_UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to update project',
        },
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { userId } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId } = await params;

  try {
    const deleted = await deleteCanvasProject(userId, projectId);
    if (!deleted) {
      return notFound();
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'CANVAS_PROJECT_DELETE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to delete project',
        },
      },
      { status: 500 },
    );
  }
}
