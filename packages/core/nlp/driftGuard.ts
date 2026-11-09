import { Embedder } from './embedder';

export interface DriftCheckResult {
  similarity: number;
  warning: boolean;
  message?: string;
  reasons?: string[];
}

export class MeaningDriftGuard {
  private embedder: Embedder;
  private defaultThreshold: number;

  private static CONTRADICTION_KEYWORDS = new Set([
    'ineffective', 'underperformed', 'failed', 'malfunction', 'malfunctions',
    'terminated', 'disproved', 'impossible', 'worse', 'inaccurate', 'refuted',
    'opposite', 'contrary', 'flawed', 'invalid'
  ]);

  constructor(embedder: Embedder, defaultThreshold = 0.80) {
    this.embedder = embedder;
    this.defaultThreshold = defaultThreshold;
  }

  /**
   * Assesses semantic preservation between original text and a suggested replacement.
   * If cosine similarity is below the threshold or semantic polarity is inverted,
   * flags a meaning-drift warning.
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
      let similarity = this.embedder.cosineSimilarity(vecOrig, vecRepl);

      const reasons: string[] = [];

      // 1. Contradiction and polarity inversion check
      const origWords = new Set(original.toLowerCase().match(/\b[a-z]+\b/g) || []);
      const replWords = replacement.toLowerCase().match(/\b[a-z]+\b/g) || [];

      for (const w of replWords) {
        if (MeaningDriftGuard.CONTRADICTION_KEYWORDS.has(w) && !origWords.has(w)) {
          reasons.push(`Contradictory or reversing term "${w}" introduced in replacement.`);
          similarity = Math.min(similarity, 0.45); // Heavy penalty for semantic reversal
          break;
        }
      }

      // 2. Numerical value consistency check
      const origNumbers: string[] = (original.match(/\b\d+(?:\.\d+)?%?\b/g) || []).sort();
      const replNumbers: string[] = (replacement.match(/\b\d+(?:\.\d+)?%?\b/g) || []).sort();

      if (origNumbers.length > 0 && origNumbers.join(',') !== replNumbers.join(',')) {
        // Numbers altered or omitted
        const missingNumbers = origNumbers.filter((n: string) => !replNumbers.includes(n));
        if (missingNumbers.length > 0) {
          reasons.push(`Quantitative figures missing or altered: ${missingNumbers.join(', ')}`);
        }
      }

      const roundedSim = parseFloat(Math.max(0, similarity).toFixed(3));
      const warning = roundedSim < cutoff || reasons.length > 0;

      let message: string | undefined;
      if (warning) {
        message = reasons.length > 0
          ? `Meaning drift alert (${reasons.join(' ')}). Similarity: ${roundedSim}.`
          : `Potential semantic drift detected (similarity ${roundedSim} < ${cutoff}). Suggested rewrite may alter intended scientific meaning.`;
      }

      return {
        similarity: roundedSim,
        warning,
        message,
        reasons: reasons.length > 0 ? reasons : undefined,
      };
    } catch (err) {
      console.warn('Drift guard check error:', err);
      return { similarity: 1.0, warning: false };
    }
  }
}
