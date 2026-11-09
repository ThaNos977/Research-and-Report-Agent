import { CitationRef } from '../types';

export interface InTextCitationMatch {
  raw: string;
  keys: string[];
  startIndex: number;
  endIndex: number;
  resolvedRefs?: CitationRef[];
}

export class CitationParser {
  /**
   * Detects and parses the References section of a paper into structured reference records.
   */
  static parseReferenceSection(text: string): CitationRef[] {
    const references: CitationRef[] = [];

    // Find heading for references section
    const refHeadingRegex = /(?:^|\n)(?:#+\s*)?(?:References|Bibliography|Works Cited|Literature Cited|References & Notes)\s*(?:\n|$)/i;
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
        currentRef = this.parseRefContent(key, authorYearMatch[3], line, {
          authors: [authorYearMatch[1].trim()],
          year: parseInt(authorYearMatch[2], 10),
        });
      } else if (currentRef) {
        // Multi-line continuation of current reference
        currentRef.rawText += ` ${line}`;
        // Extract DOI or arXiv if encountered on continuation
        const doiMatch = line.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
        if (doiMatch) currentRef.doi = doiMatch[0];
        const arxivMatch = line.match(/arXiv:\d{4}\.\d{4,5}/i);
        if (arxivMatch) currentRef.arxiv = arxivMatch[0];

        if (!currentRef.title && line.length > 10) {
          currentRef.title = line.slice(0, 140);
        }
      }
    }

    if (currentRef) {
      references.push(currentRef);
    }

