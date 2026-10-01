import React, { useState } from 'react';
import { 
  BrainCircuit, 
  Search, 
  Calculator, 
  History, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Cpu, 
  Loader2,
  FileCode
} from 'lucide-react';
import { AgentStep } from '../../core/types';

interface StepLogsProps {
  steps: AgentStep[];
  isProcessing: boolean;
  progressPercent: number;
}

export const StepLogs: React.FC<StepLogsProps> = ({
  steps,
  isProcessing,
  progressPercent,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const getStepIcon = (type: AgentStep['type']) => {
    switch (type) {
      case 'reasoning':
        return <BrainCircuit className="w-3 h-3 text-[#181714] dark:text-[#faf8f5]" />;
      case 'tool_call':
        return <Calculator className="w-3 h-3 text-[#181714] dark:text-[#faf8f5]" />;
      case 'observation':
        return <Search className="w-3 h-3 text-[#181714] dark:text-[#faf8f5]" />;
      case 'plan':
        return <History className="w-3 h-3 text-[#181714] dark:text-[#faf8f5]" />;
      case 'proposal':
        return <FileCode className="w-3 h-3 text-[#181714] dark:text-[#faf8f5]" />;
      case 'final_answer':
      default:
        return <CheckCircle2 className="w-3 h-3 text-[#2d6a4f] dark:text-[#52b788]" />;
    }
  };

  const latestStep = steps.length > 0 ? steps[steps.length - 1] : null;

  return (
    <div className="border-b border-[#e5e0d3] dark:border-[#2b2822] bg-[#faf8f5] dark:bg-[#181714] transition-colors">
      {/* Progress Bar Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2.5 px-3.5 flex items-center justify-between cursor-pointer hover:bg-[#f3eee2] dark:hover:bg-[#1e1c18] transition-colors"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0 mr-2">
          <div className="flex items-center justify-center w-5 h-5 rounded-full border border-[#d5cfbe] dark:border-[#38342c] text-[#181714] dark:text-[#faf8f5]">
            {isProcessing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Cpu className="w-3 h-3" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider mb-1">
              <span className="font-semibold text-[#181714] dark:text-[#faf8f5] truncate">
                {isProcessing ? latestStep?.content || 'Agent Processing...' : 'Execution Logs'}
              </span>
              <span className="text-[#8f8674] ml-2 font-mono">
                {steps.length} steps · {progressPercent}%
              </span>
            </div>
            {/* Minimalist hairline progress track */}
            <div className="w-full bg-[#e8e3d8] dark:bg-[#2b2822] h-0.5 overflow-hidden">
              <div 
                className="bg-[#181714] dark:bg-[#faf8f5] h-0.5 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <button className="text-[#8f8674] hover:text-[#181714] dark:hover:text-[#faf8f5] p-1 cursor-pointer">
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Expandable Step Details */}
      {isOpen && (
        <div className="p-3 pt-0 max-h-60 overflow-y-auto space-y-2 border-t border-[#e5e0d3] dark:border-[#2b2822] bg-[#f5f2eb] dark:bg-[#141311]">
          {steps.length === 0 ? (
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#8f8674] text-center py-4">
              No active execution steps recorded yet.
            </div>
          ) : (
            steps.map((step) => (
              <div
                key={step.id}
                className="p-2.5 rounded border border-[#dfd9cc] dark:border-[#2b2822] bg-[#faf8f5] dark:bg-[#1a1916] text-xs shadow-2xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1.5 font-mono uppercase text-[9px] tracking-widest text-[#686153] dark:text-[#b8b09f]">
                    {getStepIcon(step.type)}
                    {step.type.replace('_', ' ')}
                  </span>
                  <span className="text-[9px] text-[#8f8674] font-mono">
                    {new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <p className="text-[#2b2822] dark:text-[#dcd6c8] leading-relaxed text-[11px]">
                  {step.content}
                </p>
                {step.toolArgs && (
                  <div className="mt-1.5 p-1.5 bg-[#f0ece2] dark:bg-[#12110f] rounded border border-[#dcd6c8] dark:border-[#26241f] text-[10px] font-mono text-[#49443a] dark:text-[#b8b09f] overflow-x-auto">
                    {JSON.stringify(step.toolArgs, null, 2)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
