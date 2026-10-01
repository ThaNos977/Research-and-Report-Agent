/**
 * Core Type Definitions for Research & Documentation Assistant
 * Shared across core engine, host adapters (Word, Google Docs, Mock), and UI.
 */

export type HostType = 'word' | 'gdocs' | 'mock';

export interface Locator {
  host: HostType;
  paragraphIndex: number;   // hint only, shifts when user edits
  startsWith: string;       // first ~40 chars, used to re-find text
  contextHash: string;      // hash of paragraph at index time
  namedRangeId?: string;    // Docs only: survives edits
}

export interface DocChunk {
  id: string;
  text: string;
  headingPath: string[];
  locator: Locator;
  contentHash: string;
  embedding?: number[];
}

export interface Heading {
  id: string;
  text: string;
  level: number;
  path: string[];
}

export interface ParagraphInfo {
  index: number;
  text: string;
  style?: string;
  headingLevel?: number;
  locator: Locator;
}

export interface SelectedText {
  text: string;
  locator: Locator;
}

export interface ResolvedRange {
  found: boolean;
  paragraphIndex: number;
  text: string;
}

export interface ApplyResult {
  success: boolean;
  mode: 'tracked' | 'direct';
  error?: string;
}

export interface RichContent {
  markdown?: string;
  html?: string;
  text?: string;
}

export interface Suggestion {
  id: string;
  locator: Locator;
  original: string;
  replacement: string;
  rationale: string;
  category: 'clarity' | 'tone' | 'structure' | 'grammar' | 'terminology';
  status: 'proposed' | 'applied' | 'dismissed' | 'stale';
  meaningDrift?: {
    similarity: number;
    warning: boolean;
    message?: string;
  };
}

export interface ClaimEvidence {
  title: string;
  url: string;
  snippet: string;
}

export interface ClaimFinding {
  id: string;
  claimText: string;
  locator: Locator;
  citationKeys: string[];
  verdict: 'supported' | 'contradicted' | 'unverifiable' | 'reference_not_found';
  evidence: ClaimEvidence[];
  explanation?: string;
}

export interface CitationRef {
  key: string;               // e.g. "1", "Smith2020"
  rawText: string;
  authors?: string[];
  year?: number;
  title?: string;
  matchedGrounding?: boolean;
}

export interface ReadabilityMetrics {
  fleschReadingEase: number;
  fleschKincaidGrade: number;
  avgSentenceLength: number;
  passiveVoicePercentage: number;
  wordCount: number;
  sentenceCount: number;
}

export interface DocAssistFinding {
  id: string;
  type: 'acronym' | 'header_structure' | 'cross_reference' | 'abstract' | 'toc';
  title: string;
  description: string;
  status: 'pass' | 'warning' | 'info';
  details?: string[];
  suggestedText?: string;
}

export interface AgentStep {
  id: string;
  skill?: string;
  type: 'reasoning' | 'tool_call' | 'observation' | 'plan' | 'proposal' | 'final_answer';
  content: string;
  timestamp: number;
  toolName?: string;
  toolArgs?: any;
}

export interface ResearchReport {
  id?: string;
  topic?: string;
  title: string;
  summary: string;
  sections: {
    heading: string;
    content: string;
  }[];
  sources: ({ title: string; url: string; snippet?: string } | string)[];
  calculations?: string[];
  chartData?: {
    title: string;
    data: { name: string; value: number }[];
  }[];
}

export interface DocumentAdapter {
  capabilities: {
    trackedChanges: boolean;
    anchoredComments: boolean;
    selectionEvents: boolean;
  };
  getDocumentId(): Promise<string>;
  getOutline(): Promise<Heading[]>;
  getParagraphs(): Promise<ParagraphInfo[]>;
  getSelection(): Promise<SelectedText | null>;
  locate(l: Locator): Promise<ResolvedRange | null>;
  highlight(l: Locator): Promise<void>;
  applySuggestion(s: Suggestion, mode: 'tracked' | 'direct'): Promise<ApplyResult>;
  insertAtCursor(content: RichContent): Promise<void>;
}

export interface AssistantSettings {
  geminiApiKey: string;
  modelId: string;
  embeddingModelId: string;
  chunkSize: number;
  chunkOverlap: number;
  retrievalK: number;
  driftThreshold: number;
}

export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
