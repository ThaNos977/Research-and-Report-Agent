import { GoogleGenAI, FunctionDeclaration } from '@google/genai';
import { AgentStep } from '../types';
import { SafeCalculator } from '../tools/calculator';

export interface ToolHandler {
  declaration: FunctionDeclaration;
  execute: (args: any) => Promise<string> | string;
}

export interface ReActLoopOptions {
  ai: GoogleGenAI;
  modelId: string;
  systemInstruction: string;
  tools?: ToolHandler[];
  enableGoogleSearch?: boolean;
  maxIterations?: number;
  onStep?: (step: AgentStep) => void;
  skillName?: string;
}

export class ReActLoop {
  private ai: GoogleGenAI;
  private modelId: string;
  private systemInstruction: string;
  private tools: Map<string, ToolHandler>;
  private enableGoogleSearch: boolean;
  private maxIterations: number;
  private onStep?: (step: AgentStep) => void;
  private skillName?: string;

  constructor(options: ReActLoopOptions) {
    this.ai = options.ai;
    this.modelId = options.modelId;
    this.systemInstruction = options.systemInstruction;
    this.tools = new Map();
    options.tools?.forEach((t) => this.tools.set(t.declaration.name, t));
    this.enableGoogleSearch = options.enableGoogleSearch ?? false;
    this.maxIterations = options.maxIterations ?? 10;
    this.onStep = options.onStep;
    this.skillName = options.skillName;
  }

  private emitStep(type: AgentStep['type'], content: string, toolName?: string, toolArgs?: any) {
    if (this.onStep) {
      this.onStep({
        id: Math.random().toString(36).substring(7),
        skill: this.skillName,
        type,
        content,
        timestamp: Date.now(),
        toolName,
        toolArgs,
      });
    }
  }

  async run(prompt: string): Promise<{ text: string; functionCallsExecuted: number }> {
    this.emitStep('plan', `Initiating task for ${this.skillName || 'agent'}: ${prompt.slice(0, 100)}...`);

    const contents: any[] = [
      { role: 'user', parts: [{ text: prompt }] },
    ];

    // Build Gemini tools configuration
    const geminiTools: any[] = [];
    if (this.enableGoogleSearch) {
      geminiTools.push({ googleSearch: {} });
    }

    const declarations = Array.from(this.tools.values()).map((t) => t.declaration);
    if (declarations.length > 0) {
      geminiTools.push({ functionDeclarations: declarations });
    }

    let iterations = 0;
    let totalFunctionCalls = 0;
    let finalAnswer = '';

    while (iterations < this.maxIterations) {
      iterations++;

      const config: any = {
        systemInstruction: this.systemInstruction,
        toolConfig: { includeServerSideToolInvocations: true },
      };
      if (geminiTools.length > 0) {
        config.tools = geminiTools;
      }

      const response = await this.ai.models.generateContent({
        model: this.modelId,
        contents,
        config,
      });

      const candidate = response.candidates?.[0];
      if (!candidate) break;

      // Extract reasoning/text
      const textParts = candidate.content?.parts?.filter((p: any) => p.text) || [];
      const stepText = textParts.map((p: any) => p.text).join('\n').trim();
      if (stepText) {
        finalAnswer = stepText;
        this.emitStep('reasoning', stepText);
      }

      // Append model response to conversation history
      contents.push({
        role: candidate.content?.role || 'model',
        parts: candidate.content?.parts || [{ text: '' }],
      });

      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          totalFunctionCalls++;
          this.emitStep('tool_call', `Executing tool: ${call.name}`, call.name, call.args);

          const handler = this.tools.get(call.name);
          let observation = '';

          if (handler) {
            try {
              observation = await handler.execute(call.args);
            } catch (err: any) {
              observation = `Tool error [${call.name}]: ${err.message || String(err)}`;
            }
          } else if (call.name === 'calculate') {
            try {
              const expr = (call.args as any)?.expression || '';
              const val = SafeCalculator.evaluate(expr);
              observation = `Calculation result for "${expr}": ${val}`;
            } catch (err: any) {
              observation = `Calculation error: ${err.message}`;
            }
          } else {
            observation = `Tool ${call.name} executed.`;
          }

          this.emitStep('observation', observation);

          // Append observation as user/tool response
          contents.push({
            role: 'user',
            parts: [{ text: `Observation from ${call.name}: ${observation}` }],
          });
        }
      } else {
        // No function calls: agent produced a final synthesis
        this.emitStep('final_answer', stepText || 'Task completed.');
        break;
      }
    }

    return { text: finalAnswer, functionCallsExecuted: totalFunctionCalls };
  }
}
