import { Buffer } from "node:buffer";
import { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin, getSupabaseServiceClient } from "./supabaseAdmin";

interface UploadOptions {
  bucket: string;
  path: string;
  body: Buffer | ArrayBuffer;
  contentType?: string;
  upsert?: boolean;
  accessToken?: string | null;
}

export async function uploadToStorage({
  bucket,
  path,
  body,
  contentType,
  upsert = false,
  accessToken,
}: UploadOptions) {
  const dataBuffer =
    body instanceof Buffer ? body : Buffer.from(body as ArrayBuffer);
  const client: SupabaseClient = getSupabaseServiceClient(accessToken);
  const { error } = await client.storage
    .from(bucket)
    .upload(path, dataBuffer, {
      cacheControl: "3600",
      contentType,
      upsert,
    });

  if (error) {
    throw new Error(`Failed to upload asset: ${error.message}`);
  }

  const { data: publicUrlData } = client.storage
    .from(bucket)
    .getPublicUrl(path);

  return {
    path,
    publicUrl: publicUrlData.publicUrl,
  };
}
