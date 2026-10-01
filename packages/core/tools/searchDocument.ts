import { HybridRetriever, RetrievedChunk } from '../nlp/retriever';

export interface SearchDocumentArgs {
  query: string;
  topK?: number;
}

export class SearchDocumentTool {
  private retriever: HybridRetriever;

  constructor(retriever: HybridRetriever) {
    this.retriever = retriever;
  }

  async execute(args: SearchDocumentArgs): Promise<{
    results: Array<{ chunkId: string; heading: string; snippet: string; score: number }>;
    rawChunks: RetrievedChunk[];
  }> {
    const topK = args.topK ?? 5;
    const retrieved = await this.retriever.retrieve(args.query, topK);

    return {
      results: retrieved.map((r) => ({
        chunkId: r.chunk.id,
        heading: r.chunk.headingPath.join(' > ') || 'General',
        snippet: r.chunk.text.slice(0, 300),
        score: parseFloat(r.score.toFixed(4)),
      })),
      rawChunks: retrieved,
    };
  }
}
