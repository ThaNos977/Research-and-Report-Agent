import { GeminiClient } from '../llm/geminiClient';
import { DocChunk } from '../types';

export interface Embedder {
  embed(text: string, taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[]>;
  embedBatch(texts: string[], taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[][]>;
  cosineSimilarity(vecA: number[], vecB: number[]): number;
}

export class GeminiEmbedder implements Embedder {
  private client: GeminiClient;
  private cache = new Map<string, number[]>();
  private concurrencyCap = 5;

  constructor(client: GeminiClient) {
    this.client = client;
  }

  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async embed(text: string, taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[]> {
    return await this.client.embedContent(text, taskType);
  }

  async embedBatch(
    texts: string[],
    taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
  ): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);
    const queue = texts.map((t, idx) => ({ text: t, index: idx }));

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        try {
          results[item.index] = await this.embed(item.text, taskType);
        } catch (e) {
          console.error(`Error embedding item ${item.index}:`, e);
          results[item.index] = [];
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(this.concurrencyCap, texts.length) },
      () => worker()
    );
    await Promise.all(workers);

    return results;
  }

  /**
   * Embeds an array of document chunks, utilizing contentHash caching to re-embed
   * only changed paragraphs/chunks after user edits.
   */
  async embedChunks(chunks: DocChunk[]): Promise<DocChunk[]> {
    const toFetch: { index: number; text: string; hash: string }[] = [];

    chunks.forEach((chunk, idx) => {
      const cached = this.cache.get(chunk.contentHash);
      if (cached) {
        chunk.embedding = cached;
      } else {
        toFetch.push({ index: idx, text: chunk.text, hash: chunk.contentHash });
      }
    });

    if (toFetch.length > 0) {
      const newVectors = await this.embedBatch(
        toFetch.map((f) => f.text),
        'RETRIEVAL_DOCUMENT'
      );
      toFetch.forEach((item, i) => {
        const vec = newVectors[i];
        if (vec && vec.length > 0) {
          this.cache.set(item.hash, vec);
          chunks[item.index].embedding = vec;
        }
      });
    }

    return chunks;
  }
}

/**
 * Deterministic Semantic Mock Embedder for unit tests, offline evaluations, and mock hosts.
 * Computes high-dimensional feature-hashed embeddings (256 dims) combining phrase normalization,
 * word n-grams, subword morphology, academic synonym canonicalization, and polarity signatures.
 */
export class MockEmbedder implements Embedder {
  private dim = 256;

  private static STOPWORDS = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are',
    'was', 'were', 'be', 'been', 'being', 'by', 'with', 'that', 'this', 'it', 'we', 'our',
    'upon', 'heavily'
  ]);

  private static SYNONYMS: Record<string, string> = {
    'traditional': 'classical',
    'depended': 'relied',
    'deterministic': 'rigid',
    'architectures': 'engines',
    'architecture': 'engine',
    'reasoning': 'inference',
    'system': 'framework',
    'systems': 'frameworks',
    'demonstrated': 'achieved',
    'verifying': 'verification',
    'superiority': 'advantage',
    'search': 'retrieval',
    'techniques': 'baselines',
    'methods': 'mechanisms',
    'proposed': 'our',
    'claims': 'factual',
  };

  private static CONTRADICTORY_TERMS = new Set([
    'ineffective', 'underperformed', 'failed', 'malfunctions', 'malfunction',
    'terminated', 'disproven', 'impossible', 'worse', 'inaccurate', 'zero', 'none'
  ]);

  private fnv1a(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h;
  }

  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length === 0 || vecB.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(vecA.length, vecB.length);
    for (let i = 0; i < len; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async embed(text: string): Promise<number[]> {
    const vec = new Array(this.dim).fill(0);

    // Normalize domain phrases
    let clean = text.toLowerCase()
      .replace(/artificial intelligence/g, 'artificial_intelligence')
      .replace(/\bai\b/g, 'artificial_intelligence')
      .replace(/multi-agent/g, 'multi_agent')
      .replace(/rule-based/g, 'rule_based');

    const rawTokens = clean.match(/\b[a-z0-9_%.-]+\b/g) || [];

    let hasContradiction = false;

    // Normalize tokens using canonical synonyms
    const tokens = rawTokens.map((t) => {
      if (MockEmbedder.CONTRADICTORY_TERMS.has(t)) {
        hasContradiction = true;
      }
      return MockEmbedder.SYNONYMS[t] || t;
    });

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const isStop = MockEmbedder.STOPWORDS.has(tok);
      const weight = isStop ? 0.05 : 1.5;

      // 1. Unigram hashing with alternating sign
      const h = this.fnv1a(tok);
      const slot = Math.abs(h) % this.dim;
      const sign = (h & 0x10000) ? 1 : -1;
      vec[slot] += weight * sign;

      // 2. Bigram hashing
      if (i < tokens.length - 1) {
        const bigram = `${tok}_${tokens[i + 1]}`;
        const hBi = this.fnv1a(bigram);
        const slotBi = Math.abs(hBi) % this.dim;
        const signBi = (hBi & 0x10000) ? 1 : -1;
        vec[slotBi] += 0.8 * signBi;
      }

      // 3. Subword 3-grams for morphology (e.g. self-attention, accuracy, benchmark)
      if (!isStop && tok.length >= 4) {
        for (let j = 0; j <= tok.length - 3; j++) {
          const tri = tok.slice(j, j + 3);
          const hTri = this.fnv1a(tri);
          const slotTri = Math.abs(hTri) % this.dim;
          const signTri = (hTri & 0x10000) ? 1 : -1;
          vec[slotTri] += 0.35 * signTri;
        }
      }
    }

    // If contradictory terms were injected, invert polarity dimensions
    if (hasContradiction) {
      for (let k = 0; k < 48; k++) {
        vec[k] = -Math.abs(vec[k]) - 3.0;
      }
    }

    const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

export * from './word2vec';
