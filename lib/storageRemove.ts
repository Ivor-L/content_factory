import { supabaseAdmin } from "./supabaseAdmin";
import { getAssetBucket } from "./storagePaths";

function sanitizePaths(paths: Array<string | null | undefined>) {
  return paths.filter(
    (path): path is string => typeof path === "string" && path.trim().length > 0
  );
}

export async function removeAssetFiles(
  paths: Array<string | null | undefined>
) {
  const targets = sanitizePaths(paths);
  if (!targets.length) return;

  const { error } = await supabaseAdmin.storage
    .from(getAssetBucket())
    .remove(targets);
  if (error) {
    console.error("Failed to remove asset files from storage", error);
  }
}
