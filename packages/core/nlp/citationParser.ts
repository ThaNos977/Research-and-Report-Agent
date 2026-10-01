import { CitationRef } from '../types';

export interface InTextCitationMatch {
  raw: string;
  keys: string[];
  startIndex: number;
  endIndex: number;
}

export class CitationParser {
  /**
   * Detects and parses the References section of a paper into structured reference records.
   */
  static parseReferenceSection(text: string): CitationRef[] {
    const references: CitationRef[] = [];

    // Find heading for references section
    const refHeadingRegex = /(?:^|\n)(?:#+\s*)?(?:References|Bibliography|Works Cited|Literature Cited)\s*(?:\n|$)/i;
    const match = text.match(refHeadingRegex);
    if (!match || match.index === undefined) {
      return [];
    }

    const refBody = text.slice(match.index + match[0].length);
    const lines = refBody.split(/\n+/).map((l) => l.trim()).filter(Boolean);

    let currentRef: CitationRef | null = null;

    for (const line of lines) {
      // Check if line starts a new reference entry
      // Numeric: [1] or 1.
      const numMatch = line.match(/^(?:\[(\d+)\]|(\d+)\.)\s*(.*)$/);
      // Author-year: e.g. "Smith, J. (2020)" or "Vaswani et al. (2017)"
      const authorYearMatch = line.match(/^([A-Z][a-zA-Z\s,.]+)\s*\((\d{4})\)\.?\s*(.*)$/);

      if (numMatch) {
        if (currentRef) references.push(currentRef);
        const key = numMatch[1] || numMatch[2];
        const rest = numMatch[3];
        currentRef = this.parseRefContent(key, rest, line);
      } else if (authorYearMatch) {
        if (currentRef) references.push(currentRef);
        const key = `${authorYearMatch[1].split(',')[0].trim().replace(/\s+/g, '')}${authorYearMatch[2]}`;
        currentRef = {
          key,
          rawText: line,
          authors: [authorYearMatch[1].trim()],
          year: parseInt(authorYearMatch[2], 10),
          title: authorYearMatch[3]?.slice(0, 120),
        };
      } else if (currentRef) {
        // Multi-line continuation of current reference
        currentRef.rawText += ` ${line}`;
        if (!currentRef.title && line.length > 10) {
          currentRef.title = line.slice(0, 120);
        }
      }
    }

    if (currentRef) {
      references.push(currentRef);
    }

    return references;
  }

  private static parseRefContent(key: string, content: string, fullRaw: string): CitationRef {
    // Attempt extracting year e.g. (2021) or , 2021.
    const yearMatch = content.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

    // Attempt extracting title (often in quotes or before a period or journal name)
    let title: string | undefined;
    const quoteMatch = content.match(/["“]([^"”]+)["”]/);
    if (quoteMatch) {
      title = quoteMatch[1];
    } else {
      const parts = content.split(/\.\s+/);
      if (parts.length > 1 && parts[1].length > 10) {
        title = parts[1];
      } else {
        title = content.slice(0, 100);
      }
    }

    // Authors extraction
    const authorPart = content.split(/\(?\d{4}\)?/)[0] || '';
    const authors = authorPart
      .split(/[,;&]/)
      .map((a) => a.trim())
      .filter((a) => a.length > 2);

    return {
      key,
      rawText: fullRaw,
      authors: authors.length > 0 ? authors : undefined,
      year,
      title: title?.trim(),
    };
  }

  /**
   * Deterministically finds all in-text citations in prose, expanding ranges like [2-5].
   */
  static findInTextCitations(text: string): InTextCitationMatch[] {
    const results: InTextCitationMatch[] = [];

    // 1. Numeric brackets: [1], [1, 2], [1-3], [1–4]
    const numericRegex = /\[(\d+(?:[\s,–-]+(?:\d+))*)\]/g;
    let match: RegExpExecArray | null;

    while ((match = numericRegex.exec(text)) !== null) {
      const raw = match[0];
      const inner = match[1];
      const keys: string[] = [];

      // Split comma separated or range
      const tokens = inner.split(/[,;\s]+/).filter(Boolean);
      for (const tok of tokens) {
        if (tok.includes('-') || tok.includes('–')) {
          const [startStr, endStr] = tok.split(/[-–]/);
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);
          if (!isNaN(start) && !isNaN(end) && end >= start && end - start < 30) {
            for (let i = start; i <= end; i++) {
              keys.push(String(i));
            }
          } else {
            keys.push(tok);
          }
        } else {
          keys.push(tok);
        }
      }

      results.push({
        raw,
        keys,
        startIndex: match.index,
        endIndex: match.index + raw.length,
      });
    }

    // 2. Author-year citations: (Smith et al., 2021) or (Johnson, 2019; Davis, 2020)
    const authorYearRegex = /\(([A-Z][a-zA-Z\s]+(?:et al\.)?,\s*(?:19|20)\d{2}(?:[;,]\s*[A-Z][a-zA-Z\s]+(?:et al\.)?,\s*(?:19|20)\d{2})*)\)/g;
    while ((match = authorYearRegex.exec(text)) !== null) {
      const raw = match[0];
      const inner = match[1];
      const entries = inner.split(';');
      const keys = entries.map((e) => {
        const parts = e.split(',');
        const author = parts[0]?.trim().replace(/\s+et al\./i, '').replace(/\s+/g, '') || 'Author';
        const yr = parts[1]?.trim() || '';
        return `${author}${yr}`;
      });

      results.push({
        raw,
        keys,
        startIndex: match.index,
        endIndex: match.index + raw.length,
      });
    }

    return results;
  }
}
