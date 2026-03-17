import { Buffer } from "node:buffer";
import { supabaseAdmin } from "./supabaseAdmin";
import { getAssetBucket } from "./storagePaths";

export interface DownloadedAsset {
  buffer: Buffer;
  contentType?: string;
  size: number;
}

export async function downloadFromStorage(path: string): Promise<DownloadedAsset> {
  const bucket = getAssetBucket();
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Failed to download asset at ${path}: ${error?.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    contentType: (data as Blob).type,
    size: buffer.length,
  };
}
