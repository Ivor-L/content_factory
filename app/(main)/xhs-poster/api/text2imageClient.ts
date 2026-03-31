'use client';

import { supabase } from '@/lib/supabase';
import type {
  CreativeTaskRecord,
  Text2ImagePlanPayload,
  Text2ImagePlanResponse,
} from '@/types/xhs-text2image';

const PLAN_ENDPOINT = '/api/xhs-text2img/plan';

function buildErrorMessage(response: Response, payload?: any) {
  const base = `Workflow request failed with status ${response.status}`;
  if (payload?.error) return `${base}: ${payload.error}`;
  if (payload?.message) return `${base}: ${payload.message}`;
  return base;
}

export async function startText2ImageTask(
  payload: Text2ImagePlanPayload
): Promise<Text2ImagePlanResponse> {
  const response = await fetch(PLAN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: payload.title,
      text: payload.text,
      styleId: payload.styleId,
      styleProfileJson: payload.styleProfileJson,
      imageCount: payload.imageCount,
      language: payload.language,
    }),
  });

  const payloadJson = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(buildErrorMessage(response, payloadJson));
  }

  const data = payloadJson?.data ?? payloadJson;
  if (!data?.taskId) {
    throw new Error('Invalid plan API response');
  }
  const queued = Boolean(payloadJson?.queued);
  return { ...(data as Text2ImagePlanResponse), queued };
}

export async function fetchCreativeTaskRecord(taskId: string): Promise<CreativeTaskRecord | null> {
  if (!taskId) return null;
  const { data, error } = await supabase
    .from('creative_tasks')
    .select('id,status,progress,layout_result_json,generated_images_json,error_message')
    .eq('id', taskId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to query creative_tasks');
  }

  return (data as CreativeTaskRecord | null) ?? null;
}
