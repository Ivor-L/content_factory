import type { StyleRules } from "@/types/creative";

export function sanitizeStyleRules(input: unknown): StyleRules | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("styleRules must be a JSON object or null");
  }
  return JSON.parse(JSON.stringify(input));
}
