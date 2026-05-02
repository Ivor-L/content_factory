import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { createStoryboardJob, readString } from '@/lib/storyboard/orchestrator';

type StoryboardLaunchRequest = {
  script?: unknown;
  title?: unknown;
  creativeTaskId?: unknown;
  metadata?: unknown;
};

export async function POST(request: Request) {
  try {
    const { userId, apiKey } = await getRequestUserContext(request);
    if (!userId || !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as StoryboardLaunchRequest | null;
    if (!payload) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const script = readString(payload.script);
    if (!script) {
      return NextResponse.json({ error: 'Script content is required' }, { status: 400 });
    }

    const title = readString(payload.title);
    const creativeTaskId = readString(payload.creativeTaskId);
    const metadata = payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : {};

    const result = await createStoryboardJob({
      pipelineKey: 'script_to_storyboard',
      userId,
      apiKey,
      title,
      script,
      creativeTaskId,
      metadata,
      source: 'creative_workspace',
      statusOnCreate: 'ANALYZING',
      progressOnCreate: 5,
    });

    return NextResponse.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error('Unexpected error triggering storyboard workflow', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
