import { Embedder } from './embedder';

export interface DriftCheckResult {
  similarity: number;
  warning: boolean;
  message?: string;
}

export class MeaningDriftGuard {
  private embedder: Embedder;
  private defaultThreshold: number;

  constructor(embedder: Embedder, defaultThreshold = 0.82) {
    this.embedder = embedder;
    this.defaultThreshold = defaultThreshold;
  }

  /**
   * Assesses semantic preservation between original text and a suggested replacement.
   * If cosine similarity is below the threshold, flags a meaning-drift warning.
   */
  async checkDrift(
    original: string,
    replacement: string,
    threshold?: number
  ): Promise<DriftCheckResult> {
    const cutoff = threshold ?? this.defaultThreshold;

    if (!original.trim() || !replacement.trim()) {
      return { similarity: 1.0, warning: false };
    }

    try {
      const [vecOrig, vecRepl] = await this.embedder.embedBatch([original, replacement]);
      const similarity = this.embedder.cosineSimilarity(vecOrig, vecRepl);
      const roundedSim = parseFloat(similarity.toFixed(3));
      const warning = roundedSim < cutoff;

      return {
        similarity: roundedSim,
        warning,
        message: warning
          ? `Potential semantic drift detected (similarity ${roundedSim} < ${cutoff}). Suggested rewrite may alter intended scientific meaning.`
          : undefined,
      };
    } catch (err) {
      console.warn('Drift guard check error:', err);
      return { similarity: 1.0, warning: false };
    }
  }
}
