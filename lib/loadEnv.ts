import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

const envFiles = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
];

for (const filename of envFiles) {
  const filePath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(filePath)) {
    config({ path: filePath, override: true });
  }
}
