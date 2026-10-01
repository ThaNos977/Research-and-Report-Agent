import { DocChunk } from '../types';

export interface BM25Result {
  chunk: DocChunk;
  score: number;
}

export class BM25Index {
  private k1: number;
  private b: number;
  private chunks: DocChunk[] = [];
  private docTokens: string[][] = [];
  private docLengths: number[] = [];
  private avgDocLength = 0;
  private docFrequencies: Map<string, number> = new Map();
  private numDocs = 0;

  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  /**
   * Domain-specific tokenizer that preserves numbers and citation markers.
   */
  static tokenize(text: string): string[] {
    // Preserve citation patterns [1], (Author, 2020), percentages, decimals, and alphanumeric tokens
    const matches = text.toLowerCase().match(/\[\d+(?:[-–,\s]+\d+)*\]|\b\d+(?:\.\d+)?%?|\b[a-z0-9_-]+\b/g);
    return matches || [];
  }

  buildIndex(chunks: DocChunk[]) {
    this.chunks = chunks;
    this.numDocs = chunks.length;
    this.docTokens = [];
    this.docLengths = [];
    this.docFrequencies.clear();

    let totalLength = 0;

    for (const chunk of chunks) {
      const tokens = BM25Index.tokenize(chunk.text);
      this.docTokens.push(tokens);
      this.docLengths.push(tokens.length);
      totalLength += tokens.length;

      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        this.docFrequencies.set(token, (this.docFrequencies.get(token) || 0) + 1);
      }
    }

    this.avgDocLength = this.numDocs > 0 ? totalLength / this.numDocs : 1;
  }

  private getIdf(token: string): number {
    const df = this.docFrequencies.get(token) || 0;
    // Robertson-Spärck Jones IDF formula with smoothing
    return Math.log((this.numDocs - df + 0.5) / (df + 0.5) + 1);
  }

  search(query: string, topK = 5): BM25Result[] {
    const queryTokens = BM25Index.tokenize(query);
    if (queryTokens.length === 0 || this.numDocs === 0) {
      return [];
    }

    const scores: { index: number; score: number }[] = [];

    for (let i = 0; i < this.numDocs; i++) {
      const tokens = this.docTokens[i];
      const docLength = this.docLengths[i];
      let score = 0;

      // Count term frequencies in this document
      const tfMap = new Map<string, number>();
      for (const t of tokens) {
        tfMap.set(t, (tfMap.get(t) || 0) + 1);
      }

      for (const q of queryTokens) {
        const tf = tfMap.get(q) || 0;
        if (tf > 0) {
          const idf = this.getIdf(q);
          const numerator = tf * (this.k1 + 1);
          const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
          score += idf * (numerator / denominator);
        }
      }

      if (score > 0) {
        scores.push({ index: i, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, topK).map((item) => ({
      chunk: this.chunks[item.index],
      score: item.score,
    }));
  }
}
