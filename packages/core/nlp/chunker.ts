import { DocChunk, ParagraphInfo, Locator } from '../types';

export interface ChunkerOptions {
  maxChunkSize?: number;    // approximate character budget (default: 800)
  overlap?: number;         // overlap characters between chunks (default: 100)
}

export class StructureAwareChunker {
  /**
   * Deterministic DJB2 hash for text content and context tracking.
   */
  static hashText(text: string): string {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Splits a document's paragraphs into structure-aware chunks.
   * Preserves heading hierarchy and anchors each chunk to a Locator.
   */
  static chunkDocument(
    paragraphs: ParagraphInfo[],
    options: ChunkerOptions = {}
  ): DocChunk[] {
    const maxChunkSize = options.maxChunkSize ?? 800;
    const overlap = options.overlap ?? 100;

    const chunks: DocChunk[] = [];
    let currentHeadingPath: string[] = [];
    let chunkSeq = 1;

    let buffer = '';
    let bufferStartParagraph = 0;
    let bufferLocator: Locator | null = null;

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const text = p.text.trim();
      if (!text) continue;

      // Check if paragraph is a heading
      if (p.headingLevel && p.headingLevel > 0) {
        // Flush buffer if we hit a new heading
        if (buffer.trim()) {
          const content = buffer.trim();
          chunks.push({
            id: `chunk_${chunkSeq++}`,
            text: content,
            headingPath: [...currentHeadingPath],
            locator: bufferLocator || p.locator,
            contentHash: this.hashText(content),
          });
          buffer = '';
          bufferLocator = null;
        }

        // Adjust heading path based on headingLevel
        const level = p.headingLevel;
        currentHeadingPath = currentHeadingPath.slice(0, level - 1);
        currentHeadingPath[level - 1] = text;
        continue;
      }

      // If buffer is empty, initialize locator
      if (!buffer) {
        bufferStartParagraph = i;
        bufferLocator = {
          ...p.locator,
          paragraphIndex: i,
          startsWith: text.slice(0, 40),
          contextHash: this.hashText(text),
        };
      }

      // Check if adding paragraph exceeds budget
      if (buffer.length + text.length + 1 > maxChunkSize && buffer.length > 0) {
        const content = buffer.trim();
        chunks.push({
          id: `chunk_${chunkSeq++}`,
          text: content,
          headingPath: [...currentHeadingPath],
          locator: bufferLocator || p.locator,
          contentHash: this.hashText(content),
        });

        // Compute overlap from tail of previous buffer
        const overlapText = overlap > 0 ? content.slice(-overlap) : '';
        buffer = overlapText ? `${overlapText}\n${text}` : text;
        bufferStartParagraph = i;
        bufferLocator = {
          ...p.locator,
          paragraphIndex: i,
          startsWith: text.slice(0, 40),
          contextHash: this.hashText(text),
        };
      } else {
        buffer = buffer ? `${buffer}\n${text}` : text;
      }
    }

    // Flush any remaining buffer
    if (buffer.trim()) {
      const content = buffer.trim();
      chunks.push({
        id: `chunk_${chunkSeq++}`,
        text: content,
        headingPath: [...currentHeadingPath],
        locator: bufferLocator || {
          host: 'mock',
          paragraphIndex: bufferStartParagraph,
          startsWith: content.slice(0, 40),
          contextHash: this.hashText(content),
        },
        contentHash: this.hashText(content),
      });
    }

    return chunks;
  }
}
