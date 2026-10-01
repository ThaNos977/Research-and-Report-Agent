import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { AgentStep, ResearchReport } from "../types";

const calculatorTool: FunctionDeclaration = {
  name: "calculate",
  description: "Perform mathematical calculations. Use this for any numeric analysis or data processing.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      expression: {
        type: Type.STRING,
        description: "The mathematical expression to evaluate (e.g., '100 * 1.05 ^ 5')",
      },
    },
    required: ["expression"],
  },
};

const reportTool: FunctionDeclaration = {
  name: "generate_report",
  description: "Generate the final structured research report. Call this ONLY when all research is complete.",
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
          required: ["heading", "content"],
        },
      },
      sources: {
        type: Type.ARRAY,
        description: "List of sources used in the research.",
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Title of the source webpage or document." },
            url: { type: Type.STRING, description: "URL or citation link." },
            snippet: { type: Type.STRING, description: "A brief 1-2 sentence summary or quote extracted from this source." }
          },
          required: ["title", "url", "snippet"]
        },
      },
      calculations: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      chartData: {
        type: Type.ARRAY,
        description: "Extract any quantitative data discovered into structured chart format. Use this to visualize key metrics, trends, or comparisons.",
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Title of the chart" },
            data: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Label for the data point (e.g. year, category)" },
                  value: { type: Type.NUMBER, description: "Numeric value" }
                },
                required: ["name", "value"]
              }
            }
          },
          required: ["title", "data"]
        }
      }
    },
    required: ["title", "summary", "sections", "sources"],
  },
};

export class ResearchAgent {
  private ai: GoogleGenAI;
  private onStep: (step: AgentStep) => void;

  constructor(onStep: (step: AgentStep) => void) {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    this.onStep = onStep;
  }

  private addStep(type: AgentStep['type'], content: string, toolName?: string, toolArgs?: any) {
    this.onStep({
      id: Math.random().toString(36).substring(7),
      type,
      content,
      timestamp: Date.now(),
      toolName,
      toolArgs,
    });
  }

  async run(topic: string): Promise<ResearchReport | null> {
    this.addStep('plan', `Starting research on: ${topic}`);

    const systemInstruction = `You are an expert Research & Report Agent. 
    Your goal is to provide a comprehensive, accurate, and structured report on the user's topic.
    
    Follow the ReAct (Reasoning + Acting) pattern:
    1. **Reason**: Think about what information you need and which tool to use.
    2. **Act**: Call a tool (search or calculate).
    3. **Observe**: Analyze the tool's output.
    4. **Repeat**: Continue until you have enough information.
    5. **Finalize**: Use the 'generate_report' tool to output the final result.

    Always explain your reasoning before calling a tool.
    If you need to perform math, use the 'calculate' tool.
    For web information, use 'googleSearch'.`;

    const contents = [{ role: 'user', parts: [{ text: `Research the following topic and provide a detailed report: ${topic}` }] }];
    
    let iterations = 0;
    const maxIterations = 10;
    let finalReport: ResearchReport | null = null;

    while (iterations < maxIterations && !finalReport) {
      iterations++;

      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
        config: {
          systemInstruction,
          tools: [
            { googleSearch: {} },
            { functionDeclarations: [calculatorTool, reportTool] }
          ],
          toolConfig: { includeServerSideToolInvocations: true }
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate) break;

      // Add reasoning to logs
      if (candidate.content.parts[0].text) {
        this.addStep('reasoning', candidate.content.parts[0].text);
      }

      // Append model's response to history
      contents.push({
        role: candidate.content.role || 'model',
        parts: candidate.content.parts.map(p => ({ text: p.text || '' }))
      });

      const functionCalls = response.functionCalls;
      if (functionCalls) {
        for (const call of functionCalls) {
          this.addStep('tool_call', `Calling ${call.name}`, call.name, call.args);

          if (call.name === 'calculate') {
            try {
              const expression = (call.args as any).expression as string;
              // Simple eval for demo purposes, in production use a math library
              // eslint-disable-next-line no-eval
              const result = eval(expression.replace(/[^-()\d/*+.]/g, ''));
              const observation = `Calculation result for "${expression}": ${result}`;
              this.addStep('observation', observation);
              contents.push({
                role: 'user',
                parts: [{ text: `Observation from calculate: ${observation}` }]
              });
            } catch (e) {
              const errorMsg = `Error calculating: ${e instanceof Error ? e.message : 'Unknown error'}`;
              this.addStep('observation', errorMsg);
              contents.push({ role: 'user', parts: [{ text: errorMsg }] });
            }
          } else if (call.name === 'generate_report') {
            finalReport = call.args as unknown as ResearchReport;
            finalReport.id = crypto.randomUUID();
            finalReport.topic = topic;
            this.addStep('final_answer', "Report generated successfully.");
          }
        }
      } else {
        // If no function call but model finished, it might have just given text
        // We expect it to use generate_report, but if it doesn't, we might need to prompt it
        if (!finalReport && iterations > 1) {
             contents.push({ role: 'user', parts: [{ text: "Please use the 'generate_report' tool to provide the final structured output." }] });
        }
      }
    }

    return finalReport;
  }
}

export async function askFollowUp(report: ResearchReport, chatHistory: {role: string, content: string}[], question: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  const systemInstruction = `You are a helpful assistant answering follow-up questions about a research report.
  Here is the report context:
  Title: ${report.title}
  Summary: ${report.summary}
  Sections: ${JSON.stringify(report.sections)}
  Calculations: ${JSON.stringify(report.calculations)}
  
  Answer the user's questions accurately based on this report. If the answer is not in the report, use your general knowledge but clarify that it wasn't in the specific report.`;

  const contents = chatHistory.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));
  
  contents.push({ role: 'user', parts: [{ text: question }] });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
    config: { systemInstruction }
  });

  return response.text || "I'm sorry, I couldn't generate a response.";
}
