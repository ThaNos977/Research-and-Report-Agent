import { GeminiClient } from '../llm/geminiClient';
import { DocumentAdapter } from '../types';
import { HybridRetriever, RetrievedChunk } from '../nlp/retriever';
import { StructureAwareChunker } from '../nlp/chunker';
import { GeminiEmbedder } from '../nlp/embedder';

export interface AskPaperResponse {
  answer: string;
  citedChunks: RetrievedChunk[];
  webSearchUsed: boolean;
  isNotFound: boolean;
}

export class AskPaperSkill {
  private client: GeminiClient;
  private adapter: DocumentAdapter;
  private retriever: HybridRetriever;
  private embedder: GeminiEmbedder;
  private indexed = false;

  constructor(client: GeminiClient, adapter: DocumentAdapter, embedder: GeminiEmbedder) {
    this.client = client;
    this.adapter = adapter;
    this.embedder = embedder;
    this.retriever = new HybridRetriever(embedder, { minScoreThreshold: 0.004 });
  }

  async indexDocument(onProgress?: (msg: string) => void): Promise<number> {
    const notify = onProgress || (() => {});
    notify('Reading document structure...');

    const paragraphs = await this.adapter.getParagraphs();
    const rawChunks = StructureAwareChunker.chunkDocument(paragraphs, { maxChunkSize: 800, overlap: 100 });

    notify(`Embedding ${rawChunks.length} chunks (with hash caching)...`);
    const embeddedChunks = await this.embedder.embedChunks(rawChunks);

    this.retriever.setChunks(embeddedChunks);
    this.indexed = true;
    notify(`Document indexing complete. ${embeddedChunks.length} chunks indexed.`);
    return embeddedChunks.length;
  }

  async ask(
    question: string,
    options: {
      enableWebSearch?: boolean;
      topK?: number;
      onProgress?: (msg: string) => void;
    } = {}
  ): Promise<AskPaperResponse> {
    const notify = options.onProgress || (() => {});
    if (!this.indexed) {
      await this.indexDocument(notify);
    }

    notify(`Retrieving relevant evidence for: "${question}"...`);
    const topK = options.topK ?? 4;
    const retrieved = await this.retriever.retrieve(question, topK);

    // If retrieval score is below threshold, report not found
    if (retrieved.length === 0 || retrieved[0].score < 0.005) {
      if (!options.enableWebSearch) {
        return {
          answer: 'The answer to this question was not found in the current document.',
          citedChunks: [],
          webSearchUsed: false,
          isNotFound: true,
        };
      }
    }

    // Build context prompt
    const chunkContext = retrieved
      .map(
        (r, idx) =>
          `[Source ${idx + 1} | ChunkID: ${r.chunk.id} | Section: ${r.chunk.headingPath.join(' > ') || 'General'}]\n${r.chunk.text}`
      )
      .join('\n\n---\n\n');

    let answer = '';
    let webUsed = false;

    if (options.enableWebSearch) {
      notify('Querying Gemini with hybrid document retrieval + live Google Search grounding...');
      const groundedPrompt = `Question: "${question}"

Document Context:
"""
${chunkContext}
"""

Instructions:
1. Answer the question accurately using the provided Document Context.
2. If the document does not contain all details, supplement with real-time web knowledge.
3. Explicitly distinguish information from [Document] vs [Web Search].
4. When citing the document, refer to the ChunkID like [chunk_X].`;

      const result = await this.client.generateWithGrounding(
        groundedPrompt,
        'You are an authoritative research assistant answering queries over academic papers.'
      );
      answer = result.text;
      webUsed = true;
    } else {
      notify('Synthesizing grounded answer strictly from document chunks...');
      const docPrompt = `Question: "${question}"

Document Context:
"""
${chunkContext}
"""

Instructions:
1. Answer the question using ONLY the facts stated in the Document Context above.
2. Cite the supporting chunk in brackets (e.g. [chunk_1]) for every factual statement.
3. If the context does not contain enough information, state that clearly rather than assuming.`;

      answer = await this.client.generateText(
        docPrompt,
        'You are a strict academic assistant. Never fabricate information beyond the provided context.'
      );
    }

    // Validate cited chunk IDs (filter out hallucinated chunk IDs)
    const citedIdsMatch = answer.match(/chunk_\d+/g) || [];
    const validCitedIds = HybridRetriever.validateCitations(citedIdsMatch, retrieved);
    const validChunks = retrieved.filter((r) => validCitedIds.includes(r.chunk.id));

    return {
      answer,
      citedChunks: validChunks.length > 0 ? validChunks : retrieved.slice(0, 2),
      webSearchUsed: webUsed,
      isNotFound: false,
    };
  }
}
