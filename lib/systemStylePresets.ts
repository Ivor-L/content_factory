import prisma from "@/lib/prisma";

export type SystemStylePreset = {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string;
  spec: Record<string, any>;
  metadata?: Record<string, any>;
  previewUrl?: string;
};

// No more hardcoded system presets — replaced by user-promoted presets.
export const systemStylePresets: SystemStylePreset[] = [];

// IDs of the original hardcoded system presets to clean up from the DB on next boot.
const LEGACY_SYSTEM_PRESET_IDS = [
  "cd5d7c57-dc40-46f5-9db8-bb0534b9b056", // cute
  "ddf9c1d2-17c2-4782-a788-6f84453331cb", // fresh
  "c78fc51a-74a3-44c8-ae56-5923ab674188", // tech
  "6461ba8a-1bc2-4ae9-b4b1-4aa063b5786c", // warm
  "f4223b3d-e12a-4c60-8556-ae8bc5ba9cf6", // bold
  "a3455f92-ca95-45dd-9cdd-6d2172fb0e8f", // minimal
  "518dc6a3-c5d1-4873-9af8-682d7c577fe7", // retro
  "92766c97-3dcb-4da4-897a-5f586e147a79", // pop
  "3a8f6ca1-661d-4b21-acf7-49f25aa520e5", // notion
  "3448ae11-5238-4b80-b683-50447ad1cd8d", // productivity
  "97fa1496-1dec-4165-9362-631fa3e434eb", // insight
  "98c3f88b-1088-4993-bf00-3757ac405617", // sparse
  "9c435c84-042e-4e03-9752-9136ec8eb6ec", // balanced
  "d6b10cd7-d97a-4abd-98e4-24c82adaaf9e", // dense
  "1f9ebf48-f39b-477b-8058-536507892bf6", // list
  "b0468f08-528d-43dd-a466-35ab63cbd85d", // comparison
  "0b09efe2-edb7-4209-8313-43657df52571", // flow
];

const DEPRECATED_DEFAULT_STYLE_PRESET_NAMES = ["复古漫画"];
const DEPRECATED_DEFAULT_STYLE_PRESET_SLUGS = ["retro-comic", "retro_comic"];

let seedPromise: Promise<void> | null = null;

export async function ensureSystemStylePresetsSeeded() {
  if (!seedPromise) {
    seedPromise = seedSystemStylePresets();
  }
  return seedPromise;
}

async function seedSystemStylePresets() {
  // Delete legacy hardcoded system presets from DB (one-time cleanup).
  await prisma.$transaction([
    prisma.stylePreset.deleteMany({
      where: { id: { in: LEGACY_SYSTEM_PRESET_IDS } },
    }),
    prisma.stylePreset.deleteMany({
      where: {
        userId: null,
        name: { in: DEPRECATED_DEFAULT_STYLE_PRESET_NAMES },
      },
    }),
  ]);
}

const readMetadata = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

export function isDeprecatedDefaultStylePreset(style: {
  name?: string | null;
  userId?: string | null;
  metadata?: unknown;
}) {
  if (style.userId) return false;

  const name = typeof style.name === "string" ? style.name.trim() : "";
  if (DEPRECATED_DEFAULT_STYLE_PRESET_NAMES.includes(name)) {
    return true;
  }

  const metadata = readMetadata(style.metadata);
  const slug = typeof metadata.slug === "string" ? metadata.slug.trim() : "";
  return DEPRECATED_DEFAULT_STYLE_PRESET_SLUGS.includes(slug);
}
