import {
  DocumentAdapter,
  Heading,
  ParagraphInfo,
  SelectedText,
  Locator,
  ResolvedRange,
  Suggestion,
  ApplyResult,
  RichContent,
} from '../core/types';
import { SAMPLE_RESEARCH_PAPER } from './samplePaper';
import { StructureAwareChunker } from '../core/nlp/chunker';

export class MockDocumentAdapter implements DocumentAdapter {
  private documentText: string;
  private selection: SelectedText | null = null;
  private highlightedLocator: Locator | null = null;
  private listeners: Set<() => void> = new Set();

  capabilities = {
    trackedChanges: true,
    anchoredComments: true,
    selectionEvents: true,
  };

  constructor(initialText = SAMPLE_RESEARCH_PAPER) {
    this.documentText = initialText;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  getDocumentText(): string {
    return this.documentText;
  }

  setDocumentText(newText: string) {
    this.documentText = newText;
    this.notify();
  }

  async getDocumentId(): Promise<string> {
    return 'mock-paper-doc-001';
  }

  async getOutline(): Promise<Heading[]> {
    const lines = this.documentText.split('\n');
    const headings: Heading[] = [];
    let hSeq = 1;
    let currentPath: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();

        currentPath = currentPath.slice(0, level - 1);
        currentPath[level - 1] = text;

        headings.push({
          id: `h_${hSeq++}`,
          text,
          level,
          path: [...currentPath],
        });
      }
    }

    return headings;
  }

  async getParagraphs(): Promise<ParagraphInfo[]> {
    const rawParagraphs = this.documentText.split(/\n\n+/);
    const paragraphs: ParagraphInfo[] = [];

    rawParagraphs.forEach((raw, idx) => {
      const text = raw.trim();
      if (!text) return;

      let headingLevel: number | undefined;
      const headingMatch = text.match(/^(#{1,6})\s+/);
      if (headingMatch) {
        headingLevel = headingMatch[1].length;
      }

      paragraphs.push({
        index: idx,
        text,
        headingLevel,
        locator: {
          host: 'mock',
          paragraphIndex: idx,
          startsWith: text.slice(0, 40),
          contextHash: StructureAwareChunker.hashText(text),
        },
      });
    });

    return paragraphs;
  }

  async getSelection(): Promise<SelectedText | null> {
    return this.selection;
  }

  setSelection(text: string, paragraphIndex = 0) {
    if (!text.trim()) {
      this.selection = null;
    } else {
      this.selection = {
        text,
        locator: {
          host: 'mock',
          paragraphIndex,
          startsWith: text.slice(0, 40),
          contextHash: StructureAwareChunker.hashText(text),
        },
      };
    }
    this.notify();
  }

  /**
   * Re-anchors text using startsWith and contextHash.
   * If text was altered and cannot be found exactly once, returns null (stale).
   */
  async locate(locator: Locator): Promise<ResolvedRange | null> {
    const paragraphs = await this.getParagraphs();

    // 1. Try exact contextHash match at hinted paragraphIndex
    if (locator.paragraphIndex < paragraphs.length) {
      const candidate = paragraphs[locator.paragraphIndex];
      if (candidate.locator.contextHash === locator.contextHash) {
        return {
          found: true,
          paragraphIndex: locator.paragraphIndex,
          text: candidate.text,
        };
      }
    }

    // 2. Search all paragraphs using startsWith
    const matches: ParagraphInfo[] = [];
    for (const p of paragraphs) {
      if (p.text.includes(locator.startsWith)) {
        matches.push(p);
      }
    }

    if (matches.length === 1) {
      return {
        found: true,
        paragraphIndex: matches[0].index,
        text: matches[0].text,
      };
    }

    // Cannot find or ambiguous multiple matches
    return null;
  }

  async highlight(locator: Locator): Promise<void> {
    this.highlightedLocator = locator;
    this.notify();
  }

  getHighlightedLocator(): Locator | null {
    return this.highlightedLocator;
  }

  async applySuggestion(s: Suggestion, mode: 'tracked' | 'direct' = 'tracked'): Promise<ApplyResult> {
    // 1. Re-anchor text before modifying document
    const resolved = await this.locate(s.locator);
    if (!resolved) {
      s.status = 'stale';
      return {
        success: false,
        mode,
        error: 'Target text could not be reliably located (stale edit).',
      };
    }

    if (!this.documentText.includes(s.original)) {
      s.status = 'stale';
      return {
        success: false,
        mode,
        error: 'Original text was modified in the document.',
      };
    }

    if (mode === 'tracked') {
      const trackedText = `~~[Deleted: ${s.original}]~~ **[Suggested: ${s.replacement}]**`;
      this.documentText = this.documentText.replace(s.original, trackedText);
    } else {
      this.documentText = this.documentText.replace(s.original, s.replacement);
    }

    s.status = 'applied';
    this.notify();

    return {
      success: true,
      mode,
    };
  }

  async insertAtCursor(content: RichContent): Promise<void> {
    const textToInsert = content.markdown || content.text || content.html || '';
    this.documentText += `\n\n---\n\n${textToInsert}`;
    this.notify();
  }
}
