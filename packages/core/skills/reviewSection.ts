import { GeminiClient } from '../llm/geminiClient';
import { DocumentAdapter, Suggestion, Locator } from '../types';
import { ReadabilityMetricsCalculator } from '../nlp/metrics';
import { MeaningDriftGuard } from '../nlp/driftGuard';
import { Embedder } from '../nlp/embedder';

export class ReviewSectionSkill {
  private client: GeminiClient;
  private adapter: DocumentAdapter;
  private driftGuard: MeaningDriftGuard;

  constructor(client: GeminiClient, adapter: DocumentAdapter, embedder: Embedder) {
    this.client = client;
    this.adapter = adapter;
    this.driftGuard = new MeaningDriftGuard(embedder, 0.82);
  }

  async run(options: {
    targetText?: string;
    onProgress?: (msg: string) => void;
  } = {}): Promise<{ suggestions: Suggestion[]; metrics: any }> {
    const notify = options.onProgress || (() => {});
    notify('Loading target section for review...');

    const paragraphs = await this.adapter.getParagraphs();
    const selection = await this.adapter.getSelection();
    const targetText = options.targetText || selection?.text || paragraphs.map((p) => p.text).join('\n\n');

    if (!targetText.trim()) {
      notify('No text found to review.');
      return { suggestions: [], metrics: null };
    }

    // 1. Compute deterministic readability & style metrics locally
    notify('Computing local readability and style metrics...');
    const metrics = ReadabilityMetricsCalculator.compute(targetText);

    // 2. Request structured suggestions
    notify('Generating targeted rewrite suggestions...');
    const prompt = `Review the following academic section.
Computed section metrics:
- Flesch Reading Ease: ${metrics.fleschReadingEase} / 100
- Flesch-Kincaid Grade Level: ${metrics.fleschKincaidGrade}
- Average Sentence Length: ${metrics.avgSentenceLength} words
- Passive Voice Clauses: ${metrics.passiveVoicePercentage}%

Provide actionable improvements in 5 distinct categories:
- clarity (remove convoluted phrasing)
- tone (elevate academic rigor and objectivity)
- structure (improve sentence flow and transitions)
- grammar (correct syntax or punctuation errors)
- terminology (standardize domain-specific concepts)

CRITICAL INSTRUCTION: The "original" field MUST be copied VERBATIM (character-for-character) from the text below. Do NOT paraphrase or invent text in the "original" field.

Text to review:
"""
${targetText.slice(0, 4000)}
"""

Return a JSON array of objects with:
- "original": string (exact verbatim excerpt from the text above)
- "replacement": string (improved replacement text)
- "rationale": string (explanation of the improvement, quoting metrics where helpful)
- "category": "clarity" | "tone" | "structure" | "grammar" | "terminology"`;

    const rawSuggestions = await this.client.generateStructured<
      Array<{
        original: string;
        replacement: string;
        rationale: string;
        category: 'clarity' | 'tone' | 'structure' | 'grammar' | 'terminology';
      }>
    >(
      prompt,
      'You are an expert academic editor and writing coach. Always adhere strictly to JSON output format and verbatim original text matching.'
    );

    // 3. Verbatim verification & Meaning Drift Guard
    notify('Running verbatim text matching and meaning-drift guard...');
    const validatedSuggestions: Suggestion[] = [];

    for (let i = 0; i < rawSuggestions.length; i++) {
      const raw = rawSuggestions[i];

      // Verbatim check: original text must be present in the document
      const matchingP = paragraphs.find((p) => p.text.includes(raw.original));
      if (!matchingP && !targetText.includes(raw.original)) {
        // Skip hallucinated text suggestions
        continue;
      }

      const pIndex = matchingP ? matchingP.index : 0;
      const locator: Locator = {
        host: 'mock',
        paragraphIndex: pIndex,
        startsWith: raw.original.slice(0, 40),
        contextHash: `sug_${i}`,
      };

      // Check semantic preservation via MeaningDriftGuard
      const drift = await this.driftGuard.checkDrift(raw.original, raw.replacement);

      validatedSuggestions.push({
        id: `sug_${i + 1}`,
        locator,
        original: raw.original,
        replacement: raw.replacement,
        rationale: raw.rationale,
        category: raw.category || 'clarity',
        status: 'proposed',
        meaningDrift: drift,
      });
    }

    notify(`Review completed. ${validatedSuggestions.length} verified suggestions proposed.`);
    return { suggestions: validatedSuggestions, metrics };
  }
}
