import '../lib/loadEnv';
import prisma from '../lib/prisma';
import { scheduleStylePresetProcessing } from '../lib/assetProcessing';

const styleId = 'e05fb53b-7c12-4e92-aea5-10e4f2f7fe55';

async function main() {
  const style = await prisma.stylePreset.findUnique({ where: { id: styleId } });
  if (!style) {
    throw new Error('Style not found');
  }
  const meta = style.metadata;
  const hasObjectMeta = typeof meta === 'object' && meta !== null && !Array.isArray(meta);
  const base = hasObjectMeta ? { ...(meta as Record<string, any>) } : {};
  const nextMeta = {
    ...base,
    processingStatus: 'PENDING',
    lastError: null,
    failedAt: null,
    workerStartedAt: null,
  };
  await prisma.stylePreset.update({ where: { id: styleId }, data: { metadata: nextMeta } });
  await scheduleStylePresetProcessing(styleId);
  console.log('Requeued style', styleId);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
