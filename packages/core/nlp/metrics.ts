import { ReadabilityMetrics } from '../types';

export class ReadabilityMetricsCalculator {
  /**
   * Count syllables using phonetic heuristics.
   */
  static countSyllables(word: string): number {
    const clean = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!clean) return 0;
    if (clean.length <= 3) return 1;

    // Discard trailing silent e
    const normalized = clean.replace(/(?:[^laeiouy]|ed|es|e)$/, '');
    const syllables = normalized.match(/[aeiouy]{1,2}/g);
    return syllables ? Math.max(1, syllables.length) : 1;
  }

  /**
   * Detect passive voice clauses in text.
   * e.g., "was calculated", "were observed", "is evaluated", "has been demonstrated".
   */
  static detectPassiveVoice(sentences: string[]): { passiveCount: number; rate: number } {
    if (sentences.length === 0) return { passiveCount: 0, rate: 0 };

    const passiveRegex = /\b(am|is|are|was|were|be|been|being)\b\s+([a-z]+ed|[a-z]+en|shown|done|found|made|known|seen|held|kept|left|built)\b/i;

    let passiveCount = 0;
    for (const sent of sentences) {
      if (passiveRegex.test(sent)) {
        passiveCount++;
      }
    }

    return {
      passiveCount,
      rate: Math.round((passiveCount / sentences.length) * 100),
    };
  }

  /**
   * Computes complete academic readability and style metrics.
   */
  static compute(text: string): ReadabilityMetrics {
    const clean = text.trim();
    if (!clean) {
      return {
        fleschReadingEase: 0,
        fleschKincaidGrade: 0,
        avgSentenceLength: 0,
        passiveVoicePercentage: 0,
        wordCount: 0,
        sentenceCount: 0,
      };
    }

    // Split sentences
    const sentences = clean
      .split(/[.!?]+(?:\s+|$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);

    const sentenceCount = Math.max(1, sentences.length);

    // Split words
    const words = clean
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9-]/g, ''))
      .filter((w) => w.length > 0);

    const wordCount = Math.max(1, words.length);

    let totalSyllables = 0;
    for (const word of words) {
      totalSyllables += this.countSyllables(word);
    }

    const avgSentenceLength = parseFloat((wordCount / sentenceCount).toFixed(1));
    const syllablesPerWord = totalSyllables / wordCount;

    // Flesch Reading Ease formula
    // 206.835 - (1.015 * ASL) - (84.6 * ASW)
    let fleschReadingEase = 206.835 - 1.015 * avgSentenceLength - 84.6 * syllablesPerWord;
    fleschReadingEase = Math.max(0, Math.min(100, Math.round(fleschReadingEase)));

    // Flesch-Kincaid Grade Level formula
    // (0.39 * ASL) + (11.8 * ASW) - 15.59
    let fleschKincaidGrade = 0.39 * avgSentenceLength + 11.8 * syllablesPerWord - 15.59;
    fleschKincaidGrade = parseFloat(Math.max(1, fleschKincaidGrade).toFixed(1));

    const { rate: passiveVoicePercentage } = this.detectPassiveVoice(sentences);

    return {
      fleschReadingEase,
      fleschKincaidGrade,
      avgSentenceLength,
      passiveVoicePercentage,
      wordCount,
      sentenceCount,
    };
  }
}
