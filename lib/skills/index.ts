import { promises as fs } from "node:fs";
import path from "node:path";

export type SkillSource = "builtin" | "user";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  content: string;
  source: SkillSource;
  entryPath: string;
  tags: string[];
}

const USER_SKILL_ROOT = path.join(process.cwd(), "data", "skills");
const REPO_SKILL_ROOT = path.join(process.cwd(), "skills");

function sanitizeSkillId(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function splitCsv(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFrontMatter(raw: string) {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { metadata: {} as Record<string, string>, body: raw };
  }

  const metadata: Record<string, string> = {};
  let i = 1;
  while (i < lines.length) {
    const originalLine = lines[i] ?? "";
    const line = originalLine.trimEnd();
    i += 1;
    if (line.trim() === "---") break;

    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const valuePart = line.slice(idx + 1).trim();

    if (valuePart === "|" || valuePart === ">") {
      const block: string[] = [];
      while (i < lines.length) {
        const blockLine = lines[i] ?? "";
        if (blockLine.trim() === "---") break;
        if (!blockLine.startsWith(" ") && !blockLine.startsWith("\t")) break;
        block.push(blockLine.replace(/^[ \t]/, ""));
        i += 1;
      }
      metadata[key] = block.join("\n").trim();
      continue;
    }

    metadata[key] = valuePart;
  }

  return {
    metadata,
    body: lines.slice(i).join("\n"),
  };
}

function hasFrontMatter(raw: string) {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return false;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === "---") return true;
  }
  return false;
}

function getUserSkillRoot(userId: string) {
  return path.join(USER_SKILL_ROOT, sanitizeSkillId(userId));
}

async function ensureUserSkillRoot(userId: string) {
  await fs.mkdir(getUserSkillRoot(userId), { recursive: true });
}

async function readSkillFromDir(dir: string, source: SkillSource): Promise<SkillDefinition | null> {
  const entryPath = path.join(dir, "SKILL.md");
  try {
    const raw = await fs.readFile(entryPath, "utf-8");
    const { metadata, body } = parseFrontMatter(raw);
    const fallbackName = path.basename(dir);
    const name = (metadata.name || fallbackName).trim();
    const id = sanitizeSkillId(metadata.id || name || fallbackName);
    if (!id || !name) return null;
    const description = (metadata.description || "自定义技能").trim();
    const tags = splitCsv(metadata.tags);
    return {
      id,
      name,
      description,
      content: raw.trim() || body.trim(),
      source,
      entryPath,
      tags,
    };
  } catch {
    return null;
  }
}

export async function listBuiltinSkills(): Promise<SkillDefinition[]> {
  try {
    const entries = await fs.readdir(REPO_SKILL_ROOT, { withFileTypes: true });
    const rows = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readSkillFromDir(path.join(REPO_SKILL_ROOT, entry.name), "builtin")),
    );
    return rows
      .filter((row): row is SkillDefinition => Boolean(row))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  } catch {
    return [];
  }
}

export async function listUserSkills(userId: string): Promise<SkillDefinition[]> {
  await ensureUserSkillRoot(userId);
  const userRoot = getUserSkillRoot(userId);
  const entries = await fs.readdir(userRoot, { withFileTypes: true });
  const rows = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readSkillFromDir(path.join(userRoot, entry.name), "user")),
  );
  return rows
    .filter((row): row is SkillDefinition => Boolean(row))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

export async function listAllSkills(userId?: string | null): Promise<SkillDefinition[]> {
  const [builtinSkills, userSkills] = await Promise.all([
    listBuiltinSkills(),
    userId ? listUserSkills(userId) : Promise.resolve([] as SkillDefinition[]),
  ]);

  const merged = new Map<string, SkillDefinition>();
  for (const skill of builtinSkills) merged.set(skill.name.toLowerCase(), skill);
  for (const skill of userSkills) merged.set(skill.name.toLowerCase(), skill);
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

export async function findSkillByName(name: string, userId?: string | null): Promise<SkillDefinition | null> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  const skills = await listAllSkills(userId);
  return skills.find((skill) => skill.name.toLowerCase() === normalized || skill.id.toLowerCase() === normalized) || null;
}

export async function upsertUserSkill(input: {
  userId: string;
  name: string;
  description?: string;
  content: string;
  tags?: string[];
}): Promise<SkillDefinition> {
  await ensureUserSkillRoot(input.userId);
  const rawInput = input.content.trim();
  const parsed = hasFrontMatter(rawInput) ? parseFrontMatter(rawInput) : null;
  const metadata = parsed?.metadata || {};
  const resolvedName = (metadata.name || input.name || "").trim();
  const id = sanitizeSkillId(metadata.id || resolvedName);
  if (!id) {
    throw new Error("Invalid skill name");
  }
  const dir = path.join(getUserSkillRoot(input.userId), id);
  await fs.mkdir(dir, { recursive: true });
  const entryPath = path.join(dir, "SKILL.md");
  const tags = (input.tags || []).map((t) => t.trim()).filter(Boolean);
  const resolvedTags = tags.length > 0 ? tags : splitCsv(metadata.tags);
  const resolvedDescription = (input.description || metadata.description || "自定义技能").trim();
  const payload = hasFrontMatter(rawInput)
    ? `${rawInput}\n`
    : [
        "---",
        `id: ${id}`,
        `name: ${resolvedName}`,
        `description: ${resolvedDescription}`,
        `tags: ${resolvedTags.join(", ")}`,
        "---",
        "",
        rawInput,
        "",
      ].join("\n");
  await fs.writeFile(entryPath, payload, "utf-8");
  return {
    id,
    name: resolvedName,
    description: resolvedDescription,
    content: payload.trim(),
    source: "user",
    entryPath,
    tags: resolvedTags,
  };
}

export async function removeUserSkill(nameOrId: string, userId: string): Promise<boolean> {
  const id = sanitizeSkillId(nameOrId);
  if (!id) return false;
  const dir = path.join(getUserSkillRoot(userId), id);
  try {
    await fs.rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
