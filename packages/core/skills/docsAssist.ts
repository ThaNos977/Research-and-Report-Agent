import { DocumentAdapter, DocAssistFinding, Heading } from '../types';
import { GeminiClient } from '../llm/geminiClient';

export class DocsAssistSkill {
  private adapter: DocumentAdapter;
  private client: GeminiClient;

  constructor(adapter: DocumentAdapter, client: GeminiClient) {
    this.adapter = adapter;
    this.client = client;
  }

  /**
   * Validates section heading hierarchy and checks for essential paper sections.
   */
  async checkHeadingStructure(): Promise<DocAssistFinding[]> {
    const outline = await this.adapter.getOutline();
    const findings: DocAssistFinding[] = [];

    if (outline.length === 0) {
      findings.push({
        id: 'heading_none',
        type: 'header_structure',
        title: 'No Headings Detected',
        description: 'Document has no formatted heading styles (H1, H2, H3).',
        status: 'warning',
      });
      return findings;
    }

    // Check level skipping (e.g. H1 -> H3)
    let prevLevel = 0;
    const skippedLevels: string[] = [];

    for (const h of outline) {
      if (prevLevel > 0 && h.level > prevLevel + 1) {
        skippedLevels.push(`"${h.text}" jumps from H${prevLevel} directly to H${h.level}`);
      }
      prevLevel = h.level;
    }

    if (skippedLevels.length > 0) {
      findings.push({
        id: 'heading_skip',
        type: 'header_structure',
        title: 'Non-Sequential Heading Levels',
        description: 'Found heading hierarchy gaps where intermediate heading levels are skipped.',
        status: 'warning',
        details: skippedLevels,
      });
    } else {
      findings.push({
        id: 'heading_ok',
        type: 'header_structure',
        title: 'Sequential Heading Hierarchy',
        description: 'Heading levels transition smoothly without structural gaps.',
        status: 'pass',
      });
    }

    // Check standard academic sections
    const standardSections = ['introduction', 'method', 'result', 'discussion', 'conclusion', 'reference'];
    const foundSections = outline.map((h) => h.text.toLowerCase());
    const missing: string[] = [];

    for (const std of standardSections) {
      if (!foundSections.some((f) => f.includes(std))) {
        missing.push(std.charAt(0).toUpperCase() + std.slice(1));
      }
    }

    if (missing.length > 0) {
      findings.push({
        id: 'heading_missing_standard',
        type: 'header_structure',
        title: 'Standard Sections Check',
        description: `Consider adding commonly expected academic paper sections.`,
        status: 'info',
        details: missing.map((m) => `Missing typical section: "${m}"`),
      });
    }

    return findings;
  }

  /**
   * Verifies that acronyms are properly defined upon first appearance in the paper.
   */
  async checkAcronyms(): Promise<DocAssistFinding[]> {
    const paragraphs = await this.adapter.getParagraphs();
    const fullText = paragraphs.map((p) => p.text).join('\n\n');

    // Find all candidate acronyms (2-6 capital letters, e.g. NLP, RAG, BERT, API)
    const acronymMatches = fullText.match(/\b[A-Z]{2,6}\b/g) || [];
    const uniqueAcronyms = Array.from(new Set(acronymMatches)).filter(
      (a) => !['A', 'I', 'IN', 'ON', 'AT', 'TO', 'OR', 'AND', 'OF', 'FOR', 'IEEE', 'ACM', 'USA', 'UK', 'PDF'].includes(a)
    );

    const undefinedAcronyms: string[] = [];
    const definedAcronyms: string[] = [];

    for (const acronym of uniqueAcronyms) {
      const firstIdx = fullText.indexOf(acronym);
      if (firstIdx === -1) continue;

      // Extract window around first occurrence (±80 chars)
      const windowStart = Math.max(0, firstIdx - 80);
      const windowEnd = Math.min(fullText.length, firstIdx + acronym.length + 80);
      const contextWindow = fullText.slice(windowStart, windowEnd);

      // Check if defined either: "Full Name (ACRONYM)" or "ACRONYM (Full Name)"
      const pattern1 = new RegExp(`[a-zA-Z\\s]{4,}\\(${acronym}\\)`, 'i');
      const pattern2 = new RegExp(`${acronym}\\s*\\([a-zA-Z\\s]{4,}\\)`, 'i');

      if (pattern1.test(contextWindow) || pattern2.test(contextWindow)) {
        definedAcronyms.push(acronym);
      } else {
        undefinedAcronyms.push(acronym);
      }
    }

    const findings: DocAssistFinding[] = [];

    if (undefinedAcronyms.length > 0) {
      findings.push({
        id: 'acronym_undefined',
        type: 'acronym',
        title: 'Acronyms Undefined at First Use',
        description: 'These abbreviations appear without a parenthetical definition upon initial mention.',
        status: 'warning',
        details: undefinedAcronyms.slice(0, 15).map((a) => `"${a}" is used without prior definition`),
      });
    } else {
      findings.push({
        id: 'acronym_ok',
        type: 'acronym',
        title: 'Acronym Definitions Verified',
        description: 'All detected technical acronyms are properly introduced.',
        status: 'pass',
      });
    }

    return findings;
  }

