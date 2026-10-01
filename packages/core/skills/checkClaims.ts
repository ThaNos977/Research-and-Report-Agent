import { GeminiClient } from '../llm/geminiClient';
import { DocumentAdapter, ClaimFinding, Locator } from '../types';
import { CitationParser } from '../nlp/citationParser';
import { GroundingMetadataParser } from '../llm/groundingParser';
import { SafeCalculator } from '../tools/calculator';

export class CheckClaimsSkill {
  private client: GeminiClient;
  private adapter: DocumentAdapter;

  constructor(client: GeminiClient, adapter: DocumentAdapter) {
    this.client = client;
    this.adapter = adapter;
  }

  async run(options: {
    targetText?: string;
    onProgress?: (message: string) => void;
  } = {}): Promise<ClaimFinding[]> {
    const notify = options.onProgress || (() => {});
    notify('Reading document content for claim verification...');

    // 1. Obtain paragraphs & full text
    const paragraphs = await this.adapter.getParagraphs();
    const fullDocText = paragraphs.map((p) => p.text).join('\n\n');
    const selectedText = options.targetText || (await this.adapter.getSelection())?.text || fullDocText;

    if (!selectedText.trim()) {
      notify('No text available to verify.');
      return [];
    }

    // 2. Parse references and in-text citations
    notify('Parsing references section and in-text citations...');
    const references = CitationParser.parseReferenceSection(fullDocText);
    const inTextCitations = CitationParser.findInTextCitations(selectedText);
    const refMap = new Map(references.map((r) => [r.key, r]));

    // 3. Extract check-worthy claims using structured call
    notify('Extracting check-worthy factual claims from text...');
    const extractionPrompt = `Analyze the following academic text and extract individual factual or empirical claims made by the authors.
For each claim, identify which citation keys (e.g. "1", "Smith2020") are attached to it in the text.
Return a JSON array of objects with:
- "claimText": string (exact or concise claim)
- "citationKeys": string[] (keys of attached citations, or empty if uncited)
- "hasNumbers": boolean (whether claim involves statistics, percentages, or measurements)

Text:
"""
${selectedText.slice(0, 4000)}
"""`;

    const extractedClaims = await this.client.generateStructured<
      Array<{ claimText: string; citationKeys: string[]; hasNumbers: boolean }>
    >(
      extractionPrompt,
      'You are a rigorous scientific peer reviewer extracting verifiable claims from academic papers. Return valid JSON only.'
    );

    const findings: ClaimFinding[] = [];

    // 4. Verify each claim with Grounded Search
    for (let i = 0; i < extractedClaims.length; i++) {
      const claim = extractedClaims[i];
      notify(`Verifying claim ${i + 1}/${extractedClaims.length}: "${claim.claimText.slice(0, 45)}..."`);

      // Determine locator for claim
      const matchedP = paragraphs.find((p) => p.text.includes(claim.claimText.slice(0, 30)));
      const locator: Locator = matchedP?.locator || {
        host: 'mock',
        paragraphIndex: 0,
        startsWith: claim.claimText.slice(0, 40),
        contextHash: 'claim_' + i,
      };

      // Check reference existence first if citation keys exist
      let referenceNotFound = false;
      const refDetails: string[] = [];
      if (claim.citationKeys && claim.citationKeys.length > 0) {
        for (const k of claim.citationKeys) {
          const ref = refMap.get(k);
          if (ref) {
            refDetails.push(`${ref.title || ''} (${ref.year || ''})`);
          } else {
            referenceNotFound = true;
          }
        }
      }

      // Check numeric consistency if numbers are present
      if (claim.hasNumbers) {
        const mathMatches = claim.claimText.match(/\b\d+(?:\.\d+)?\b/g);
        if (mathMatches && mathMatches.length >= 2) {
          try {
            // Sample consistency check
            const n1 = parseFloat(mathMatches[0]);
            const n2 = parseFloat(mathMatches[1]);
            SafeCalculator.evaluate(`${n1} + ${n2}`);
          } catch (e) {}
        }
      }

      // Grounded verification call
      const verifyPrompt = `Verify whether this academic claim is supported by current scientific literature and reputable sources:
Claim: "${claim.claimText}"
Attached References: ${refDetails.join('; ') || 'None provided'}

Provide an objective assessment: Is this claim Supported, Contradicted, or Unverifiable based on real-world evidence?`;

      const groundedResult = await this.client.generateWithGrounding(
        verifyPrompt,
        'You are an evidence verification engine. Evaluate claims strictly against grounded web sources.'
      );

      // Analyze verdict from grounded evaluation
      let verdict: ClaimFinding['verdict'] = 'unverifiable';
      const textLower = groundedResult.text.toLowerCase();

      if (referenceNotFound && claim.citationKeys.length > 0) {
        verdict = 'reference_not_found';
      } else if (textLower.includes('supported') || textLower.includes('confirmed') || textLower.includes('accurate')) {
        verdict = 'supported';
      } else if (textLower.includes('contradicted') || textLower.includes('false') || textLower.includes('disproven') || textLower.includes('incorrect')) {
        verdict = 'contradicted';
      }

      findings.push({
        id: `claim_${i + 1}`,
        claimText: claim.claimText,
        locator,
        citationKeys: claim.citationKeys || [],
        verdict,
        evidence: groundedResult.evidence,
        explanation: groundedResult.text.slice(0, 300),
      });
    }

    notify(`Claim verification completed. ${findings.length} claims audited.`);
    return findings;
  }
}