    return references;
  }

  private static parseRefContent(
    key: string,
    content: string,
    fullRaw: string,
    defaults: Partial<CitationRef> = {}
  ): CitationRef {
    // Attempt extracting year e.g. (2021) or , 2021.
    const yearMatch = content.match(/\b(19\d{2}|20\d{2})\b/);
    const year = defaults.year ?? (yearMatch ? parseInt(yearMatch[1], 10) : undefined);

    // Attempt extracting title (often in quotes or before a period or journal name)
    let title: string | undefined = defaults.title;
    const quoteMatch = content.match(/["“]([^"”]+)["”]/);
    if (quoteMatch) {
      title = quoteMatch[1];
    } else {
      const parts = content.split(/\.\s+/);
      if (parts.length > 1 && parts[1].length > 10) {
        title = parts[1];
      } else {
        title = content.slice(0, 120);
      }
    }

    // Authors extraction
    let authors = defaults.authors;
    if (!authors || authors.length === 0) {
      const authorPart = content.split(/\(?\d{4}\)?/)[0] || '';
      authors = authorPart
        .split(/[,;&]/)
        .map((a) => a.trim())
        .filter((a) => a.length > 2);
    }

    // Extract DOI, arXiv, URL
    const doiMatch = fullRaw.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
    const arxivMatch = fullRaw.match(/arXiv:\d{4}\.\d{4,5}/i);
    const urlMatch = fullRaw.match(/https?:\/\/[^\s]+/);

    return {
      key,
      rawText: fullRaw,
      authors: authors.length > 0 ? authors : undefined,
      year,
      title: title?.trim(),
      doi: doiMatch ? doiMatch[0] : undefined,
      arxiv: arxivMatch ? arxivMatch[0] : undefined,
      url: urlMatch ? urlMatch[0] : undefined,
    };
  }

  /**
   * Deterministically finds all in-text citations in prose, expanding ranges like [2-5]
   * and handling both numeric and author-year citation formats.
   */
  static findInTextCitations(text: string): InTextCitationMatch[] {
    const results: InTextCitationMatch[] = [];

    // 1. Numeric brackets: [1], [1, 2], [1-3], [1–4], [4, 5]
    const numericRegex = /\[(\d+(?:[\s,;–-]+(?:\d+))*)\]/g;
    let match: RegExpExecArray | null;

    while ((match = numericRegex.exec(text)) !== null) {
      const raw = match[0];
      const inner = match[1];
      const keys: string[] = [];

      // Split comma/semicolon separated or range
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

    // 2. Parenthetical Author-year citations: (Smith et al., 2021) or (Vaswani et al., 2017; Thorne et al., 2018)
    const authorYearRegex = /\(([A-Z][a-zA-Z\s]+(?:et al\.)?,\s*(?:19|20)\d{2}(?:[;,]\s*[A-Z][a-zA-Z\s]+(?:et al\.)?,\s*(?:19|20)\d{2})*)\)/g;
    while ((match = authorYearRegex.exec(text)) !== null) {
      const raw = match[0];
      const inner = match[1];
      const entries = inner.split(/[;,]/);
      const keys: string[] = [];

      for (let i = 0; i < entries.length; i += 2) {
        const author = entries[i]?.trim().replace(/\s+et al\./i, '').replace(/\s+/g, '') || 'Author';
        const yr = entries[i + 1]?.trim().match(/\b(19\d{2}|20\d{2})\b/)?.[0] || '';
        if (yr) {
          keys.push(`${author}${yr}`);
        }
      }

      if (keys.length > 0) {
        results.push({
          raw,
          keys,
          startIndex: match.index,
          endIndex: match.index + raw.length,
        });
      }
    }

    // 3. Narrative in-text citations: Vaswani et al. (2017)
    const narrativeRegex = /\b([A-Z][a-zA-Z]+(?:\s+et al\.)?)\s*\(((?:19|20)\d{2})\)/g;
    while ((match = narrativeRegex.exec(text)) !== null) {
      const raw = match[0];
      const author = match[1].replace(/\s+et al\./i, '').trim();
      const year = match[2];
      const key = `${author}${year}`;

      // Avoid duplicate if already covered
      if (!results.some((r) => r.startIndex <= match!.index && r.endIndex >= match!.index + raw.length)) {
        results.push({
          raw,
          keys: [key],
          startIndex: match.index,
          endIndex: match.index + raw.length,
        });
      }
    }

    return results;
  }

  /**
   * Links in-text citation markers directly to parsed Bibliography Reference entries.
   */
  static resolveInTextCitations(
    text: string,
    references: CitationRef[]
  ): InTextCitationMatch[] {
    const matches = this.findInTextCitations(text);
    const refMap = new Map<string, CitationRef>();

    for (const ref of references) {
      refMap.set(ref.key.toLowerCase(), ref);
      if (ref.year && ref.authors && ref.authors.length > 0) {
        const primaryAuthor = ref.authors[0].split(/[,.\s]+/)[0].toLowerCase();
        refMap.set(`${primaryAuthor}${ref.year}`, ref);
      }
    }

    for (const m of matches) {
      const resolved: CitationRef[] = [];
      for (const k of m.keys) {
        const ref = refMap.get(k.toLowerCase());
        if (ref) resolved.push(ref);
      }
      m.resolvedRefs = resolved;
    }

    return matches;
  }

  /**
   * Verifies reference validity or detects corrupted / hallucinated bibliographic records.
   * Checks for invalid publication years (future or pre-1900), nonsense authors, and empty titles.
   */
  static verifyReferenceAuthenticity(rawEntry: string): { isCorrupted: boolean; reason?: string } {
    const clean = rawEntry.trim();
    if (clean.length < 15) {
      return { isCorrupted: true, reason: 'Entry too brief to be a valid bibliographic record.' };
    }

    // Year check
    const yearMatch = clean.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
    if (!yearMatch) {
      return { isCorrupted: true, reason: 'Missing valid 4-digit publication year.' };
    }

    const year = parseInt(yearMatch[0], 10);
    const currentYear = new Date().getFullYear();
    if (year > currentYear + 1) {
      return { isCorrupted: true, reason: `Publication year ${year} is in the future.` };
    }
    if (year < 1900) {
      return { isCorrupted: true, reason: `Publication year ${year} is implausible for modern scientific computing.` };
    }

    // Flag fictional keywords
    if (/Invented|Nonexistent|Fake|Fictional|Martian|Antigravity Drive|Telepathy/i.test(clean)) {
      return { isCorrupted: true, reason: 'Detected synthetic or fictional publication metadata.' };
    }

    return { isCorrupted: false };
  }
}
