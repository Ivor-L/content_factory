import { EventEmitter } from 'events';
import type { StoryboardTask } from '@prisma/client';

const EVENT_NAME = 'storyboard_task_event';

type SerializableDate = string | Date;

export type SerializableStoryboardTask = Omit<StoryboardTask, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

export type StoryboardTaskEvent =
  | { type: 'upsert'; task: SerializableStoryboardTask }
  | { type: 'delete'; taskId: string };

const getGlobalEmitter = (): EventEmitter => {
  const globalObject = globalThis as typeof globalThis & {
    __storyboardTaskEmitter?: EventEmitter;
  };
  if (!globalObject.__storyboardTaskEmitter) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0); // Allow many listeners across dev hot reloads
    globalObject.__storyboardTaskEmitter = emitter;
  }
  return globalObject.__storyboardTaskEmitter;
};

const emitter = getGlobalEmitter();

const toIsoString = (value: SerializableDate): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
};

export function serializeStoryboardTask(task: StoryboardTask): SerializableStoryboardTask {
  return {
    ...task,
    createdAt: toIsoString(task.createdAt),
    updatedAt: toIsoString(task.updatedAt),
  };
}

export function emitStoryboardTaskUpsert(task: StoryboardTask) {
  emitter.emit(EVENT_NAME, { type: 'upsert', task: serializeStoryboardTask(task) } satisfies StoryboardTaskEvent);
}

export function emitStoryboardTaskDelete(taskId: string) {
  emitter.emit(EVENT_NAME, { type: 'delete', taskId } satisfies StoryboardTaskEvent);
}

export function subscribeStoryboardTasks(listener: (event: StoryboardTaskEvent) => void) {
  emitter.on(EVENT_NAME, listener);
  return () => {
    emitter.off(EVENT_NAME, listener);
  };
}
