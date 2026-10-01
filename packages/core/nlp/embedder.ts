import { GeminiClient } from '../llm/geminiClient';
import { DocChunk } from '../types';

export interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
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

  async embed(text: string): Promise<number[]> {
    return await this.client.embedContent(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);
    const queue = texts.map((t, idx) => ({ text: t, index: idx }));

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        try {
          results[item.index] = await this.embed(item.text);
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
      const newVectors = await this.embedBatch(toFetch.map((f) => f.text));
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
 * Deterministic Mock Embedder for unit tests, offline evaluations, and mock hosts.
 * Computes frequency-based pseudo-embeddings using character n-grams.
 */
export class MockEmbedder implements Embedder {
  private dim = 64;

  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length === 0 || vecB.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < Math.min(vecA.length, vecB.length); i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async embed(text: string): Promise<number[]> {
    const vec = new Array(this.dim).fill(0);
    const clean = text.toLowerCase();
    for (let i = 0; i < clean.length; i++) {
      const code = clean.charCodeAt(i);
      const slot = (code * 31 + i) % this.dim;
      vec[slot] += 1;
    }
    const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
