export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";


interface ScriptDetailPageProps {
  params: Promise<{ id: string }>;
}

import ScriptStatusPoller from "./ScriptStatusPoller";

export default async function ScriptDetailPage({ params }: ScriptDetailPageProps) {
  const { id } = await params;
  
  const script = await prisma.script.findUnique({
    where: { id },
  });

  if (!script) {
    notFound();
  }

  let breakdown: any = null;
  try {
    breakdown = JSON.parse(script.breakdown);
  } catch (e) {
    console.error("Failed to parse breakdown JSON", e);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 font-sans px-4 sm:px-6 lg:px-8">
      <div>
        <Link href="/scripts" className="text-gray-500 hover:text-black flex items-center gap-2 mb-4 w-fit transition-colors group">
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          Back to Scripts
        </Link>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-gray-100 pb-6 mb-8">
            <div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">{script.title}</h1>
                <p className="text-gray-500 mt-2 text-sm font-medium">Created on {new Date(script.createdAt).toLocaleDateString()}</p>
            </div>
            {/* Future: Add Edit/Delete actions here if needed */}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-250px)] min-h-[600px]">
        {/* Left Column: Vertical Video Player (Fixed/Sticky style) */}
        <div className="lg:col-span-4 h-full flex flex-col">
            <div className="bg-black rounded-2xl overflow-hidden shadow-2xl relative h-full w-full flex items-center justify-center bg-gray-900">
                {script.videoUrl ? (
                    <video
                        src={
                          script.videoUrl.includes("supabase-api.atomx.top")
                            ? script.videoUrl
                            : `/api/proxy/download?url=${encodeURIComponent(script.videoUrl)}&filename=${encodeURIComponent((script.title || 'video') + '.mp4')}`
                        }
                        className="w-full h-full object-contain"
                        controls
                        playsInline
                        loop
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-500 gap-3">
                        <span className="text-4xl">🎬</span>
                        <span className="font-medium">No Video Source</span>
                    </div>
                )}
            </div>
        </div>

        {/* Right Column: Breakdown Content (Scrollable) */}
        <div className="lg:col-span-8 h-full overflow-y-auto pr-2 custom-scrollbar">
            <div className="space-y-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-8 w-1 bg-black dark:bg-white rounded-full"></div>
                    <h2 className="text-2xl font-bold text-gray-900">Script Breakdown</h2>
                </div>
                
                {breakdown ? (
                <div className="space-y-6">
                    {breakdown.description && (
                        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                            <h3 className="font-bold text-gray-900 mb-3 text-sm uppercase tracking-wider text-gray-500">Context</h3>
                            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{breakdown.description}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4">
                        <div className="p-6 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                            <h3 className="font-bold text-gray-900 mb-3 text-lg flex items-center gap-3">
                                <span className="bg-gray-900 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">Part 1</span>
                                Hook & Intro
                            </h3>
                            <div className="pl-4 border-l-2 border-gray-100">
                                <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{breakdown.intro || "No intro available"}</p>
                            </div>
                        </div>

                        <div className="p-6 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                            <h3 className="font-bold text-gray-900 mb-3 text-lg flex items-center gap-3">
                                <span className="bg-purple-50 text-purple-600 text-xs font-bold px-3 py-1 rounded-full border border-purple-100 uppercase tracking-wide">Part 2</span>
                                Value & Body
                            </h3>
                            <div className="pl-4 border-l-2 border-gray-100">
                                <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{breakdown.body || "No body available"}</p>
                            </div>
                        </div>

                        <div className="p-6 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                            <h3 className="font-bold text-gray-900 mb-3 text-lg flex items-center gap-3">
                                <span className="bg-green-50 text-green-600 text-xs font-bold px-3 py-1 rounded-full border border-green-100 uppercase tracking-wide">Part 3</span>
                                CTA & Conclusion
                            </h3>
                            <div className="pl-4 border-l-2 border-gray-100">
                                <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{breakdown.conclusion || "No conclusion available"}</p>
                            </div>
                        </div>
                    </div>
                </div>
                ) : (
                    <ScriptStatusPoller scriptId={script.id} initialStatus={script.status} />
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
