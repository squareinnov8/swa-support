/**
 * Text Chunking
 *
 * Splits documents into chunks suitable for embedding and retrieval.
 * Uses a sliding window approach with overlap for better context preservation.
 */

/**
 * Chunk configuration
 */
export const CHUNK_CONFIG = {
  /** Target chunk size in characters */
  maxChunkSize: 1000,
  /** Overlap between chunks in characters */
  overlap: 200,
  /** Minimum chunk size (don't create tiny chunks) */
  minChunkSize: 100,
};

/**
 * A text chunk with metadata
 */
export type Chunk = {
  content: string;
  index: number;
  startOffset: number;
  endOffset: number;
};

/**
 * Split text into chunks with overlap
 */
export function chunkText(
  text: string,
  options: Partial<typeof CHUNK_CONFIG> = {}
): Chunk[] {
  const config = { ...CHUNK_CONFIG, ...options };
  const { maxChunkSize, overlap, minChunkSize } = config;

  if (!text || text.trim().length === 0) {
    return [];
  }

  const trimmedText = text.trim();

  // If text is smaller than max chunk size, return as single chunk
  if (trimmedText.length <= maxChunkSize) {
    return [
      {
        content: trimmedText,
        index: 0,
        startOffset: 0,
        endOffset: trimmedText.length,
      },
    ];
  }

  const chunks: Chunk[] = [];
  let startOffset = 0;
  let index = 0;

  while (startOffset < trimmedText.length) {
    // Calculate end of this chunk
    let endOffset = Math.min(startOffset + maxChunkSize, trimmedText.length);

    // Try to break at a natural boundary (paragraph, sentence, word)
    if (endOffset < trimmedText.length) {
      endOffset = findNaturalBreak(trimmedText, startOffset, endOffset);
    }

    const content = trimmedText.slice(startOffset, endOffset).trim();

    // Only add if meets minimum size (or it's the last chunk)
    if (content.length >= minChunkSize || startOffset + maxChunkSize >= trimmedText.length) {
      chunks.push({
        content,
        index,
        startOffset,
        endOffset,
      });
      index++;
    }

    // Move to next chunk with overlap
    const nextOffset = endOffset - overlap;

    // Ensure we're making progress (avoid infinite loops)
    if (nextOffset <= startOffset) {
      // We've reached the end or would go backwards
      break;
    }

    startOffset = nextOffset;
  }

  return chunks;
}

/**
 * Find a natural break point (paragraph > sentence > word)
 */
function findNaturalBreak(text: string, start: number, maxEnd: number): number {
  const searchWindow = text.slice(start, maxEnd);

  // Try to find paragraph break (double newline)
  const paragraphBreak = searchWindow.lastIndexOf("\n\n");
  if (paragraphBreak > searchWindow.length * 0.5) {
    return start + paragraphBreak + 2;
  }

  // Try to find sentence break (. ! ?)
  const sentenceMatch = searchWindow.match(/[.!?]\s+(?=[A-Z])/g);
  if (sentenceMatch) {
    const lastSentenceEnd = searchWindow.lastIndexOf(sentenceMatch[sentenceMatch.length - 1]);
    if (lastSentenceEnd > searchWindow.length * 0.5) {
      return start + lastSentenceEnd + sentenceMatch[sentenceMatch.length - 1].length;
    }
  }

  // Try to find single newline
  const newlineBreak = searchWindow.lastIndexOf("\n");
  if (newlineBreak > searchWindow.length * 0.5) {
    return start + newlineBreak + 1;
  }

  // Try to find word break (space)
  const wordBreak = searchWindow.lastIndexOf(" ");
  if (wordBreak > searchWindow.length * 0.5) {
    return start + wordBreak + 1;
  }

  // No good break found, just use max
  return maxEnd;
}

/**
 * Chunk a markdown document with section awareness
 */
export function chunkMarkdown(
  markdown: string,
  options: Partial<typeof CHUNK_CONFIG> = {}
): Chunk[] {
  const config = { ...CHUNK_CONFIG, ...options };

  if (!markdown || markdown.trim().length === 0) {
    return [];
  }

  // Split by headers (##, ###, etc.) while keeping the header with content
  const sections = splitByHeaders(markdown);

  const chunks: Chunk[] = [];
  let globalIndex = 0;

  for (const section of sections) {
    // If section is small enough, keep it as one chunk
    if (section.content.length <= config.maxChunkSize) {
      if (section.content.trim().length >= config.minChunkSize) {
        chunks.push({
          content: section.content.trim(),
          index: globalIndex,
          startOffset: section.startOffset,
          endOffset: section.endOffset,
        });
        globalIndex++;
      }
    } else {
      // Section is too large, split it further
      const subChunks = chunkText(section.content, config);
      for (const subChunk of subChunks) {
        chunks.push({
          content: subChunk.content,
          index: globalIndex,
          startOffset: section.startOffset + subChunk.startOffset,
          endOffset: section.startOffset + subChunk.endOffset,
        });
        globalIndex++;
      }
    }
  }

  return chunks;
}

/**
 * Split markdown by headers, keeping header with its content
 */
function splitByHeaders(
  markdown: string
): { content: string; startOffset: number; endOffset: number }[] {
  const headerRegex = /^(#{1,6})\s+.+$/gm;
  const sections: { content: string; startOffset: number; endOffset: number }[] = [];

  let lastIndex = 0;
  let match;

  while ((match = headerRegex.exec(markdown)) !== null) {
    // If there's content before this header, save it
    if (match.index > lastIndex) {
      const content = markdown.slice(lastIndex, match.index).trim();
      if (content.length > 0) {
        sections.push({
          content,
          startOffset: lastIndex,
          endOffset: match.index,
        });
      }
    }
    lastIndex = match.index;
  }

  // Don't forget the last section
  if (lastIndex < markdown.length) {
    const content = markdown.slice(lastIndex).trim();
    if (content.length > 0) {
      sections.push({
        content,
        startOffset: lastIndex,
        endOffset: markdown.length,
      });
    }
  }

  // If no headers found, return the whole document as one section
  if (sections.length === 0 && markdown.trim().length > 0) {
    sections.push({
      content: markdown.trim(),
      startOffset: 0,
      endOffset: markdown.length,
    });
  }

  return sections;
}

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if text would exceed token limit
 */
export function exceedsTokenLimit(text: string, limit: number = 8000): boolean {
  return estimateTokens(text) > limit;
}
