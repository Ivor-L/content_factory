import { getOssClient, getOssPublicUrl } from "./oss";

const DEFAULT_MULTIPART_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20MB
const DEFAULT_MULTIPART_PART_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const DEFAULT_MULTIPART_PARALLEL = 4;
const DEFAULT_OPERATION_TIMEOUT_MS = 180_000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getOssUploadRuntimeOptions() {
  const timeoutMs = parsePositiveInt(
    process.env.ALIYUN_OSS_UPLOAD_TIMEOUT_MS ?? process.env.ALIYUN_OSS_TIMEOUT_MS,
    DEFAULT_OPERATION_TIMEOUT_MS,
  );

  return {
    timeoutMs,
    multipartThresholdBytes: parsePositiveInt(
      process.env.ALIYUN_OSS_MULTIPART_THRESHOLD_BYTES,
      DEFAULT_MULTIPART_THRESHOLD_BYTES,
    ),
    multipartPartSizeBytes: parsePositiveInt(
      process.env.ALIYUN_OSS_MULTIPART_PART_SIZE_BYTES,
      DEFAULT_MULTIPART_PART_SIZE_BYTES,
    ),
    multipartParallel: parsePositiveInt(
      process.env.ALIYUN_OSS_MULTIPART_PARALLEL,
      DEFAULT_MULTIPART_PARALLEL,
    ),
  };
}

export async function uploadToOss(
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<{ path: string; publicUrl: string }> {
  const {
    timeoutMs,
    multipartThresholdBytes,
    multipartPartSizeBytes,
    multipartParallel,
  } = getOssUploadRuntimeOptions();

  const client = getOssClient({ timeoutMs });
  const headers = contentType ? { "Content-Type": contentType } : undefined;

  if (body.byteLength >= multipartThresholdBytes) {
    await client.multipartUpload(key, body, {
      timeout: timeoutMs,
      headers,
      mime: contentType,
      partSize: multipartPartSizeBytes,
      parallel: multipartParallel,
    });
  } else {
    await client.put(key, body, {
      timeout: timeoutMs,
      headers,
    });
  }

  const cdnHost = getOssPublicUrl();
  if (!cdnHost) {
    throw new Error("Missing Aliyun OSS public URL");
  }
  const publicUrl = `${cdnHost}/${encodeURI(key)}`;

  return { path: key, publicUrl };
}
