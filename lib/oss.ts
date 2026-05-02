import OSS from "ali-oss";

function trimUrl(value: string | undefined | null): string {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeRegion(region: string): string {
  return trimUrl(region)
    .replace(/^https?:\/\//i, "")
    .replace(/\.aliyuncs\.com$/i, "");
}

export function getOssUploadConfig() {
  const region = trimUrl(process.env.ALIYUN_OSS_REGION);
  const bucket = trimUrl(process.env.ALIYUN_OSS_BUCKET);
  const accessKeyId = trimUrl(process.env.ALIYUN_OSS_ACCESS_KEY_ID);
  const accessKeySecret = trimUrl(process.env.ALIYUN_OSS_ACCESS_KEY_SECRET);
  const internal = process.env.ALIYUN_OSS_INTERNAL === "true";

  return {
    region,
    bucket,
    accessKeyId,
    accessKeySecret,
    internal,
  };
}

export function hasOssUploadConfig(): boolean {
  const { region, bucket, accessKeyId, accessKeySecret } = getOssUploadConfig();
  return Boolean(region && bucket && accessKeyId && accessKeySecret);
}

export function getOssClient(options?: {
  internal?: boolean;
  secure?: boolean;
  timeoutMs?: number;
}) {
  const { region, bucket, accessKeyId, accessKeySecret, internal } = getOssUploadConfig();

  if (!region || !bucket || !accessKeyId || !accessKeySecret) {
    throw new Error("Missing Aliyun OSS environment variables");
  }

  const timeoutMs =
    options?.timeoutMs ??
    parsePositiveInt(process.env.ALIYUN_OSS_TIMEOUT_MS, 180_000);

  return new OSS({
    region,
    bucket,
    accessKeyId,
    accessKeySecret,
    internal: options?.internal ?? internal,
    secure: options?.secure ?? false,
    timeout: timeoutMs,
  });
}

export function getOssPublicUrl(): string {
  const explicit = trimUrl(process.env.ALIYUN_OSS_PUBLIC_URL);
  if (explicit) return explicit;

  const { region, bucket } = getOssUploadConfig();
  if (!region || !bucket) return "";

  const normalizedRegion = normalizeRegion(region);
  if (!normalizedRegion) return "";

  return `https://${bucket}.${normalizedRegion}.aliyuncs.com`;
}

export function isOssHostname(hostname: string): boolean {
  const cleanHost = String(hostname || "").trim().toLowerCase();
  return cleanHost.endsWith(".aliyuncs.com");
}
