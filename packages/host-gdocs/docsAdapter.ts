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

export class GoogleDocsAdapter implements DocumentAdapter {
  capabilities = {
    trackedChanges: false,   // DocumentApp has no native tracked changes API
    anchoredComments: false,
    selectionEvents: false,  // Requires explicit "Use selection" button
  };

  private getScript(): any {
    return (globalThis as any).google?.script?.run;
  }

  async getDocumentId(): Promise<string> {
    return 'gdocs-active-document';
  }

  async getOutline(): Promise<Heading[]> {
    const paragraphs = await this.getParagraphs();
    const headings: Heading[] = [];
    let seq = 1;
    let currentPath: string[] = [];

    for (const p of paragraphs) {
      if (p.headingLevel && p.headingLevel > 0) {
        const level = p.headingLevel;
        currentPath = currentPath.slice(0, level - 1);
        currentPath[level - 1] = p.text;

        headings.push({
          id: `gdoc_h_${seq++}`,
          text: p.text,
          level,
          path: [...currentPath],
        });
      }
    }

    return headings;
  }

  async getParagraphs(): Promise<ParagraphInfo[]> {
    const script = this.getScript();
    if (!script) {
      return [];
    }

    return new Promise((resolve) => {
      script
        .withSuccessHandler((jsonStr: string) => {
          try {
            const rawList: any[] = JSON.parse(jsonStr);
            const list: ParagraphInfo[] = rawList.map((r, i) => ({
              index: r.index,
              text: r.text,
              headingLevel: r.headingLevel > 0 ? r.headingLevel : undefined,
              locator: {
                host: 'gdocs',
                paragraphIndex: i,
                startsWith: r.text.slice(0, 40),
                contextHash: StructureAwareChunker.hashText(r.text),
              },
            }));
            resolve(list);
          } catch (e) {
            resolve([]);
          }
        })
        .withFailureHandler(() => resolve([]))
        .getParagraphsRpc();
    });
  }

  async getSelection(): Promise<SelectedText | null> {
    const script = this.getScript();
    if (!script) return null;

    return new Promise((resolve) => {
      script
        .withSuccessHandler((text: string | null) => {
          if (!text || !text.trim()) {
            resolve(null);
            return;
          }
          resolve({
            text: text.trim(),
            locator: {
              host: 'gdocs',
              paragraphIndex: 0,
              startsWith: text.slice(0, 40),
              contextHash: StructureAwareChunker.hashText(text),
            },
          });
        })
        .withFailureHandler(() => resolve(null))
        .getSelectionRpc();
    });
  }

  async locate(locator: Locator): Promise<ResolvedRange | null> {
    const paragraphs = await this.getParagraphs();
    const matches = paragraphs.filter((p) => p.text.includes(locator.startsWith));
    if (matches.length === 1) {
      return {
        found: true,
        paragraphIndex: matches[0].index,
        text: matches[0].text,
      };
    }
    return null;
  }

  async highlight(locator: Locator): Promise<void> {
    // In Google Docs Apps Script, scrolling/highlighting from sidebar
    // requires custom selection range manipulation if supported.
  }

  async applySuggestion(s: Suggestion, mode: 'tracked' | 'direct' = 'direct'): Promise<ApplyResult> {
    const script = this.getScript();
    if (!script) {
      return { success: false, mode, error: 'Google Apps Script context not found.' };
    }

    return new Promise((resolve) => {
      script
        .withSuccessHandler((res: any) => {
          if (res?.success) {
            s.status = 'applied';
            resolve({ success: true, mode });
          } else {
            s.status = 'stale';
            resolve({ success: false, mode, error: res?.error || 'Apply failed.' });
          }
        })
        .withFailureHandler((err: any) => {
          resolve({ success: false, mode, error: String(err) });
        })
        .applyEditRpc(s.original, s.replacement);
    });
  }

  async insertAtCursor(content: RichContent): Promise<void> {
    const script = this.getScript();
    if (!script) return;

    const textToInsert = content.markdown || content.text || '';
    return new Promise((resolve) => {
      script
        .withSuccessHandler(() => resolve())
        .withFailureHandler(() => resolve())
        .insertContentRpc(textToInsert);
    });
  }
}
