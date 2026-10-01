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
import { StructureAwareChunker } from '../core/nlp/chunker';

declare const Word: any;
declare const Office: any;

export class WordDocumentAdapter implements DocumentAdapter {
  capabilities = {
    trackedChanges: true,
    anchoredComments: true,
    selectionEvents: true,
  };

  private selectionListenerRegistered = false;
  private selectionCallback?: (sel: SelectedText | null) => void;

  constructor() {
    this.initSelectionEvents();
  }

  private initSelectionEvents() {
    if (typeof Office !== 'undefined' && Office.context?.document) {
      Office.context.document.addHandlerAsync(
        Office.EventType.DocumentSelectionChanged,
        async () => {
          if (this.selectionCallback) {
            const sel = await this.getSelection();
            this.selectionCallback(sel);
          }
        }
      );
      this.selectionListenerRegistered = true;
    }
  }

  onSelectionChange(cb: (sel: SelectedText | null) => void) {
    this.selectionCallback = cb;
  }

  async getDocumentId(): Promise<string> {
    if (typeof Office !== 'undefined' && Office.context?.document?.url) {
      return Office.context.document.url;
    }
    return 'word-active-doc';
  }

  async getOutline(): Promise<Heading[]> {
    if (typeof Word === 'undefined') {
      return [];
    }

    return await Word.run(async (context: any) => {
      const paragraphs = context.document.body.paragraphs;
      paragraphs.load(['text', 'style']);
      await context.sync();

      const headings: Heading[] = [];
      let hSeq = 1;
      let currentPath: string[] = [];

      for (let i = 0; i < paragraphs.items.length; i++) {
        const p = paragraphs.items[i];
        const style = p.style?.toLowerCase() || '';
        const match = style.match(/heading\s*(\d)/);

        if (match) {
          const level = parseInt(match[1], 10);
          const text = p.text.trim();

          currentPath = currentPath.slice(0, level - 1);
          currentPath[level - 1] = text;

          headings.push({
            id: `word_h_${hSeq++}`,
            text,
            level,
            path: [...currentPath],
          });
        }
      }

      return headings;
    });
  }

  async getParagraphs(): Promise<ParagraphInfo[]> {
    if (typeof Word === 'undefined') {
      return [];
    }

    return await Word.run(async (context: any) => {
      const paragraphs = context.document.body.paragraphs;
      paragraphs.load(['text', 'style']);
      await context.sync();

      const list: ParagraphInfo[] = [];

      for (let i = 0; i < paragraphs.items.length; i++) {
        const p = paragraphs.items[i];
        const text = p.text.trim();
        if (!text) continue;

        let headingLevel: number | undefined;
        const style = p.style?.toLowerCase() || '';
        const match = style.match(/heading\s*(\d)/);
        if (match) {
          headingLevel = parseInt(match[1], 10);
        }

        list.push({
          index: i,
          text,
          style: p.style,
          headingLevel,
          locator: {
            host: 'word',
            paragraphIndex: i,
            startsWith: text.slice(0, 40),
            contextHash: StructureAwareChunker.hashText(text),
          },
        });
      }

      return list;
    });
  }

  async getSelection(): Promise<SelectedText | null> {
    if (typeof Word === 'undefined') {
      return null;
    }

    return await Word.run(async (context: any) => {
      const selection = context.document.getSelection();
      selection.load('text');
      await context.sync();

      const text = selection.text.trim();
      if (!text) return null;

      return {
        text,
        locator: {
          host: 'word',
          paragraphIndex: 0,
          startsWith: text.slice(0, 40),
          contextHash: StructureAwareChunker.hashText(text),
        },
      };
    });
  }

  /**
   * Re-finds text in Word document using search with 255-character substring limit.
   */
  async locate(locator: Locator): Promise<ResolvedRange | null> {
    if (typeof Word === 'undefined') {
      return null;
    }

    return await Word.run(async (context: any) => {
      const searchTarget = locator.startsWith.slice(0, 250);
      const results = context.document.body.search(searchTarget, { matchCase: false });
      results.load('text');
      await context.sync();

      if (results.items.length === 1) {
        return {
          found: true,
          paragraphIndex: locator.paragraphIndex,
          text: results.items[0].text,
        };
      }

      return null;
    });
  }

  async highlight(locator: Locator): Promise<void> {
    if (typeof Word === 'undefined') return;

    await Word.run(async (context: any) => {
      const searchTarget = locator.startsWith.slice(0, 250);
      const results = context.document.body.search(searchTarget, { matchCase: false });
      results.load('items');
      await context.sync();

      if (results.items.length > 0) {
        results.items[0].select();
        await context.sync();
      }
    });
  }

  async applySuggestion(s: Suggestion, mode: 'tracked' | 'direct' = 'tracked'): Promise<ApplyResult> {
    if (typeof Word === 'undefined') {
      return { success: false, mode, error: 'Office.js not available' };
    }

    return await Word.run(async (context: any) => {
      // 1. Search for original text
      const searchTarget = s.original.slice(0, 250);
      const results = context.document.body.search(searchTarget, { matchCase: false });
      results.load('text');
      await context.sync();

      if (results.items.length !== 1) {
        s.status = 'stale';
        return {
          success: false,
          mode,
          error: 'Original text could not be uniquely found in Word document.',
        };
      }

      const range = results.items[0];

      if (mode === 'tracked') {
        try {
          context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
        } catch (e) {
          console.warn('Tracked changes mode not supported on this Word version:', e);
        }
      }

      range.insertText(s.replacement, Word.InsertLocation.replace);

      // Optional anchored comment with rationale if WordApi 1.4 supported
      try {
        if (s.rationale && range.insertComment) {
          range.insertComment(`[Research Assistant - ${s.category.toUpperCase()}]: ${s.rationale}`);
        }
      } catch (e) {}

      await context.sync();
      s.status = 'applied';

      return {
        success: true,
        mode,
      };
    });
  }

  async insertAtCursor(content: RichContent): Promise<void> {
    if (typeof Word === 'undefined') return;

    await Word.run(async (context: any) => {
      const selection = context.document.getSelection();
      const textToInsert = content.markdown || content.text || '';
      selection.insertText(textToInsert, Word.InsertLocation.after);
      await context.sync();
    });
  }
}
