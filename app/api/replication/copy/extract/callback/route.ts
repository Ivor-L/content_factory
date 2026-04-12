import { NextRequest, NextResponse } from "next/server";
import { persistExtractedText } from "../route";

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * n8n calls this endpoint after async video subtitle extraction.
 * Expected body (array or object):
 *   { success: true, transcript: "...", words_estimate: N, language: "...",
 *     script_id?: "...", reference_item_id?: "..." }
 */
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // n8n may wrap the result in an array
  const data = Array.isArray(body) ? body[0] ?? {} : body;
  const nested =
    data && typeof data === "object" && data.data && typeof data.data === "object"
      ? data.data
      : null;

  const extractedText = firstNonEmptyString(
    data?.transcript,
    data?.text,
    data?.result?.text,
    data?.copyText,
    data?.copy_text,
    data?.raw?.text,
    nested?.transcript,
    nested?.text,
    nested?.result?.text,
    nested?.copyText,
    nested?.copy_text,
    nested?.raw?.text,
  );

  if (!extractedText) {
    console.warn("[extract/callback] received empty transcript", { body: data });
    return NextResponse.json({ error: "empty transcript" }, { status: 422 });
  }

  const scriptId = firstNonEmptyString(
    data?.script_id,
    data?.scriptId,
    nested?.script_id,
    nested?.scriptId,
    request.nextUrl.searchParams.get("script_id"),
    request.nextUrl.searchParams.get("scriptId"),
  ) || undefined;

  const referenceItemId = firstNonEmptyString(
    data?.reference_item_id,
    data?.referenceItemId,
    nested?.reference_item_id,
    nested?.referenceItemId,
    request.nextUrl.searchParams.get("reference_item_id"),
    request.nextUrl.searchParams.get("referenceItemId"),
  ) || undefined;

  try {
    await persistExtractedText({ scriptId, referenceItemId, extractedText });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[extract/callback] persist error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "persist failed" },
      { status: 500 },
    );
  }
}
