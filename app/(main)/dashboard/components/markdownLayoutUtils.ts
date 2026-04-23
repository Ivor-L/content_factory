'use client';

export function getFileTitleFromPath(path?: string | null) {
  if (!path) return '未命名文档';
  const file = path.split('/').pop() || path;
  return file.replace(/\.[^.]+$/, '') || file;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripFrontmatter(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return normalized;
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) return normalized;
  return normalized.slice(end + 5);
}

function renderInlineMarkdown(input: string) {
  const escaped = escapeHtml(input);
  const withCode = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  const withBold = withCode.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const withItalic = withBold.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  const withLink = withItalic.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return withLink;
}

export function markdownToSimpleHtml(markdown: string) {
  const body = stripFrontmatter(markdown);
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const block: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        block.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      html.push(`<pre><code>${escapeHtml(block.join('\n'))}</code></pre>`);
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = Math.max(1, Math.min(6, headingMatch[1].length));
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html.push('<hr />');
      i += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote><p>${quoteLines.map((item) => renderInlineMarkdown(item)).join('<br />')}</p></blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^[-*]\s+(.+)$/.exec(lines[i].trim());
        if (!m) break;
        items.push(`<li>${renderInlineMarkdown(m[1])}</li>`);
        i += 1;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\d+\.\s+(.+)$/.exec(lines[i].trim());
        if (!m) break;
        items.push(`<li>${renderInlineMarkdown(m[1])}</li>`);
        i += 1;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next) break;
      if (
        /^#{1,6}\s+/.test(next) ||
        /^[-*]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        next.startsWith('>') ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(next) ||
        next.startsWith('```')
      ) {
        break;
      }
      paragraph.push(lines[i]);
      i += 1;
    }
    html.push(`<p>${paragraph.map((item) => renderInlineMarkdown(item)).join('<br />')}</p>`);
  }

  return html.join('\n');
}

export function markdownToPlainText(markdown: string) {
  return stripFrontmatter(markdown)
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildWechatExportHtml(title: string, contentHtml: string, fontScale: number) {
  const scaledFont = (17 * fontScale / 100).toFixed(2);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 24px; background: #ececec; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; color: #222; }
    .article { max-width: 760px; margin: 0 auto; border: 1px solid #d8d8d8; border-radius: 10px; background: #fff; padding: 28px; line-height: 1.8; font-size: ${scaledFont}px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .article h1 { margin: 0 0 16px; padding-bottom: 16px; border-bottom: 1px solid #efefef; font-size: 32px; line-height: 1.22; font-weight: 800; color: #111; }
    .article h2 { margin: 30px 0 12px; font-size: 25px; font-weight: 700; color: #111; }
    .article h3 { margin: 22px 0 10px; font-size: 21px; font-weight: 600; color: #111; }
    .article p { margin: 18px 0; }
    .article ul,.article ol { margin: 18px 0; padding-left: 24px; }
    .article blockquote { margin: 20px 0; border-left: 4px solid #07c160; background: #f6fffa; border-radius: 8px; padding: 12px 14px; }
    .article code { background: #f5f5f5; border-radius: 4px; padding: 1px 6px; font-size: .92em; }
    .article pre { margin: 20px 0; overflow: auto; background: #f7f7f9; border-radius: 8px; padding: 14px; }
    .article pre code { background: transparent; padding: 0; }
    .article a { color: #576b95; text-decoration: none; }
    .article hr { border: 0; border-top: 1px solid #e6e6e6; margin: 28px 0; }
  </style>
</head>
<body>
  <article class="article">
    <h1>${escapeHtml(title)}</h1>
    ${contentHtml}
  </article>
</body>
</html>`;
}

export function buildXhsExportHtml(title: string, contentHtml: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 24px; background: linear-gradient(135deg, #fff8f2, #ffe9dd); font-family: "PingFang SC", -apple-system, sans-serif; color: #2b2b2b; }
    .card { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #ffd9c7; border-radius: 20px; box-shadow: 0 14px 40px rgba(255,138,84,0.15); padding: 28px; }
    .card h1 { margin: 0 0 18px; font-size: 34px; line-height: 1.2; font-weight: 800; color: #111; }
    .card h2 { margin: 26px 0 12px; font-size: 27px; line-height: 1.28; font-weight: 700; color: #1f2937; }
    .card h3 { margin: 20px 0 10px; font-size: 22px; line-height: 1.34; font-weight: 700; color: #334155; }
    .card p { margin: 16px 0; font-size: 18px; line-height: 1.9; }
    .card ul,.card ol { margin: 16px 0; padding-left: 26px; font-size: 18px; line-height: 1.9; }
    .card blockquote { margin: 18px 0; padding: 12px 14px; border-left: 4px solid #ff7a45; background: #fff5ee; border-radius: 8px; }
    .card code { background: #fff1e7; border-radius: 4px; padding: 1px 6px; }
    .card pre { background: #fff4ee; border-radius: 10px; padding: 14px; overflow: auto; }
    .hashtags { margin-top: 24px; color: #ff7a45; font-size: 15px; }
  </style>
</head>
<body>
  <article class="card">
    <h1>${escapeHtml(title)}</h1>
    ${contentHtml}
    <p class="hashtags">#小红书文案 #内容创作 #排版预览</p>
  </article>
</body>
</html>`;
}
