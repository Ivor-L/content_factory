export type MarkdownFrontmatterValue = string | string[] | number | boolean | null;

export interface MarkdownFrontmatterEntry {
  key: string;
  value: MarkdownFrontmatterValue;
}

export interface SplitMarkdownDocumentResult {
  hasFrontmatter: boolean;
  frontmatter: MarkdownFrontmatterEntry[];
  body: string;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(raw: string): MarkdownFrontmatterValue {
  const value = stripQuotes(raw);
  if (value === "" || value === "~" || value.toLowerCase() === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
  }
  return value;
}

function parseInlineArray(raw: string): string[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((item) => stripQuotes(item))
    .filter(Boolean);
}

export function splitMarkdownDocument(content: string): SplitMarkdownDocumentResult {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { hasFrontmatter: false, frontmatter: [], body: content };
  }

  const lines = match[1].split(/\r?\n/);
  const frontmatter: MarkdownFrontmatterEntry[] = [];
  let pendingKey: string | null = null;
  let pendingList: string[] | null = null;

  const commitPending = () => {
    if (!pendingKey) return;
    if (pendingList) {
      frontmatter.push({ key: pendingKey, value: pendingList });
    } else {
      frontmatter.push({ key: pendingKey, value: "" });
    }
    pendingKey = null;
    pendingList = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (pendingKey && pendingList) {
      const itemMatch = line.match(/^\s*-\s*(.*)$/);
      if (itemMatch) {
        pendingList.push(String(parseScalar(itemMatch[1])));
        continue;
      }
      commitPending();
    }

    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;

    const key = kv[1];
    const value = kv[2].trim();

    commitPending();

    const inlineArray = parseInlineArray(value);
    if (inlineArray) {
      frontmatter.push({ key, value: inlineArray });
      continue;
    }

    if (value === "") {
      pendingKey = key;
      pendingList = [];
      continue;
    }

    frontmatter.push({ key, value: parseScalar(value) });
  }

  commitPending();

  const body = content.slice(match[0].length);
  return {
    hasFrontmatter: true,
    frontmatter,
    body,
  };
}
