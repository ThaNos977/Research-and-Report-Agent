import { DocChunk } from '../types';
import { BM25Index } from './bm25';
import { Embedder } from './embedder';

export interface RetrievedChunk {
  chunk: DocChunk;
  score: number;
  denseRank?: number;
  sparseRank?: number;
}

export interface HybridRetrieverOptions {
  rrfConstant?: number;      // default 60 (standard Reciprocal Rank Fusion constant)
  minScoreThreshold?: number; // minimum threshold to prevent hallucinated answers
}

export class HybridRetriever {
  private bm25: BM25Index;
  private embedder: Embedder;
  private chunks: DocChunk[] = [];
  private rrfConstant: number;
  private minScoreThreshold: number;

  constructor(embedder: Embedder, options: HybridRetrieverOptions = {}) {
    this.embedder = embedder;
    this.bm25 = new BM25Index();
    this.rrfConstant = options.rrfConstant ?? 60;
    this.minScoreThreshold = options.minScoreThreshold ?? 0.005;
  }

  setChunks(chunks: DocChunk[]) {
    this.chunks = chunks;
    this.bm25.buildIndex(chunks);
  }

  getChunks(): DocChunk[] {
    return this.chunks;
  }

  /**
   * Performs hybrid search using dense vector cosine similarity and sparse BM25,
   * fused with Reciprocal Rank Fusion (RRF).
   */
  async retrieve(query: string, topK = 5): Promise<RetrievedChunk[]> {
    if (this.chunks.length === 0) return [];

    // 1. Sparse BM25 Search
    const sparseResults = this.bm25.search(query, this.chunks.length);
    const sparseRankMap = new Map<string, number>();
    sparseResults.forEach((res, rank) => {
      sparseRankMap.set(res.chunk.id, rank + 1);
    });

    // 2. Dense Vector Search
    const queryEmbedding = await this.embedder.embed(query);
    const denseScores: { chunk: DocChunk; score: number }[] = [];

    for (const chunk of this.chunks) {
      if (chunk.embedding && chunk.embedding.length > 0) {
        const sim = this.embedder.cosineSimilarity(queryEmbedding, chunk.embedding);
        denseScores.push({ chunk, score: sim });
      }
    }

    denseScores.sort((a, b) => b.score - a.score);
    const denseRankMap = new Map<string, number>();
    denseScores.forEach((res, rank) => {
      denseRankMap.set(res.chunk.id, rank + 1);
    });

    // 3. Reciprocal Rank Fusion (RRF)
    const fusedMap = new Map<string, RetrievedChunk>();

    for (const chunk of this.chunks) {
      const sRank = sparseRankMap.get(chunk.id);
      const dRank = denseRankMap.get(chunk.id);

      let rrfScore = 0;
      if (sRank !== undefined) {
        rrfScore += 1 / (this.rrfConstant + sRank);
      }
      if (dRank !== undefined) {
        rrfScore += 1 / (this.rrfConstant + dRank);
      }

      if (rrfScore >= this.minScoreThreshold) {
        fusedMap.set(chunk.id, {
          chunk,
          score: rrfScore,
          denseRank: dRank,
          sparseRank: sRank,
        });
      }
    }

    const results = Array.from(fusedMap.values());
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * Deterministically validates whether citations cited in a model response
   * match actual chunks retrieved, rejecting hallucinated chunk IDs.
   */
  static validateCitations(
    citedChunkIds: string[],
    retrievedChunks: RetrievedChunk[]
  ): string[] {
    const validIds = new Set(retrievedChunks.map((r) => r.chunk.id));
    return citedChunkIds.filter((id) => validIds.has(id));
  }
}
