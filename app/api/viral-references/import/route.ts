import { NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import {
  importViralReferenceQueueItems,
  type RawQueueItem,
} from "@/lib/viralReferenceImporter";

const MAX_BATCH_SIZE = 200;

export async function POST(request: Request) {
  const headerApiKey = request.headers.get("x-user-api-key")?.trim() ?? null;
  const { userId, apiKey } = await getRequestUserContext(request);
  if (!userId && !apiKey) {
    if (headerApiKey) {
      console.warn(
        "[viral-reference-import] Invalid API Key provided:",
        headerApiKey.slice(0, 8) + "...",
      );
      return NextResponse.json(
        {
          error:
            "Invalid API Key. Please check your API Key in the plugin settings. Go to Settings page in the app to find your API Key.",
        },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: "Unauthorized. Please configure your API Key in the plugin settings." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.warn("[viral-reference-import] Invalid JSON body", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = Array.isArray(body) ? body : [body];
  if (payload.length === 0) {
    return NextResponse.json({ error: "Body is empty" }, { status: 400 });
  }

  if (payload.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Batch too large (max ${MAX_BATCH_SIZE})` },
      { status: 413 },
    );
  }

  const ingestionOwner = userId ?? apiKey!;
  const queueItems: RawQueueItem[] = [];
  const errors: Array<{ index: number; reason: string }> = [];

  for (let index = 0; index < payload.length; index += 1) {
    const raw = payload[index];
    if (!raw || typeof raw !== "object") {
      errors.push({ index, reason: "Item is not an object" });
      continue;
    }
    queueItems.push(raw as RawQueueItem);
  }

  const { results, errors: importErrors } = await importViralReferenceQueueItems(
    queueItems,
    ingestionOwner,
  );
  errors.push(...importErrors);

  if (results.length === 0) {
    return NextResponse.json({ error: "No items saved", errors }, { status: 400 });
  }

  return NextResponse.json({ data: results, errors });
}
