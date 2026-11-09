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

/**
 * Minimal shape of the pdf.js module this adapter needs. Passing the library in
 * (instead of importing it here) keeps the adapter usable in the browser and in
 * Node tests, which load different pdf.js builds.
 */
export interface PdfJsLib {
  getDocument(src: any): { promise: Promise<any> };
}

interface Segment {
  text: string;
  x0: number;
  x1: number;
  y: number;
  size: number;
  pageWidth: number;
  pageHeight: number;
  page: number;
}

export interface PdfLoadSummary {
  fileName: string;
  pages: number;
  paragraphs: number;
  headings: number;
  columnsDetectedOnPages: number[];
}

const SENTENCE_END = /[.!?:;)\]"”'’]$/;
const NUMBERED_HEADING = /^(\d+(\.\d+){0,3}\.?|[IVX]+\.|[A-Z]\.)\s+[A-Z]/;
const KNOWN_SECTIONS =
  /^(abstract|introduction|related work|background|methods?|methodology|materials and methods|results?|discussion|conclusions?|references|bibliography|acknowledg(e)?ments?)\b/i;

/**
 * Read-only DocumentAdapter over a PDF file.
 *
 * A PDF stores positioned text fragments, not paragraphs or heading styles, so
 * structure is rebuilt from layout: lines from y-position, columns from x-gaps,
 * headings from font size, paragraphs from line spacing. This is a heuristic
 * and works best on text-based academic PDFs; scanned (image-only) PDFs have
 * no text layer and need OCR first.
 */
export class PdfDocumentAdapter implements DocumentAdapter {
  capabilities = {
    trackedChanges: false,
    anchoredComments: false,
    selectionEvents: false,
  };

  private lib: PdfJsLib | null = null;
  private fileName = 'document.pdf';
  private paragraphs: ParagraphInfo[] = [];
  private headings: Heading[] = [];
  private selectedText: string | null = null;
  private highlighted: Locator | null = null;
  private listeners = new Set<() => void>();

  setLibrary(lib: PdfJsLib) {
    this.lib = lib;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  hasDocument(): boolean {
    return this.paragraphs.length > 0;
  }

  getHighlightedLocator(): Locator | null {
    return this.highlighted;
  }

  /** Called by the viewer when the user selects text in the extracted view. */
  setSelection(text: string | null) {
    this.selectedText = text && text.trim() ? text.trim() : null;
  }

  async loadData(data: ArrayBuffer | Uint8Array, fileName = 'document.pdf'): Promise<PdfLoadSummary> {
    if (!this.lib) throw new Error('PDF library not set. Call setLibrary(pdfjs) first.');
    const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data.slice(0));
    const pdf = await this.lib.getDocument({ data: bytes }).promise;

    const segments: Segment[] = [];
    const columnPages: number[] = [];
    const pageCount: number = pdf.numPages;

    for (let n = 1; n <= pageCount; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const pageSegs = PdfDocumentAdapter.buildSegments(content.items, n, viewport.width, viewport.height);
      const ordered = PdfDocumentAdapter.readingOrder(pageSegs, viewport.width);
      if (ordered.twoColumn) columnPages.push(n);
      segments.push(...ordered.segments);
    }

    const cleaned = PdfDocumentAdapter.dropRunningHeadersAndFooters(segments, pageCount);
    if (cleaned.length === 0) {
      throw new Error(
        'No text found in this PDF. It may be a scanned image; run OCR on it first, then load it again.'
      );
    }

    const { paragraphs, headings } = PdfDocumentAdapter.buildParagraphs(cleaned);
    this.paragraphs = paragraphs;
    this.headings = headings;
    this.fileName = fileName;
    this.selectedText = null;
    this.highlighted = null;
    this.notify();

    return {
      fileName,
      pages: pageCount,
      paragraphs: paragraphs.length,
      headings: headings.length,
      columnsDetectedOnPages: columnPages,
    };
  }

  // ---------------------------------------------------------------------------
  // Layout reconstruction (static so it can be tested without a PDF file)
  // ---------------------------------------------------------------------------

