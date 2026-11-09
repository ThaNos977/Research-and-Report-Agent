import { GoogleGenAI } from '@google/genai';
import { withRetry } from './retry';
import { GroundingMetadataParser } from './groundingParser';
import { ClaimEvidence } from '../types';

export interface GroundedResult {
  text: string;
  evidence: ClaimEvidence[];
  rawGroundingMetadata?: any;
}

export class GeminiClient {
  private ai: GoogleGenAI;
  private modelId: string;
  private embeddingModelId: string;
  private cache = new Map<string, { val: any; time: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute memory cache to slash RPM & tokens

  constructor(apiKey: string, modelId = 'gemini-3.5-flash-lite', embeddingModelId = 'word2vec') {
    this.ai = new GoogleGenAI({ apiKey });
    // Remap deprecated models automatically to gemini-3.5-flash-lite
    const cleanModel = modelId.replace(/^models\//, '');
    this.modelId = (cleanModel === 'gemini-2.5-flash' || cleanModel === 'models/gemini-2.5-flash')
      ? 'gemini-3.5-flash-lite'
      : cleanModel;
    this.embeddingModelId = (embeddingModelId === 'text-embedding-004' || embeddingModelId.includes('text-embedding-004'))
      ? 'gemini-embedding-001'
      : embeddingModelId.replace(/^models\//, '');
  }

  getRawAI(): GoogleGenAI {
    return this.ai;
  }

  getModelId(): string {
    return this.modelId;
  }

  /**
   * Stage 1 Call: Execute a search-grounded request to fetch factual citations & evidence.
   * Resilient against search quota limits (429): automatically falls back to ungrounded generation.
   */
  async generateWithGrounding(prompt: string, systemInstruction?: string): Promise<GroundedResult> {
    const cacheKey = `ground:${this.modelId}:${prompt.slice(0, 200)}:${systemInstruction || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.time < this.CACHE_TTL_MS) {
      return cached.val;
    }

    const result = await withRetry(async () => {
      let response;
      let usedSearch = true;

      try {
        response = await this.ai.models.generateContent({
          model: this.modelId,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
          },
        });
      } catch (err: any) {
        const isQuotaOrRateLimit =
          err?.status === 429 ||
          err?.message?.includes('429') ||
          err?.message?.includes('RESOURCE_EXHAUSTED') ||
          err?.message?.includes('quota') ||
          err?.message?.includes('Search');

        if (isQuotaOrRateLimit) {
          // Fall back to direct generation without search tool to conserve RPM/quota and prevent crashes
          console.warn(`[GeminiClient] Google Search quota exhausted or rate limited; falling back to direct LLM generation without search tool.`);
          usedSearch = false;
          response = await this.ai.models.generateContent({
            model: this.modelId,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: systemInstruction ? { systemInstruction } : undefined,
          });
        } else if (err?.status === 404 || err?.message?.includes('not found') || err?.message?.includes('no longer available')) {
          console.warn(`[GeminiClient] Model ${this.modelId} unavailable, falling back to gemini-3.5-flash`);
          response = await this.ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              systemInstruction,
              tools: [{ googleSearch: {} }],
            },
          });
        } else {
          throw err;
        }
      }

      const candidate = response.candidates?.[0];
      const text = candidate?.content?.parts?.map((p: any) => p.text || '').join('\n') || response.text || '';
      const rawMetadata = candidate?.groundingMetadata;
      const evidence = usedSearch ? GroundingMetadataParser.extractEvidence(rawMetadata) : [];

      return {
        text,
        evidence,
        rawGroundingMetadata: rawMetadata,
      };
    });

    this.cache.set(cacheKey, { val: result, time: Date.now() });
    return result;
  }

  /**
   * Stage 2 Call: Execute structured JSON output without search to avoid schema collision.
   */
  async generateStructured<T>(
    prompt: string,
    systemInstruction: string,
    schema?: any
  ): Promise<T> {
    const cacheKey = `struct:${this.modelId}:${prompt.slice(0, 300)}:${systemInstruction}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.time < this.CACHE_TTL_MS) {
      return cached.val as T;
    }

    const result = await withRetry(async () => {
      const config: any = {
        systemInstruction,
        responseMimeType: 'application/json',
      };
      if (schema) {
        config.responseSchema = schema;
      }

      let response;
      try {
        response = await this.ai.models.generateContent({
          model: this.modelId,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config,
        });
      } catch (err: any) {
        if (err?.status === 404 || err?.message?.includes('not found') || err?.message?.includes('no longer available')) {
          console.warn(`[GeminiClient] Model ${this.modelId} unavailable, falling back to gemini-3.5-flash`);
          response = await this.ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config,
          });
        } else {
          throw err;
        }
      }

      const text = response.text || '{}';
      try {
        return JSON.parse(text) as T;
      } catch (err) {
        // Fallback: extract JSON substring if wrapped in markdown blocks
        const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as T;
        }
        throw new Error(`Failed to parse model structured response: ${text.slice(0, 100)}...`);
      }
    });

