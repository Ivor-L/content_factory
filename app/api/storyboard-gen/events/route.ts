import prisma from '@/lib/prisma';
import {
  subscribeStoryboardTasks,
  serializeStoryboardTask,
  type StoryboardTaskEvent,
} from '@/lib/storyboardEvents';

export const runtime = 'nodejs';

const encoder = new TextEncoder();

const formatSse = (event: string, data: unknown) => {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

export async function GET(request: Request) {
  const initialTasks = await prisma.storyboardTask.findMany({
    orderBy: { createdAt: 'desc' },
  });
  const serializedInitial = initialTasks.map(serializeStoryboardTask);

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(formatSse('initial', serializedInitial));

      const unsubscribe = subscribeStoryboardTasks((event: StoryboardTaskEvent) => {
        controller.enqueue(formatSse('task', event));
      });

      const keepAlive = setInterval(() => {
        controller.enqueue(formatSse('ping', { ts: Date.now() }));
      }, 30000);

      cleanup = () => {
        clearInterval(keepAlive);
        unsubscribe();
      };

      const abortHandler = () => {
        cleanup?.();
        controller.close();
      };

      request.signal.addEventListener('abort', abortHandler, { once: true });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
