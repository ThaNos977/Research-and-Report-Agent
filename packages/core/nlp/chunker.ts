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
   * Breaks oversized paragraphs by sentence boundaries to strictly respect character budgets.
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

    const flushBuffer = () => {
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
        buffer = '';
        bufferLocator = null;
      }
    };

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const text = p.text.trim();
      if (!text) continue;

      // Check if paragraph is a heading
      if (p.headingLevel && p.headingLevel > 0) {
        flushBuffer();

        // Adjust heading path based on headingLevel
        const level = Math.max(1, p.headingLevel);
        currentHeadingPath = currentHeadingPath.slice(0, level - 1);
        currentHeadingPath[level - 1] = text;
        continue;
      }

      // If a single paragraph exceeds maxChunkSize, break it by sentences
      if (text.length > maxChunkSize) {
        flushBuffer();

        // Split paragraph by sentence boundaries
        const sentences = text.match(/[^.!?]+(?:[.!?]+["']?|\s*$)/g) || [text];
        let subBuffer = '';
        let subBufferStart = 0;

        for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
          const sent = sentences[sIdx].trim();
          if (!sent) continue;

          if (subBuffer.length + sent.length + 1 > maxChunkSize && subBuffer.length > 0) {
            const subContent = subBuffer.trim();
            chunks.push({
              id: `chunk_${chunkSeq++}`,
              text: subContent,
              headingPath: [...currentHeadingPath],
              locator: {
                ...p.locator,
                paragraphIndex: i,
                startsWith: subContent.slice(0, 40),
                contextHash: this.hashText(subContent),
              },
              contentHash: this.hashText(subContent),
            });

            const overlapText = overlap > 0 ? subContent.slice(-overlap) : '';
            subBuffer = overlapText ? `${overlapText} ${sent}` : sent;
            subBufferStart = sIdx;
          } else {
            subBuffer = subBuffer ? `${subBuffer} ${sent}` : sent;
          }
        }

        if (subBuffer.trim()) {
          const subContent = subBuffer.trim();
          chunks.push({
            id: `chunk_${chunkSeq++}`,
            text: subContent,
            headingPath: [...currentHeadingPath],
            locator: {
              ...p.locator,
              paragraphIndex: i,
              startsWith: subContent.slice(0, 40),
              contextHash: this.hashText(subContent),
            },
            contentHash: this.hashText(subContent),
          });
        }
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
    flushBuffer();

    return chunks;
  }
}
