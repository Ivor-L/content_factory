import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import {
  createReplicationShotTask,
  listReplicationShotTasks,
  updateReplicationShotTask,
  ReplicationShotTaskStatus,
} from '@/lib/replicationShots';
import { triggerReplicationSceneGeneration } from '@/lib/n8n';

const FALLBACK_RATIO = '9:16';

type ImageAsset = {
  url: string;
  base64: string;
  mimeType: string;
};

const textFromJson = (value: string | null | undefined, limit = 600) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
};

const parsePrimaryImage = (images?: string | null): string | null => {
  if (!images) return null;
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (typeof first === 'string') return first;
      if (typeof first?.url === 'string') return first.url;
    }
    if (typeof parsed === 'string' && parsed) return parsed;
  } catch (error) {
    const candidates = images
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }
  return null;
};

async function fetchImageAsBase64(url?: string | null): Promise<ImageAsset | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download ${url}`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    return {
      url,
      base64: buffer.toString('base64'),
      mimeType,
    };
  } catch (error) {
    console.warn(`Unable to fetch image ${url}:`, error);
    return null;
  }
}

function extractPromptFromBlueprint(blueprint?: string | null): string | null {
  if (!blueprint) return null;
  try {
    const parsed = JSON.parse(blueprint);
    const shot =
      parsed?.shots?.[0] ||
      parsed?.sections?.[0] ||
      parsed?.frames?.[0] ||
      parsed?.items?.[0];
    if (shot?.prompt) return String(shot.prompt);
    if (shot?.description) return String(shot.description);
    if (typeof shot === 'string') return shot;
  } catch (error) {
    console.warn('Failed to parse blueprint JSON', error);
  }
  return null;
}

function buildScenePrompt({
  script,
  product,
  character,
}: {
  script: { title: string; breakdown?: string | null; blueprint?: string | null };
  product?: { name?: string | null; description?: string | null; analysisResult?: string | null };
  character?: { name?: string | null };
}) {
  const parts: string[] = [];
  parts.push(`脚本：${script.title}`);
  if (character?.name) {
    parts.push(`角色：${character.name}`);
  }
  if (product?.name) {
    parts.push(`产品：${product.name}`);
  }
  const blueprintPrompt = extractPromptFromBlueprint(script.blueprint);
  if (blueprintPrompt) {
    parts.push(`分镜描述：${blueprintPrompt}`);
  } else if (script.breakdown) {
    parts.push(`脚本拆解：${textFromJson(script.breakdown)}`);
  }
  if (product?.description) {
    parts.push(`产品描述：${textFromJson(product.description)}`);
  }
  if (product?.analysisResult) {
    parts.push(`产品分析：${textFromJson(product.analysisResult, 400)}`);
  }
  return parts.join('\n\n');
}

const parseStatusFilter = (queryValue: string | null): ReplicationShotTaskStatus[] | undefined => {
  if (!queryValue) return undefined;
  const segments = queryValue
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean) as ReplicationShotTaskStatus[];
  return segments.length ? segments : undefined;
};

export async function GET(request: Request) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const tasks = await listReplicationShotTasks({
    userId,
    status: parseStatusFilter(statusParam),
  });

  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const { userId, apiKey } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { scriptId, productId, characterId, ratio } = body;

    if (!scriptId) {
      return NextResponse.json({ error: 'scriptId is required' }, { status: 400 });
    }
    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 });
    }

    const [script, product, character] = await Promise.all([
      prisma.script.findFirst({
        where: { id: scriptId, OR: [{ userId }, { userId: null }] },
        select: {
          id: true,
          title: true,
          breakdown: true,
          blueprint: true,
          videoUrl: true,
        },
      }),
      productId
        ? prisma.product.findFirst({
            where: { id: productId, OR: [{ userId }, { userId: null }] },
            select: {
              id: true,
              name: true,
              description: true,
              analysisResult: true,
              images: true,
            },
          })
        : null,
      prisma.character.findUnique({
        where: { id: characterId },
        select: { id: true, name: true, avatar: true },
      }),
    ]);

    if (!script) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 });
    }
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const task = await createReplicationShotTask({
      scriptId: script.id,
      productId: product?.id,
      characterId: character.id,
      userId,
      status: 'SCENE_GENERATING',
    });

    const [productImage, characterImage] = await Promise.all([
      fetchImageAsBase64(parsePrimaryImage(product?.images)),
      fetchImageAsBase64(character.avatar),
    ]);

    const prompt = buildScenePrompt({
      script,
      product,
      character,
    });

    try {
      await triggerReplicationSceneGeneration({
        taskId: task.id,
        script: {
          id: script.id,
          title: script.title,
          breakdown: script.breakdown ?? null,
          blueprint: script.blueprint ?? null,
        },
        product: product
          ? {
              id: product.id,
              name: product.name ?? null,
              description: product.description ?? null,
              analysisResult: product.analysisResult ?? null,
            }
          : undefined,
        character: {
          id: character.id,
          name: character.name ?? null,
        },
        productImage: productImage ?? undefined,
        characterImage: characterImage ?? undefined,
        prompt,
        ratio: typeof ratio === 'string' && ratio.trim() ? ratio.trim() : FALLBACK_RATIO,
        apiKey: apiKey ?? undefined,
      });
    } catch (triggerError) {
      console.error('Failed to trigger scene workflow', triggerError);
      await updateReplicationShotTask({
        taskId: task.id,
        userId,
        data: { status: 'FAILED' },
      });
      return NextResponse.json(
        { error: 'Failed to trigger scene workflow' },
        { status: 502 }
      );
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Failed to create replication shot task', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
