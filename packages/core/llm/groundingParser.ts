import { ClaimEvidence } from '../types';

export interface RawGroundingMetadata {
  webSearchQueries?: string[];
  searchEntryPoint?: { renderedContent?: string };
  groundingChunks?: Array<{
    web?: {
      uri?: string;
      title?: string;
    };
  }>;
  groundingSupports?: Array<{
    segment?: {
      startIndex?: number;
      endIndex?: number;
      text?: string;
    };
    groundingChunkIndices?: number[];
    confidenceScores?: number[];
  }>;
}

export class GroundingMetadataParser {
  /**
   * Extract all verified source evidence directly from API grounding metadata.
   * Hard requirement: URLs and evidence snippets come strictly from grounding metadata,
   * never model-generated text.
   */
  static extractEvidence(metadata?: RawGroundingMetadata): ClaimEvidence[] {
    if (!metadata || !metadata.groundingChunks || metadata.groundingChunks.length === 0) {
      return [];
    }

    const evidenceList: ClaimEvidence[] = [];
    const chunkMap = new Map<number, { title: string; url: string; snippets: string[] }>();

    metadata.groundingChunks.forEach((chunk, idx) => {
      const title = chunk.web?.title || 'Web Reference';
      const url = chunk.web?.uri || '';
      if (url) {
        chunkMap.set(idx, { title, url, snippets: [] });
      }
    });

    // Correlate snippets from groundingSupports if available
    if (metadata.groundingSupports) {
      for (const support of metadata.groundingSupports) {
        const text = support.segment?.text?.trim();
        if (text && support.groundingChunkIndices) {
          for (const idx of support.groundingChunkIndices) {
            const entry = chunkMap.get(idx);
            if (entry && !entry.snippets.includes(text)) {
              entry.snippets.push(text);
            }
          }
        }
      }
    }

    // Build evidence list
    for (const [_, item] of chunkMap.entries()) {
      const snippet = item.snippets.length > 0
        ? item.snippets.join(' ')
        : `Verified web reference retrieved during grounded search for: ${item.title}`;
      evidenceList.push({
        title: item.title,
        url: item.url,
        snippet,
      });
    }

    return evidenceList;
  }

  /**
   * Token-based fuzzy title similarity to verify reference existence against search grounding.
   */
  static fuzzyTitleMatch(titleA: string, titleB: string): number {
    const clean = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2);

    const tokensA = new Set(clean(titleA));
    const tokensB = new Set(clean(titleB));

    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let overlap = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) overlap++;
    }

    const jaccard = overlap / (tokensA.size + tokensB.size - overlap);
    return jaccard;
  }
}
