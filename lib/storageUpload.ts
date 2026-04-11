import { Buffer } from "node:buffer";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "./supabaseAdmin";
import { uploadToOss } from "./ossUpload";
import { hasOssUploadConfig } from "./oss";

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

  // Use OSS if configured, otherwise fall back to Supabase
  const ossConfigured = hasOssUploadConfig();

  const storagePreference = (process.env.MEDIA_CACHE_STORAGE ?? "auto").toLowerCase();
  const preferOss = storagePreference === "oss" || storagePreference === "auto";

  if (preferOss) {
    if (!ossConfigured) {
      if (storagePreference === "oss") {
        // 明确指定 oss 但未配置，报错
        throw new Error(
          "MEDIA_CACHE_STORAGE is set to oss but Aliyun OSS env vars are missing. " +
            "Please configure ALIYUN_OSS_* before caching media.",
        );
      }
      // auto 模式下 OSS 未配置，静默降级到 Supabase
      console.warn("[storageUpload] OSS not configured, falling back to Supabase storage.");
    } else {
      return uploadToOss(path, dataBuffer, contentType);
    }
  }

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
