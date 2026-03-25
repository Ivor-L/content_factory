export interface WritingStyleChunk {
  chunkIndex: number;
  content: string;
  contentLength: number;
}

function normalizeText(input: string) {
  return input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function splitSentences(paragraph: string) {
  return paragraph
    .split(/(?<=[。！？!?；;])/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function chunkWritingStyleText(input: string): WritingStyleChunk[] {
  const text = normalizeText(input);
  if (!text) return [];

  const paragraphs = splitParagraphs(text);
  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    const next = buffer.trim();
    if (next.length >= 40) {
      chunks.push(next);
    }
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    const sentences = splitSentences(paragraph);

    for (const sentence of sentences) {
      if ((buffer + sentence).length > 220) {
        flush();
      }
      buffer += sentence;
      if (buffer.length >= 140) {
        flush();
      }
    }

    flush();
  }

  const finalChunks: string[] = [];

  for (const chunk of chunks) {
    if (chunk.length <= 260) {
      finalChunks.push(chunk);
      continue;
    }
    for (let cursor = 0; cursor < chunk.length; cursor += 220) {
      finalChunks.push(chunk.slice(cursor, cursor + 220));
    }
  }

  return finalChunks
    .map((content, index) => ({
      chunkIndex: index + 1,
      content,
      contentLength: content.length,
    }))
    .filter((chunk) => Boolean(chunk.content.trim()));
}
