export type ContentType = "auto" | "text" | "markdown";

export type ChunkingOptions = {
  maxChars: number;
  contentType: ContentType;
  framing: {
    enabled: boolean;
    mode: "ack" | "silent";
    text?: string;
  };
};

// Base header: "--- PART 999/999 ---\n" - allow for large chunk counts
const BASE_HEADER_LENGTH = 25;
// Text prefix for default framing messages
const FRAMING_TEXT_PREFIX = "Wait until I send all parts before processing.";

export function detectContentTypeAuto(text: string): "text" | "markdown" {
  // Simple heuristic: if it has code fences or hash headers, it's likely markdown
  if (/```/.test(text) || /^#+\s/m.test(text) || /.*\[.*?\]\(.*?\)/.test(text)) {
    return "markdown";
  }
  return "text";
}

export function chunkText(text: string, opts: ChunkingOptions): string[] {
  let mode = opts.contentType;
  if (mode === "auto") mode = detectContentTypeAuto(text);

  if (mode === "text") return chunkPlaintext(text, opts);
  return chunkMarkdown(text, opts);
}

function getFramingText(opts: ChunkingOptions): string {
  // It is the caller's responsibility to check if framing is enabled.
  if (opts.framing.text) return opts.framing.text;

  return opts.framing.mode === "ack"
    ? `${FRAMING_TEXT_PREFIX} Acknowledge each part with 'ACK' and the part number.\n\n`
    : `${FRAMING_TEXT_PREFIX}\n\n`;
}

function calculateHeaderOverhead(opts: ChunkingOptions): number {
  return opts.framing.enabled
    ? BASE_HEADER_LENGTH + getFramingText(opts).length
    : BASE_HEADER_LENGTH;
}

function getHeader(index: number, total: number, opts: ChunkingOptions): string {
  const header = `--- PART ${index + 1}/${total} ---\n`;
  if (index === 0 && opts.framing.enabled) return header + getFramingText(opts);
  return header;
}

function chunkPlaintext(text: string, opts: ChunkingOptions): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLen = 0;

  const headerOverhead = calculateHeaderOverhead(opts);
  const SAFE_LIMIT = opts.maxChars - headerOverhead;

  for (const line of lines) {
    if (currentLen + line.length + 1 > SAFE_LIMIT && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n"));
      currentChunk = [];
      currentLen = 0;
    }

    if (line.length > SAFE_LIMIT) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n"));
        currentChunk = [];
        currentLen = 0;
      }
      let remainder = line;
      while (remainder.length > SAFE_LIMIT) {
        chunks.push(remainder.substring(0, SAFE_LIMIT));
        remainder = remainder.substring(SAFE_LIMIT);
      }
      currentChunk.push(remainder);
      currentLen = remainder.length;
    } else {
      currentChunk.push(line);
      currentLen += line.length + 1;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n"));
  }

  return chunks.map((c, i) => getHeader(i, chunks.length, opts) + c);
}

function chunkMarkdown(text: string, opts: ChunkingOptions): string[] {
  const headerOverhead = calculateHeaderOverhead(opts);
  const SAFE_LIMIT = opts.maxChars - headerOverhead;

  const lines = text.split("\n");
  const chunks: string[] = [];

  let currentChunk: string[] = [];
  let currentLen = 0;
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  let fenceLang = "";

  for (const line of lines) {
    const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    let isFenceToggle = false;

    if (match) {
      const [_, _indent, chars, info] = match;
      if (!inFence) {
        inFence = true;
        fenceChar = chars[0];
        fenceLen = chars.length;
        fenceLang = info;
        isFenceToggle = true;
      } else {
        if (chars[0] === fenceChar && chars.length >= fenceLen) {
          inFence = false;
          isFenceToggle = true;
        }
      }
    }

    const neededSpace = line.length + 1;
    const effectiveCloseFence = inFence && !isFenceToggle ? `\n${fenceChar.repeat(fenceLen)}` : "";
    const effectiveOpenFence =
      inFence && !isFenceToggle ? `${fenceChar.repeat(fenceLen)}${fenceLang}\n` : "";

    if (currentLen + neededSpace + effectiveCloseFence.length > SAFE_LIMIT) {
      if (inFence && !isFenceToggle) {
        currentChunk.push(effectiveCloseFence.trim());
      }

      chunks.push(currentChunk.join("\n"));

      currentChunk = [];
      currentLen = 0;

      if (inFence && !isFenceToggle) {
        currentChunk.push(effectiveOpenFence.trim());
        currentLen += effectiveOpenFence.trim().length + 1;
      }
    }

    if (line.length > SAFE_LIMIT) {
      if (currentChunk.length > 0) {
        if (inFence && !isFenceToggle) {
          currentChunk.push(effectiveCloseFence.trim());
        }
        chunks.push(currentChunk.join("\n"));
        currentChunk = [];
        currentLen = 0;
      }

      // Split the long line into SAFE_LIMIT-sized pieces
      let remainder = line;
      while (remainder.length > SAFE_LIMIT) {
        chunks.push(remainder.substring(0, SAFE_LIMIT));
        remainder = remainder.substring(SAFE_LIMIT);
      }

      // Start new chunk with remainder (and re-open fence if needed)
      if (inFence && !isFenceToggle) {
        currentChunk.push(effectiveOpenFence.trim());
        currentLen = effectiveOpenFence.trim().length + 1;
      }
      currentChunk.push(remainder);
      currentLen += remainder.length + 1;
    } else {
      currentChunk.push(line);
      currentLen += line.length + 1;
    }
  }

  if (currentChunk.length > 0) chunks.push(currentChunk.join("\n"));
  return chunks.map((c, i) => getHeader(i, chunks.length, opts) + c);
}
