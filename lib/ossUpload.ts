import OSS from "ali-oss";

function getOssClient() {
  const region = process.env.ALIYUN_OSS_REGION;
  const bucket = process.env.ALIYUN_OSS_BUCKET;
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;
  const internal = process.env.ALIYUN_OSS_INTERNAL === "true";

  if (!region || !bucket || !accessKeyId || !accessKeySecret) {
    throw new Error("Missing Aliyun OSS environment variables");
  }

  return new OSS({ region, bucket, accessKeyId, accessKeySecret, internal });
}

export async function uploadToOss(
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<{ path: string; publicUrl: string }> {
  const client = getOssClient();
  await client.put(key, body, {
    headers: contentType ? { "Content-Type": contentType } : undefined,
  });

  const cdnHost = (process.env.ALIYUN_OSS_PUBLIC_URL || "").replace(/\/+$/, "");
  const publicUrl = `${cdnHost}/${encodeURI(key)}`;

  return { path: key, publicUrl };
}
