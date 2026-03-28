import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

type OwnerDescriptor = {
  kind: "user" | "api";
  value: string;
};

const SECRET_SOURCE =
  process.env.SOCIAL_COLLECTOR_SECRET || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "";

function hasSecret(): boolean {
  return SECRET_SOURCE.trim().length > 0;
}

function getKey(): Buffer {
  return createHash("sha256").update(SECRET_SOURCE).digest();
}

const PLAIN_PREFIX = "plain:";

export function encodeOwnerDescriptor(descriptor: OwnerDescriptor): string {
  const payload = JSON.stringify(descriptor);
  if (!hasSecret()) {
    return Buffer.from(`${PLAIN_PREFIX}${payload}`, "utf8").toString("base64url");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64url");
}

export function decodeOwnerDescriptor(token: string): OwnerDescriptor | null {
  if (!token) return null;
  try {
    const buffer = Buffer.from(token, "base64url");
    if (!hasSecret()) {
      const raw = buffer.toString("utf8");
      const jsonStr = raw.startsWith(PLAIN_PREFIX) ? raw.slice(PLAIN_PREFIX.length) : raw;
      return JSON.parse(jsonStr) as OwnerDescriptor;
    }
    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as OwnerDescriptor;
  } catch (error) {
    console.error("[socialCollectorToken] Failed to decode owner descriptor", error);
    return null;
  }
}

export type { OwnerDescriptor };
