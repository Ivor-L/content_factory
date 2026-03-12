export const dynamic = "force-dynamic";



import prisma from '@/lib/prisma';
import ScriptForm from './Form';


export default async function GenerateFromScriptPage() {
  const scripts = await prisma.script.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      breakdown: true,
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Generate from Script</h1>
      </div>
      <ScriptForm scripts={scripts} />
    </div>
  );
}
