import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import {
  CanvasProjectConflictError,
  CanvasProjectInput,
  deleteCanvasProject,
  getCanvasProject,
  updateCanvasProject,
} from '@/lib/canvasProjects';

type RouteParams = {
  params: Promise<{ projectId: string }>;
};

function toMetaProject(project: {
  id: string;
  name: string;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: project.id,
    name: project.name,
    thumbnail: project.thumbnail,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

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
  if (
    body.canvasData !== undefined &&
    (body.canvasData === null ||
      typeof body.canvasData !== 'object' ||
      Array.isArray(body.canvasData))
  ) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_CANVAS_DATA',
          message: 'Invalid canvasData payload',
        },
      },
      { status: 400 },
    );
  }

  try {
    const project = await updateCanvasProject(userId, projectId, body);
    if (!project) {
      return notFound();
    }
    const { searchParams } = new URL(request.url);
    const responseMode = searchParams.get('response');
    if (responseMode === 'meta') {
      return NextResponse.json({ data: toMetaProject(project) });
    }
    return NextResponse.json({ data: project });
  } catch (error) {
    if (error instanceof CanvasProjectConflictError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 409 },
      );
    }
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
