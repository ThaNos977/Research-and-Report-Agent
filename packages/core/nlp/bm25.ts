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

  private static STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'as', 'at',
    'by', 'for', 'from', 'in', 'into', 'of', 'off', 'on', 'onto', 'over',
    'to', 'up', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'that', 'this', 'these', 'those',
    'it', 'its', 'they', 'them', 'their', 'we', 'our', 'us'
  ]);

  /**
   * Domain-specific tokenizer that preserves numbers and citation markers,
   * with morphological suffix normalization (stemming).
   */
  static tokenize(text: string): string[] {
    // Preserve citation patterns [1], (Author, 2020), percentages, decimals, and alphanumeric tokens
    const rawMatches = text.toLowerCase().match(/\[\d+(?:[-–,\s]+\d+)*\]|\b\d+(?:\.\d+)?%?|\b[a-z0-9_-]+\b/g) || [];
    
    const tokens: string[] = [];
    for (const raw of rawMatches) {
      if (this.STOPWORDS.has(raw)) continue;

      // Keep citations and numeric tokens verbatim
      if (/^\[|\d|%/.test(raw)) {
        tokens.push(raw);
        continue;
      }

      // Morphological suffix stripping (light Porter-style rules for academic vocabulary)
      let stem = raw;
      if (stem.length > 5) {
        if (stem.endsWith('ation')) stem = stem.slice(0, -5) + 'e';
        else if (stem.endsWith('tions') || stem.endsWith('sions')) stem = stem.slice(0, -5);
        else if (stem.endsWith('tion') || stem.endsWith('sion')) stem = stem.slice(0, -4);
        else if (stem.endsWith('ing') && stem.length > 6) stem = stem.slice(0, -3);
        else if (stem.endsWith('ies') && stem.length > 5) stem = stem.slice(0, -3) + 'y';
        else if (stem.endsWith('ed') && stem.length > 5) stem = stem.slice(0, -2);
        else if (stem.endsWith('ment') && stem.length > 6) stem = stem.slice(0, -4);
        else if (stem.endsWith('able') || stem.endsWith('ible')) stem = stem.slice(0, -4);
        else if (stem.endsWith('s') && !stem.endsWith('ss') && stem.length > 3) stem = stem.slice(0, -1);
      }

      tokens.push(stem);
      // Also index original if different for exact match boost
      if (stem !== raw) {
        tokens.push(raw);
      }
    }

    return tokens;
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
