export interface AgentStep {
  id: string;
  type: 'reasoning' | 'tool_call' | 'observation' | 'plan' | 'final_answer';
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
