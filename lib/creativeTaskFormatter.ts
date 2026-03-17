import type { LoadedCreativeTask } from "./creativeTaskService";
import { parseMetadata } from "./creativeTaskService";

export function serializeTaskDetail(task: LoadedCreativeTask) {
  return {
    id: task.id,
    title: task.title,
    ideaText: task.ideaText,
    channel: task.channel,
    targetOutput: task.targetOutput,
    stage: task.stage,
    status: task.status,
    goal: task.goal,
    metadata: parseMetadata(task.metadata),
    voiceProfile: task.voiceProfile,
    historyDocs: task.historyDocs.map((item) => item.historyDoc),
    stories: task.stories.map((item) => item.story),
    styles: task.styles.map((item) => item.style),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
