import { NextRequest, NextResponse } from "next/server";
import { persistExtractedText } from "../route";

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

  const extractedText: string =
    typeof data.transcript === "string" ? data.transcript.trim() :
    typeof data.text === "string" ? data.text.trim() :
    typeof data.raw?.text === "string" ? data.raw.text.trim() : "";

  if (!extractedText) {
    console.warn("[extract/callback] received empty transcript");
    return NextResponse.json({ error: "empty transcript" }, { status: 422 });
  }

  const scriptId = typeof data.script_id === "string" && data.script_id ? data.script_id : undefined;
  const referenceItemId = typeof data.reference_item_id === "string" && data.reference_item_id ? data.reference_item_id : undefined;

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
