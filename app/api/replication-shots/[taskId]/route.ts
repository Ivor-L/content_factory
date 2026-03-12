import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import {
  getReplicationShotTaskById,
  updateReplicationShotTask,
  ReplicationShotTaskStatus,
  ShotPrompt,
  ShotFrame,
  EndFrameOption,
  ShotVideo,
} from '@/lib/replicationShots';

type UpdatePayload = Partial<{
  status: ReplicationShotTaskStatus;
  sceneImageUrl: string | null;
  productSceneImageUrl: string | null;
  shotPrompts: ShotPrompt[] | null;
  firstFrames: ShotFrame[] | null;
  endFrameOptions: EndFrameOption[] | null;
  videos: ShotVideo[] | null;
  finalVideoUrl: string | null;
}>;

const sanitizeArray = <T>(value: unknown): T[] | null => {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  return value as T[];
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await getReplicationShotTaskById(taskId, userId);
  if (!task) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return NextResponse.json({ task });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: UpdatePayload;
  try {
    payload = (await request.json()) as UpdatePayload;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    const updated = await updateReplicationShotTask({
      taskId,
      userId,
      data: {
        status: payload.status,
        sceneImageUrl: payload.sceneImageUrl,
        productSceneImageUrl: payload.productSceneImageUrl,
        shotPrompts: sanitizeArray<ShotPrompt>(payload.shotPrompts),
        firstFrames: sanitizeArray<ShotFrame>(payload.firstFrames),
        endFrameOptions: sanitizeArray<EndFrameOption>(payload.endFrameOptions),
        videos: sanitizeArray<ShotVideo>(payload.videos),
        finalVideoUrl: payload.finalVideoUrl,
      },
    });

    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error('Failed to update replication shot task', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
