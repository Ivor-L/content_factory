export type TaskStatus = "PROCESSING" | "COMPLETED" | "FAILED";

export interface Text2ImagePlanPayload {
  title: string;
  text: string;
  styleId: string;
  styleProfileJson: string;
  imageCount: number;
  language?: string;
}

export interface Text2ImagePlanResponse {
  taskId: string;
  summaryId?: string;
  queued?: boolean;
}

export interface ContentPoint {
  point: string;
  explain: string;
}

export interface KnowledgeSection {
  section_title: string;
  points: ContentPoint[];
}

export interface ImageTextBlocks {
  title: string;
  subtitle: string;
  items: ContentPoint[];
}

export interface ImagePlanItem {
  index: number;
  purpose: "cover" | "section" | "summary" | string;
  layout_hint: string;
  text_blocks: ImageTextBlocks;
  prompt: string;
  negative_prompt: string;
}

export interface LayoutResult {
  content_plan: {
    clean_title: string;
    knowledge_sections: KnowledgeSection[];
    interaction_lines: string[];
  };
  image_plan: {
    aspect_ratio: string;
    count: number;
    reason: string;
    images: ImagePlanItem[];
  };
}

export interface GeneratedImageItem {
  index: number;
  url: string;
  fileName: string;
  mimeType: string;
}

export interface CreativeTaskRecord {
  id: string;
  status: TaskStatus;
  progress: number;
  layout_result_json?: string | null;
  generated_images_json?: string | null;
  error_message?: string | null;
}

export interface StylePresetSummary {
  id: string;
  name: string;
  description?: string | null;
  previewUrl?: string | null;
  metadata?: Record<string, any> | null;
  spec?: Record<string, any> | null;
  status?: string | null;
}