  /**
   * Verifies that Figure and Table in-text references point to existing elements.
   */
  async checkCrossReferences(): Promise<DocAssistFinding[]> {
    const paragraphs = await this.adapter.getParagraphs();
    const fullText = paragraphs.map((p) => p.text).join('\n\n');

    // Find all mentions like "Figure 1", "Fig. 2", "Table 3"
    const figureMentions = Array.from(new Set(fullText.match(/\b(?:Figure|Fig\.)\s+\d+\b/gi) || []));
    const tableMentions = Array.from(new Set(fullText.match(/\bTable\s+\d+\b/gi) || []));

    const brokenRefs: string[] = [];

    // Verify figures
    for (const mention of figureMentions) {
      const numMatch = mention.match(/\d+/);
      if (numMatch) {
        const num = numMatch[0];
        const captionRegex = new RegExp(`(?:Figure|Fig\\.)\\s*${num}[:.]`, 'i');
        if (!captionRegex.test(fullText)) {
          brokenRefs.push(`"${mention}" is referenced in text but no caption "Figure ${num}:" was found.`);
        }
      }
    }

    // Verify tables
    for (const mention of tableMentions) {
      const numMatch = mention.match(/\d+/);
      if (numMatch) {
        const num = numMatch[0];
        const captionRegex = new RegExp(`Table\\s*${num}[:.]`, 'i');
        if (!captionRegex.test(fullText)) {
          brokenRefs.push(`"${mention}" is referenced in text but no caption "Table ${num}:" was found.`);
        }
      }
    }

    const findings: DocAssistFinding[] = [];

    if (brokenRefs.length > 0) {
      findings.push({
        id: 'cross_ref_broken',
        type: 'cross_reference',
        title: 'Unmatched Figure/Table References',
        description: 'Found cross-references that lack matching captions in the document.',
        status: 'warning',
        details: brokenRefs,
      });
    } else {
      findings.push({
        id: 'cross_ref_ok',
        type: 'cross_reference',
        title: 'Cross-References Verified',
        description: 'All referenced figures and tables have corresponding captions in the document.',
        status: 'pass',
      });
    }

    return findings;
  }

  /**
   * Generates a Table of Contents markdown block based on the document outline.
   */
  async generateTableOfContents(): Promise<string> {
    const outline = await this.adapter.getOutline();
    if (outline.length === 0) return 'No headings available to construct Table of Contents.';

    let toc = '## Table of Contents\n\n';
    for (const h of outline) {
      const indent = '  '.repeat(Math.max(0, h.level - 1));
      toc += `${indent}- [${h.text}](#${h.text.toLowerCase().replace(/[^a-z0-9]+/g, '-')})\n`;
    }
    return toc;
  }

  /**
   * Generates an academic structured abstract synthesizing Background, Methods, Results, Conclusion.
   */
  async generateStructuredAbstract(): Promise<string> {
    const paragraphs = await this.adapter.getParagraphs();
    const docText = paragraphs.map((p) => p.text).join('\n\n').slice(0, 6000);

    const prompt = `Read the following paper text and generate a formal, high-impact Academic Structured Abstract.
Format into 4 distinct bolded parts:
- **Background & Motivation**: The research problem and significance.
- **Methodology**: Core algorithms, architecture, or theoretical framework proposed.
- **Key Findings & Results**: Quantitative or qualitative discoveries.
- **Conclusion & Implications**: Broader impact and forward-looking relevance.

Paper text:
"""
${docText}
"""`;

    return await this.client.generateText(
      prompt,
      'You are a senior journal editor crafting concise, high-rigor scientific abstracts.'
    );
  }
}