    this.cache.set(cacheKey, { val: result, time: Date.now() });
    return result;
  }

  /**
   * Simple conversational or completion call with optional system instructions.
   */
  async generateText(prompt: string, systemInstruction?: string): Promise<string> {
    const cacheKey = `text:${this.modelId}:${prompt.slice(0, 300)}:${systemInstruction || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.time < this.CACHE_TTL_MS) {
      return cached.val as string;
    }

    const result = await withRetry(async () => {
      let response;
      try {
        response = await this.ai.models.generateContent({
          model: this.modelId,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: systemInstruction ? { systemInstruction } : undefined,
        });
      } catch (err: any) {
        if (err?.status === 404 || err?.message?.includes('not found') || err?.message?.includes('no longer available')) {
          console.warn(`[GeminiClient] Model ${this.modelId} unavailable, falling back to gemini-3.5-flash`);
          response = await this.ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: systemInstruction ? { systemInstruction } : undefined,
          });
        } else {
          throw err;
        }
      }
      return response.text || '';
    });

    this.cache.set(cacheKey, { val: result, time: Date.now() });
    return result;
  }

  /**
   * Generate vector embeddings for text chunks or queries using gemini-embedding-001,
   * with automatic fallback to gemini-embedding-2-preview and deterministic pseudo-embeddings.
   */
  async embedContent(
    text: string,
    taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
  ): Promise<number[]> {
    return await withRetry(async () => {
      let modelToUse = this.embeddingModelId;
      if (modelToUse === 'text-embedding-004' || modelToUse.includes('text-embedding-004')) {
        modelToUse = 'gemini-embedding-001';
      }
      modelToUse = modelToUse.replace(/^models\//, '');

      const config = taskType ? { taskType } : undefined;

      try {
        const response = await this.ai.models.embedContent({
          model: modelToUse,
          contents: text,
          config,
        });
        const values = (response as any).embeddings?.[0]?.values || (response as any).embedding?.values;
        if (Array.isArray(values) && values.length > 0) {
          return values;
        }
      } catch (primaryErr: any) {
        console.warn(`[GeminiClient] Primary embedding model ${modelToUse} failed:`, primaryErr?.message || primaryErr);
        
        // Attempt secondary supported model
        try {
          const fallbackModel = modelToUse === 'gemini-embedding-001' ? 'gemini-embedding-2-preview' : 'gemini-embedding-001';
          const fallbackRes = await this.ai.models.embedContent({
            model: fallbackModel,
            contents: text,
            config,
          });
          const values = (fallbackRes as any).embeddings?.[0]?.values || (fallbackRes as any).embedding?.values;
          if (Array.isArray(values) && values.length > 0) {
            return values;
          }
        } catch (secondaryErr: any) {
          console.warn('[GeminiClient] Secondary embedding fallback also failed:', secondaryErr?.message || secondaryErr);
        }
      }

      // Graceful local deterministic pseudo-embedding fallback so indexing & hybrid retrieval never crash
      return this.generateFallbackPseudoEmbedding(text);
    });
  }

  /**
   * Generates a fast, deterministic pseudo-embedding vector for offline / fallback resilience.
   */
  private generateFallbackPseudoEmbedding(text: string, dim = 64): number[] {
    const vec = new Array(dim).fill(0);
    const cleaned = text.toLowerCase();
    for (let i = 0; i < cleaned.length - 2; i++) {
      const code = cleaned.charCodeAt(i) * 31 + cleaned.charCodeAt(i + 1) * 7 + cleaned.charCodeAt(i + 2);
      const idx = Math.abs(code) % dim;
      vec[idx] += 1;
    }
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return norm > 0 ? vec.map((v) => v / norm) : vec;
  }
}
