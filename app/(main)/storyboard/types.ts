export interface StoryboardShot {
  id: string;
  order: number;
  label: string;
  title: string | null;
  description: string | null;
  imagePrompt?: string | null;
  videoPrompt: string | null;
  timeRange: string | null;
  duration: number | null;
  imageUrl: string | null;
  videoUrl: string | null;
  referenceThumbs: string[];
  voiceover: string | null;
  status: string | null;
  tags: string[];
  cameraNotes: string | null;
  lightingNotes: string | null;
}

export interface StoryboardTimelineSegment {
  id: string;
  order: number;
  duration: number;
  timeRange?: string | null;
  imagePrompt?: string | null;
  videoPrompt?: string | null;
  generatedImage?: string | null;
  generatedVideo?: string | null;
}

export interface StoryboardTimelineProductMeta {
  name?: string | null;
  images?: string | null;
}

export interface StoryboardHomeTask {
  id: string;
  title: string;
  status: string;
  progress: number | null;
  createdAt: string;
  updatedAt: string;
  totalShots: number;
  estimatedDuration: number | null;
  gridImage: string | null;
  productName: string | null;
  characterName: string | null;
  summaryPrompt: string | null;
  referenceThumbs: string[];
  shots: StoryboardShot[];
  timeline?: unknown;
  timelineSegments: StoryboardTimelineSegment[];
  timelineProduct?: StoryboardTimelineProductMeta | null;
}

export interface StoryboardHomeStats {
  totalTasks: number;
  totalShots: number;
  totalDuration: number;
}
