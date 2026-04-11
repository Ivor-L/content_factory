import { getOssClient, getOssPublicUrl } from "./oss";

export async function uploadToOss(
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<{ path: string; publicUrl: string }> {
  const client = getOssClient();
  await client.put(key, body, {
    headers: contentType ? { "Content-Type": contentType } : undefined,
  });

  const cdnHost = getOssPublicUrl();
  if (!cdnHost) {
    throw new Error("Missing Aliyun OSS public URL");
  }
  const publicUrl = `${cdnHost}/${encodeURI(key)}`;

  return { path: key, publicUrl };
}