  /** Turns pdf.js text items into line segments, splitting at wide horizontal gaps (columns). */
  static buildSegments(items: any[], page: number, pageWidth: number, pageHeight: number): Segment[] {
    const frags = items
      .filter((it) => typeof it.str === 'string' && it.str.trim().length > 0 && Array.isArray(it.transform))
      .map((it) => {
        const size = Math.abs(it.transform[3]) || it.height || 10;
        return { str: it.str as string, x: it.transform[4] as number, y: it.transform[5] as number, w: (it.width as number) || 0, size };
      });

    frags.sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x));

    // Group fragments into lines by y position.
    const lines: (typeof frags)[] = [];
    for (const f of frags) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last[0].y - f.y) <= Math.max(2, f.size * 0.4)) last.push(f);
      else lines.push([f]);
    }

    const segs: Segment[] = [];
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      let cur: typeof frags = [];
      const flush = () => {
        if (!cur.length) return;
        let text = '';
        for (let i = 0; i < cur.length; i++) {
          const f = cur[i];
          if (i > 0) {
            const prev = cur[i - 1];
            const gap = f.x - (prev.x + prev.w);
            const needsSpace = gap > f.size * 0.12 && !/\s$/.test(text) && !/^\s/.test(f.str);
            if (needsSpace) text += ' ';
          }
          text += f.str;
        }
        text = text.replace(/\s+/g, ' ').trim();
        if (text) {
          const last = cur[cur.length - 1];
          segs.push({
            text,
            x0: cur[0].x,
            x1: last.x + last.w,
            y: cur[0].y,
            size: Math.max(...cur.map((c) => c.size)),
            pageWidth,
            pageHeight,
            page,
          });
        }
        cur = [];
      };
      for (let i = 0; i < line.length; i++) {
        const f = line[i];
        const prev = cur[cur.length - 1];
        // A gap wider than ~3 characters between fragments starts a new segment (column break).
        if (prev && f.x - (prev.x + prev.w) > f.size * 3) flush();
        cur.push(f);
      }
      flush();
    }
    return segs;
  }

  /** Orders segments in reading order, handling a two-column body with full-width title/footer bands. */
  static readingOrder(segs: Segment[], pageWidth: number): { segments: Segment[]; twoColumn: boolean } {
    if (segs.length === 0) return { segments: [], twoColumn: false };
    const mid = pageWidth / 2;
    const isFull = (s: Segment) => s.x1 - s.x0 > pageWidth * 0.6 || (s.x0 < mid - pageWidth * 0.05 && s.x1 > mid + pageWidth * 0.05);
    const narrow = segs.filter((s) => !isFull(s));
    const left = narrow.filter((s) => (s.x0 + s.x1) / 2 < mid);
    const right = narrow.filter((s) => (s.x0 + s.x1) / 2 >= mid);
    const twoColumn = narrow.length >= 8 && left.length >= 4 && right.length >= 4;

    const byY = [...segs].sort((a, b) => b.y - a.y || a.x0 - b.x0);
    if (!twoColumn) {
      // Single column: merge any same-y segments left to right (already sorted) and keep top-to-bottom.
      return { segments: byY, twoColumn: false };
    }

    const out: Segment[] = [];
    let band: Segment[] = [];
    const flushBand = () => {
      const l = band.filter((s) => (s.x0 + s.x1) / 2 < mid).sort((a, b) => b.y - a.y);
      const r = band.filter((s) => (s.x0 + s.x1) / 2 >= mid).sort((a, b) => b.y - a.y);
      out.push(...l, ...r);
      band = [];
    };
    for (const s of byY) {
      if (isFull(s)) {
        flushBand();
        out.push(s);
      } else band.push(s);
    }
    flushBand();
    return { segments: out, twoColumn: true };
  }

  /** Removes page numbers and repeated running headers/footers. */
  static dropRunningHeadersAndFooters(segs: Segment[], pageCount: number): Segment[] {
    const norm = (t: string) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
    const edge = (s: Segment) => s.y > s.pageHeight * 0.92 || s.y < s.pageHeight * 0.08;
    const counts = new Map<string, Set<number>>();
    for (const s of segs) {
      if (!edge(s)) continue;
      const k = norm(s.text);
      if (!counts.has(k)) counts.set(k, new Set());
      counts.get(k)!.add(s.page);
    }
    const minPages = Math.max(2, Math.ceil(pageCount * 0.4));
    return segs.filter((s) => {
      if (!edge(s)) return true;
      if (/^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i.test(s.text.trim())) return false;
      const pages = counts.get(norm(s.text));
      return !(pageCount >= 2 && pages && pages.size >= minPages);
    });
  }

  /** Builds paragraphs and heading levels from ordered segments. */
  static buildParagraphs(segs: Segment[]): { paragraphs: ParagraphInfo[]; headings: Heading[] } {
    // Body font size = size carrying the most characters.
    const sizeWeight = new Map<number, number>();
    for (const s of segs) {
      const k = Math.round(s.size * 2) / 2;
      sizeWeight.set(k, (sizeWeight.get(k) || 0) + s.text.length);
    }
    let body = 10;
    let best = -1;
    for (const [size, w] of sizeWeight) if (w > best) { best = w; body = size; }

    const isHeading = (s: Segment) => {
      const t = s.text.trim();
      if (t.length === 0 || t.length > 120) return false;
      const bigger = s.size >= body * 1.15;
      const numbered = NUMBERED_HEADING.test(t) && t.length < 90 && !SENTENCE_END.test(t) && s.size >= body * 0.98;
      const known = KNOWN_SECTIONS.test(t) && t.length < 40;
      return bigger || numbered || known;
    };

    type Block = { text: string; size: number; heading: boolean; page: number };
    const blocks: Block[] = [];
    let cur: Block | null = null;
    let prev: Segment | null = null;

    const push = () => {
      if (cur && cur.text.trim()) blocks.push(cur);
      cur = null;
    };

    for (const s of segs) {
      const heading = isHeading(s);
      const newPage = prev ? s.page !== prev.page : false;
      const lineGap = prev && !newPage ? prev.y - s.y : 0;
      const bigGap = prev && !newPage ? lineGap > Math.max(prev.size, s.size) * 1.65 : false;
      const sameRowAsPrev = prev && !newPage && Math.abs(prev.y - s.y) < 2;
      const sizeShift = prev ? Math.abs(prev.size - s.size) > body * 0.2 : false;

      if (!cur) {
        cur = { text: s.text, size: s.size, heading, page: s.page };
      } else if (heading || cur.heading) {
        // headings stand alone, except a heading that wraps onto a second line of equal size
        const startsNewHeading = NUMBERED_HEADING.test(s.text) || KNOWN_SECTIONS.test(s.text);
        const sameSize = prev ? Math.abs(prev.size - s.size) < 0.5 : false;
        if (heading && cur.heading && sameSize && !startsNewHeading && !bigGap && !sameRowAsPrev && !newPage && cur.text.length < 80) {
          cur.text += ' ' + s.text;
        } else {
          push();
          cur = { text: s.text, size: s.size, heading, page: s.page };
        }
      } else if (bigGap || sizeShift) {
        push();
        cur = { text: s.text, size: s.size, heading: false, page: s.page };
      } else if (newPage && (SENTENCE_END.test(cur.text) && /^[A-Z0-9]/.test(s.text))) {
        push();
        cur = { text: s.text, size: s.size, heading: false, page: s.page };
      } else {
        // continuation line (join hyphenated words)
        if (/[a-z]-$/.test(cur.text) && /^[a-z]/.test(s.text)) cur.text = cur.text.slice(0, -1) + s.text;
        else cur.text += ' ' + s.text;
      }
      prev = s;
    }
    push();

    // Heading levels: largest heading size = level 1, then 2, 3. Numbered headings use their depth.
    const headingSizes = Array.from(new Set(blocks.filter((b) => b.heading).map((b) => Math.round(b.size * 2) / 2))).sort((a, b) => b - a);
    const levelFor = (b: Block): number => {
      const m = b.text.match(/^(\d+(?:\.\d+){0,3})\.?\s/);
      if (m) return Math.min(3, m[1].split('.').length);
      const idx = headingSizes.indexOf(Math.round(b.size * 2) / 2);
      return Math.min(3, Math.max(1, idx + 1));
    };

    const paragraphs: ParagraphInfo[] = [];
    const headings: Heading[] = [];
    let path: string[] = [];
    let hSeq = 1;
    blocks.forEach((b, i) => {
      const text = b.text.replace(/\s+/g, ' ').trim();
      const level = b.heading ? levelFor(b) : undefined;
      if (level) {
        path = path.slice(0, level - 1);
        path[level - 1] = text;
        headings.push({ id: `pdf_h_${hSeq++}`, text, level, path: [...path] });
      }
      paragraphs.push({
        index: i,
        text,
        style: level ? `Heading ${level}` : undefined,
        headingLevel: level,
        locator: {
          host: 'pdf',
          paragraphIndex: i,
          startsWith: text.slice(0, 40),
          contextHash: StructureAwareChunker.hashText(text),
        },
      });
    });

    return { paragraphs, headings };
  }

  // ---------------------------------------------------------------------------
  // DocumentAdapter
  // ---------------------------------------------------------------------------

  async getDocumentId(): Promise<string> {
    return `pdf:${this.fileName}`;
  }

  async getOutline(): Promise<Heading[]> {
    return this.headings;
  }

  async getParagraphs(): Promise<ParagraphInfo[]> {
    return this.paragraphs;
  }

  async getSelection(): Promise<SelectedText | null> {
    if (!this.selectedText) return null;
    const text = this.selectedText;
    const p = this.paragraphs.find((x) => x.text.includes(text.slice(0, 60)));
    return {
      text,
      locator: p
        ? p.locator
        : { host: 'pdf', paragraphIndex: 0, startsWith: text.slice(0, 40), contextHash: StructureAwareChunker.hashText(text) },
    };
  }

  async locate(locator: Locator): Promise<ResolvedRange | null> {
    const hinted = this.paragraphs[locator.paragraphIndex];
    if (hinted && hinted.locator.contextHash === locator.contextHash) {
      return { found: true, paragraphIndex: hinted.index, text: hinted.text };
    }
    const matches = this.paragraphs.filter((p) => p.text.includes(locator.startsWith));
    if (matches.length === 1) {
      return { found: true, paragraphIndex: matches[0].index, text: matches[0].text };
    }
    return null;
  }

  async highlight(locator: Locator): Promise<void> {
    this.highlighted = locator;
    this.notify();
  }

  async applySuggestion(s: Suggestion, mode: 'tracked' | 'direct' = 'direct'): Promise<ApplyResult> {
    // A PDF cannot be edited in place. The suggestion stays proposed so the user can copy it into the source document.
    return {
      success: false,
      mode,
      error: 'PDF files are read-only. Copy the suggested text into the original Word or Docs file.',
    };
  }

  async insertAtCursor(_content: RichContent): Promise<void> {
    // No cursor in a PDF; generated content is shown in the task pane and can be copied from there.
  }
}
