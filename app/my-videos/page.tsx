
import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import { User, Mic, Play, Clock, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';

async function getVideos() {
  const videos = await prisma.digitalHumanVideo.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return videos;
}

export default async function MyVideosPage() {
  const videos = await getVideos();

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-8 flex items-center gap-2 text-gray-900 dark:text-white">
        <User className="text-black dark:text-white" />
        My Videos - Digital Human
      </h1>

      {videos.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">No videos yet. Create one from the Replication module.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => (
            <div key={video.id} className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/80">
                <span className="text-xs font-mono px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 uppercase">
                  {video.type.replace('_', ' ')}
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock size={12} />
                  {formatDistanceToNow(new Date(video.createdAt), { addSuffix: true })}
                </span>
              </div>

              {/* Content Preview */}
              <div className="aspect-video bg-black relative group">
                {video.status === 'COMPLETED' && video.resultUrl ? (
                  <video 
                    src={video.resultUrl} 
                    controls 
                    className="w-full h-full object-contain"
                    poster={video.imageUrl}
                  />
                ) : (
                  <div className="w-full h-full relative">
                    <img 
                      src={video.imageUrl} 
                      alt="Avatar" 
                      className="w-full h-full object-cover opacity-50"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-sm">
                      {video.status === 'GENERATING' ? (
                        <>
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black dark:border-white mb-2"></div>
                          <p className="text-white text-sm font-medium">Generating...</p>
                        </>
                      ) : video.status === 'FAILED' ? (
                        <div className="flex flex-col items-center text-red-400">
                          <AlertTriangle size={24} className="mb-1" />
                          <span className="text-xs font-medium">Failed</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="p-4 space-y-3">
                {/* Audio Preview */}
                <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/30 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                   <div className="h-8 w-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-black dark:text-white shrink-0">
                     <Mic size={14} />
                   </div>
                   <div className="flex-1 min-w-0">
                     <p className="text-xs font-medium truncate text-gray-700 dark:text-gray-300">Reference Audio</p>
                     <audio src={video.audioUrl} controls className="h-6 w-full mt-1" />
                   </div>
                </div>

                {/* Script Preview (Voice Clone) */}
                {video.type === 'VOICE_CLONE' && video.scriptContent && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 bg-gray-50 dark:bg-gray-700/30 p-2 rounded border border-gray-100 dark:border-gray-700 italic">
                    "{video.scriptContent}"
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
