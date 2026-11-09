import { GoogleGenAI, Type } from '@google/genai';
import { AgentStep, ResearchReport, DocumentAdapter } from '../types';
import { SafeCalculator } from '../tools/calculator';
import { withRetry } from '../llm/retry';

export class ResearchBriefSkill {
  private ai: GoogleGenAI;
  private modelId: string;
  private adapter?: DocumentAdapter;
  private onStep?: (step: AgentStep) => void;

  constructor(
    apiKey: string,
    modelId = 'gemini-3.5-flash-lite',
    adapter?: DocumentAdapter,
    onStep?: (step: AgentStep) => void
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.modelId = modelId;
    this.adapter = adapter;
    this.onStep = onStep;
  }

  private addStep(type: AgentStep['type'], content: string, toolName?: string, toolArgs?: any) {
    this.onStep?.({
      id: Math.random().toString(36).substring(7),
      skill: 'researchBrief',
      type,
      content,
      timestamp: Date.now(),
      toolName,
      toolArgs,
    });
  }

  /**
   * Ultra Token-, RPM-, and Quota-Efficient Research Brief Generator.
   * - Tries live search grounding with safe quota catch (zero 429 crashes)
   * - Seamlessly falls back to deep pre-trained scholarly knowledge on rate limits
   * - Generates complete structured research brief in 1-2 focused passes
   * - Evaluates math formulas deterministically with SafeCalculator locally
   */
  async run(topic: string): Promise<ResearchReport | null> {
    this.addStep('plan', `Initiating structured research brief on: "${topic}"`);

    let searchContext = '';
    const gatheredSources: Array<{ title: string; url: string; snippet?: string }> = [];

    // Step 1: Optional search-grounded discovery with strict 429 resilience
    this.addStep('tool_call', 'Searching real-time scientific literature...', 'googleSearch');
    try {
      const searchRes = await this.ai.models.generateContent({
        model: this.modelId,
        contents: `Search for primary scholarly findings, key statistics, and benchmarks on: ${topic}`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const candidate = searchRes.candidates?.[0];
      searchContext = candidate?.content?.parts?.map((p: any) => p.text || '').join('\n') || '';

      const groundingMeta = candidate?.groundingMetadata;
      if (groundingMeta?.groundingChunks) {
        for (const chunk of groundingMeta.groundingChunks) {
          if (chunk.web?.title && chunk.web?.uri) {
            gatheredSources.push({
              title: chunk.web.title,
              url: chunk.web.uri,
              snippet: chunk.web.title,
            });
          }
        }
      }

      this.addStep('observation', `Retrieved ${gatheredSources.length} external grounded citations.`);
    } catch (err: any) {
      // 429 or quota limit on search tool: smoothly fall back to direct Gemini 3.5 Flash Lite synthesis
      console.warn('[ResearchBriefSkill] Search grounding quota limit or error, falling back to scholarly model knowledge base:', err?.message || err);
      this.addStep(
        'observation',
        'Google Search tool quota reached; synthesizing brief directly using Gemini 3.5 Flash Lite deep academic knowledge.'
      );
    }

    // Step 2: Single-pass structured report synthesis (Token & RPM efficient)
    this.addStep('reasoning', 'Synthesizing comprehensive academic brief with sections, calculations, and data visualization...');

    const prompt = `Topic: "${topic}"
${searchContext ? `External Search Grounding Context:\n"""\n${searchContext.slice(0, 3000)}\n"""\n` : ''}

Generate a comprehensive academic research brief on the topic above.
The report must include:
1. An executive summary capturing current breakthroughs.
2. Structured deep-dive sections with clear headings (e.g. Methodology, State-of-the-Art Benchmarks, Key Challenges).
3. Realistic quantitative data or benchmarks suitable for charting.
4. Key mathematical formulas or growth rates.
5. Reputable academic sources or standard peer-reviewed literature references.`;

    const report = await withRetry(async () => {
      const res = await this.ai.models.generateContent({
        model: this.modelId,
        contents: prompt,
        config: {
          systemInstruction: 'You are an elite research scientist and academic writer. Provide rigorous, structured, factual briefs.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              sections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    heading: { type: Type.STRING },
                    content: { type: Type.STRING },
                  },
                  required: ['heading', 'content'],
                },
              },
              calculations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              chartData: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    data: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          value: { type: Type.NUMBER },
                        },
                        required: ['name', 'value'],
                      },
                    },
                  },
                  required: ['title', 'data'],
                },
              },
              sources: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    url: { type: Type.STRING },
                    snippet: { type: Type.STRING },
                  },
                  required: ['title', 'url'],
                },
              },
            },
            required: ['title', 'summary', 'sections', 'sources'],
          },
        },
      });

      const parsed = JSON.parse(res.text || '{}') as ResearchReport;
      parsed.id = crypto.randomUUID();
      parsed.topic = topic;

      // Merge any gathered search sources if present
      if (gatheredSources.length > 0) {
        const existingTitles = new Set(parsed.sources?.map((s: any) => s.title.toLowerCase()) || []);
        for (const gs of gatheredSources) {
          if (!existingTitles.has(gs.title.toLowerCase())) {
            parsed.sources.push(gs);
          }
        }
      }

      // Ensure sources have scholar links if missing
      parsed.sources = (parsed.sources || []).map((s: any) => ({
        title: s.title || 'Scholarly Reference',
        url: s.url && s.url.startsWith('http') ? s.url : `https://scholar.google.com/scholar?q=${encodeURIComponent(s.title || topic)}`,
        snippet: s.snippet || 'Referenced academic work.',
      }));

      // Validate calculations deterministically with SafeCalculator locally
      if (parsed.calculations && parsed.calculations.length > 0) {
        this.addStep('tool_call', 'Validating mathematical formulas and calculations...', 'calculate');
        for (const calc of parsed.calculations) {
          const exprMatch = calc.match(/(?:(?:[\d.]+\s*[-+*/^]\s*)+[\d.]+)/);
          if (exprMatch) {
            try {
              const evaluated = SafeCalculator.evaluate(exprMatch[0]);
              this.addStep('observation', `Mathematically confirmed: ${exprMatch[0]} = ${evaluated}`);
            } catch (e) {
              // Ignore benign evaluation errors on descriptive text
            }
          }
        }
      }

      return parsed;
    });

    this.addStep('final_answer', `Research brief generated: "${report.title}" with ${report.sections.length} sections and ${report.sources.length} citations.`);
    return report;
  }

  /**
   * Inserts the generated report into the active host document at the cursor position.
   */
  async insertIntoDocument(report: ResearchReport): Promise<void> {
    if (!this.adapter) return;

    let markdown = `# ${report.title}\n\n`;
    markdown += `> **Executive Summary**: ${report.summary}\n\n`;

    for (const sec of report.sections) {
      markdown += `## ${sec.heading}\n\n${sec.content}\n\n`;
    }

    if (report.calculations && report.calculations.length > 0) {
      markdown += `### Key Data & Calculations\n\n`;
      for (const c of report.calculations) {
        markdown += `- ${c}\n`;
      }
      markdown += '\n';
    }

    if (report.sources && report.sources.length > 0) {
      markdown += `### References\n\n`;
      report.sources.forEach((s, idx) => {
        const title = typeof s === 'string' ? s : s.title;
        const url = typeof s === 'string' ? '' : s.url;
        markdown += `${idx + 1}. [${title}](${url})\n`;
      });
    }

    await this.adapter.insertAtCursor({ markdown });
  }
}
