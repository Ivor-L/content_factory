import { assetJobNames, enqueueAssetJob } from "./queue";

export async function scheduleHistoryDocProcessing(historyDocId: string) {
  await enqueueAssetJob(assetJobNames.history, { historyDocId });
}

export async function scheduleStoryAssetProcessing(storyId: string) {
  await enqueueAssetJob(assetJobNames.stories, { storyId });
}

export async function scheduleStylePresetProcessing(styleId: string) {
  await enqueueAssetJob(assetJobNames.styles, { styleId });
}
