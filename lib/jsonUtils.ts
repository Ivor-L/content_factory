import { Prisma } from "@prisma/client";

type JsonPrimitive = string | number | boolean | null;
type JsonSerializable =
  | JsonPrimitive
  | JsonSerializable[]
  | { [key: string]: JsonSerializable };

function normalizeValue(
  input: unknown,
  inArray = false,
): JsonSerializable | undefined {
  if (input === undefined) {
    return inArray ? null : undefined;
  }
  if (input === null) {
    return null;
  }
  if (
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "boolean"
  ) {
    return input;
  }
  if (typeof input === "bigint") {
    return Number(input);
  }
  if (input instanceof Date) {
    return input.toISOString();
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (Array.isArray(input)) {
    return input.map((value) => normalizeValue(value, true) ?? null);
  }
  if (typeof input === "object") {
    const result: Record<string, JsonSerializable> = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
      const normalized = normalizeValue(value, false);
      if (normalized !== undefined) {
        result[key] = normalized;
      }
    }
    return result;
  }
  return String(input);
}

export function toInputJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === Prisma.JsonNull) {
    return value;
  }
  if (value === null) {
    return Prisma.JsonNull;
  }
  return normalizeValue(value) as Prisma.InputJsonValue;
}
