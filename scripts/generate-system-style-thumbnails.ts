import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_DIR = path.resolve(__dirname, "..", "public", "system-style-previews");
const OUTPUT_DIR = path.join(SOURCE_DIR, "thumbs");
const THUMBNAIL_WIDTH = 480;
const THUMBNAIL_HEIGHT = 600;

const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
  let generated = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!supportedExtensions.has(extension)) continue;

    const sourcePath = path.join(SOURCE_DIR, entry.name);
    const outputName = `${path.basename(entry.name, extension)}.webp`;
    const outputPath = path.join(OUTPUT_DIR, outputName);

    await sharp(sourcePath)
      .rotate()
      .resize({
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
        fit: "cover",
        position: "attention",
        withoutEnlargement: true,
      })
      .webp({ quality: 76, effort: 4 })
      .toFile(outputPath);

    generated += 1;
    console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);
  }

  console.log(`Generated ${generated} system style thumbnail(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
