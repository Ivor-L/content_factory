const DEFAULT_IMAGE_BASE_URL = "https://yunwu.ai/v1beta";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

type GenerateImageOptions = {
  prompt: string;
  aspectRatio?: string;
};

type CloudImageResult = {
  dataUrl: string;
  mimeType: string;
};

function getImageEndpoint() {
  const base =
    process.env.CLOUD_IMAGE_BASE_URL ||
    process.env.CLOUD_API_BASE_URL ||
    DEFAULT_IMAGE_BASE_URL;
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const model =
    process.env.CLOUD_IMAGE_MODEL ||
    process.env.CLOUD_DEFAULT_IMAGE_MODEL ||
    DEFAULT_IMAGE_MODEL;
  return `${normalizedBase}/models/${model}:generateContent`;
}

function extractInlineImage(payload: any) {
  const candidates = payload?.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const parts = candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        const inline =
          part?.inline_data ||
          part?.inlineData ||
          part?.inlineDataV2 ||
          part?.inlineDataV1;
        if (inline?.data) {
          return {
            data: String(inline.data),
            mimeType: inline.mimeType || "image/png",
          };
        }
      }
    }
  }
  if (payload?.image?.data) {
    return { data: String(payload.image.data), mimeType: payload.image.mimeType || "image/png" };
  }
  if (payload?.data?.image) {
    return { data: String(payload.data.image), mimeType: payload.data.mimeType || "image/png" };
  }
  return null;
}

export async function generateImageFromPrompt({
  prompt,
  aspectRatio = "3:4",
}: GenerateImageOptions): Promise<CloudImageResult> {
  if (!process.env.CLOUD_API_KEY) {
    throw new Error("CLOUD_API_KEY is not configured");
  }

  const endpoint = getImageEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CLOUD_API_KEY}`,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Image generation failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const inlineImage = extractInlineImage(payload);
  if (!inlineImage) {
    throw new Error("Image generation response did not include image data");
  }

  const normalizedData = inlineImage.data.replace(/^data:.*;base64,/, "");
  return {
    dataUrl: `data:${inlineImage.mimeType};base64,${normalizedData}`,
    mimeType: inlineImage.mimeType || "image/png",
  };
}
