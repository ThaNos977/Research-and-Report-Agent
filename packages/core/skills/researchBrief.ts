import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { AgentStep, ResearchReport, DocumentAdapter } from '../types';
import { SafeCalculator } from '../tools/calculator';

const calculatorToolDecl: FunctionDeclaration = {
  name: 'calculate',
  description: 'Perform mathematical calculations. Use this for any numeric analysis or data processing.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      expression: {
        type: Type.STRING,
        description: 'The mathematical expression to evaluate (e.g., 100 * 1.05 ^ 5)',
      },
    },
    required: ['expression'],
  },
};

const reportToolDecl: FunctionDeclaration = {
  name: 'generate_report',
  description: 'Generate the final structured research report. Call this ONLY when all research is complete.',
  parameters: {
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
      sources: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            url: { type: Type.STRING },
            snippet: { type: Type.STRING },
          },
          required: ['title', 'url', 'snippet'],
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
    },
    required: ['title', 'summary', 'sections', 'sources'],
  },
};

export class ResearchBriefSkill {
  private ai: GoogleGenAI;
  private modelId: string;
  private adapter?: DocumentAdapter;
  private onStep?: (step: AgentStep) => void;

  constructor(
    apiKey: string,
    modelId = 'gemini-2.5-flash',
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

  async run(topic: string): Promise<ResearchReport | null> {
    this.addStep('plan', `Starting research brief on: ${topic}`);

    const systemInstruction = `You are an expert Research & Report Agent.
Your goal is to provide a comprehensive, accurate, and structured report on the user's topic.

Follow the ReAct (Reasoning + Acting) pattern:
1. Reason: Think about what information you need and which tool to use.
2. Act: Call a tool (search or calculate).
3. Observe: Analyze the tool's output.
4. Repeat: Continue until you have enough information.
5. Finalize: Use the 'generate_report' tool to output the final result.

Always explain your reasoning before calling a tool.
If you need to perform math, use the 'calculate' tool.
For web information, use 'googleSearch'.`;

    const contents: any[] = [
      { role: 'user', parts: [{ text: `Research the following topic and provide a detailed report: ${topic}` }] },
    ];

    let iterations = 0;
    const maxIterations = 10;
    let finalReport: ResearchReport | null = null;

    while (iterations < maxIterations && !finalReport) {
      iterations++;

      const response = await this.ai.models.generateContent({
        model: this.modelId,
        contents,
        config: {
          systemInstruction,
          tools: [
            { googleSearch: {} },
            { functionDeclarations: [calculatorToolDecl, reportToolDecl] },
          ],
          toolConfig: { includeServerSideToolInvocations: true },
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate) break;

      if (candidate.content?.parts?.[0]?.text) {
        this.addStep('reasoning', candidate.content.parts[0].text);
      }

      contents.push({
        role: candidate.content?.role || 'model',
        parts: candidate.content?.parts || [{ text: '' }],
      });

      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          this.addStep('tool_call', `Calling ${call.name}`, call.name, call.args);

          if (call.name === 'calculate') {
            try {
              const expression = (call.args as any).expression as string;
              // Safe deterministic evaluation without eval
              const result = SafeCalculator.evaluate(expression);
              const observation = `Calculation result for "${expression}": ${result}`;
              this.addStep('observation', observation);
              contents.push({
                role: 'user',
                parts: [{ text: `Observation from calculate: ${observation}` }],
              });
            } catch (e: any) {
              const errorMsg = `Error calculating: ${e.message}`;
              this.addStep('observation', errorMsg);
              contents.push({ role: 'user', parts: [{ text: errorMsg }] });
            }
          } else if (call.name === 'generate_report') {
            finalReport = call.args as unknown as ResearchReport;
            finalReport.id = crypto.randomUUID();
            finalReport.topic = topic;
            this.addStep('final_answer', 'Report generated successfully.');
          }
        }
      } else {
        if (!finalReport && iterations > 1) {
          contents.push({
            role: 'user',
            parts: [{ text: "Please use the 'generate_report' tool to provide the final structured output." }],
          });
        }
      }
    }

    return finalReport;
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
