import React, { useState } from 'react';
import { 
  FileText, 
  Search, 
  Loader2, 
  PlusCircle, 
  BarChart2, 
  Calculator, 
  ExternalLink,
  ArrowRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { ResearchBriefSkill } from '../../core/skills/researchBrief';
import { ResearchReport, DocumentAdapter } from '../../core/types';

interface ResearchBriefViewProps {
  skill: ResearchBriefSkill | null;
  adapter: DocumentAdapter;
}

export const ResearchBriefView: React.FC<ResearchBriefViewProps> = ({
  skill,
  adapter,
}) => {
  const [topic, setTopic] = useState('');
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleStartResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !skill || isSearching) return;

    setIsSearching(true);
    setStatusMessage('Autonomous research agent planning steps and searching literature...');
    setReport(null);

    try {
      const res = await skill.run(topic.trim());
      if (res) {
        setReport(res);
      }
    } catch (err: any) {
      alert(`Research failed: ${err.message || String(err)}`);
    } finally {
      setIsSearching(false);
      setStatusMessage('');
    }
  };

  const handleInsertReport = async () => {
    if (!report || !skill) return;
    await skill.insertIntoDocument(report);
    alert('Research brief inserted into manuscript at cursor position.');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f5f2eb] dark:bg-[#151412]">
      {/* Search Header */}
      <div className="p-4 border-b border-[#e5e0d3] dark:border-[#2b2822] bg-[#faf8f5] dark:bg-[#181714] space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-editorial text-lg italic text-[#181714] dark:text-[#faf8f5] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#181714] dark:text-[#faf8f5]" />
            Research Brief Generator
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#8f8674]">
            ReAct Loop
          </span>
        </div>

        <form onSubmit={handleStartResearch} className="space-y-2.5">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic to research (e.g. quantum annealing benchmarks)..."
            className="w-full px-3.5 py-2 text-xs bg-[#f5f2eb] dark:bg-[#12110f] border border-[#d5cfbe] dark:border-[#38342c] rounded-full focus:border-[#181714] dark:focus:border-[#faf8f5] outline-none text-[#181714] dark:text-[#faf8f5] placeholder-[#8f8674]"
            disabled={isSearching}
          />
          <button
            type="submit"
            disabled={isSearching || !topic.trim() || !skill}
            className="w-full py-2.5 px-4 bg-[#181714] text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714] hover:opacity-90 disabled:opacity-40 font-mono text-xs uppercase tracking-widest font-bold rounded-full shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSearching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Researching &amp; Calculating...</span>
              </>
            ) : (
              <>
                <span>Generate Research Brief</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {isSearching && (
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#181714] dark:text-[#faf8f5] animate-pulse font-medium">
            {statusMessage}
          </div>
        )}
      </div>

      {/* Report Display Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!report && !isSearching && (
          <div className="text-center py-12 px-4 text-[#8f8674]">
            <FileText className="w-8 h-8 mx-auto mb-3 opacity-40 text-[#181714] dark:text-[#faf8f5]" />
            <p className="font-editorial text-lg italic text-[#181714] dark:text-[#faf8f5] mb-1">
              No Brief Generated
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider leading-relaxed max-w-xs mx-auto">
              Enter any research query. The agent executes an autonomous ReAct loop, gathers live web literature, computes statistics, and generates a structured brief.
            </p>
          </div>
        )}

        {report && (
          <div className="p-4 rounded-lg bg-[#faf8f5] dark:bg-[#1a1916] border border-[#dfd9cc] dark:border-[#2b2822] text-xs shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#e5e0d3] dark:border-[#2b2822] pb-2.5">
              <h3 className="font-editorial text-base italic text-[#181714] dark:text-[#faf8f5]">
                {report.title}
              </h3>
              <button
                onClick={handleInsertReport}
                className="px-3 py-1 bg-[#181714] text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714] rounded-full font-mono text-[9px] uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:opacity-90 shadow-2xs"
              >
                <PlusCircle className="w-3 h-3" />
                Insert into Paper
              </button>
            </div>

            {/* Executive Summary */}
            <div className="p-3 bg-[#f5f2eb] dark:bg-[#141311] border border-[#e5e0d3] dark:border-[#26241f] rounded-lg">
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#8f8674] block mb-1">
                Executive Synthesis
              </span>
              <p className="text-[#2b2822] dark:text-[#dcd6c8] leading-relaxed text-[11px] font-sans">
                {report.summary}
              </p>
            </div>

            {/* Sections */}
            <div className="space-y-3.5">
              {report.sections.map((sec, idx) => (
                <div key={idx} className="space-y-1">
                  <h4 className="font-editorial text-sm italic text-[#181714] dark:text-[#faf8f5]">
                    {idx + 1}. {sec.heading}
                  </h4>
                  <div className="text-[#49443a] dark:text-[#b8b09f] leading-relaxed text-[11px] prose prose-stone dark:prose-invert">
                    <ReactMarkdown>{sec.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>

            {/* Recharts quantitative chart styled in editorial monochrome */}
            {report.chartData && report.chartData.length > 0 && (
              <div className="pt-3 border-t border-[#e8e3d8] dark:border-[#26241f] space-y-2">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#8f8674] flex items-center gap-1">
                  <BarChart2 className="w-3 h-3 text-[#181714] dark:text-[#faf8f5]" />
                  Quantitative Analysis
                </span>
                {report.chartData.map((chart, i) => (
                  <div key={i} className="p-3 bg-[#f5f2eb] dark:bg-[#141311] rounded-lg border border-[#e5e0d3] dark:border-[#26241f]">
                    <span className="font-editorial text-xs italic text-[#181714] dark:text-[#faf8f5] block mb-2">
                      {chart.title}
                    </span>
                    <div className="w-full h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chart.data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d5cfbe" />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                          <YAxis tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                          <RechartsTooltip contentStyle={{ fontSize: 10, borderRadius: 4, fontFamily: 'monospace' }} />
                          <Bar dataKey="value" fill="#181714" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Calculations */}
            {report.calculations && report.calculations.length > 0 && (
              <div className="pt-3 border-t border-[#e8e3d8] dark:border-[#26241f] space-y-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#8f8674] flex items-center gap-1">
                  <Calculator className="w-3 h-3 text-[#181714] dark:text-[#faf8f5]" />
                  Symbolic Calculations
                </span>
                <ul className="space-y-1">
                  {report.calculations.map((c, i) => (
                    <li key={i} className="text-[10px] text-[#2b2822] dark:text-[#dcd6c8] font-mono bg-[#f5f2eb] dark:bg-[#141311] p-1.5 rounded border border-[#e5e0d3] dark:border-[#26241f]">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sources */}
            {report.sources && report.sources.length > 0 && (
              <div className="pt-3 border-t border-[#e8e3d8] dark:border-[#26241f] space-y-1">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#8f8674] block mb-1">
                  References &amp; Citations
                </span>
                <div className="space-y-1">
                  {report.sources.map((s, i) => {
                    const title = typeof s === 'string' ? s : s.title;
                    const url = typeof s === 'string' ? '' : s.url;
                    return (
                      <div key={i} className="text-[10px] text-[#686153] dark:text-[#8f8674] flex items-center gap-1.5 truncate">
                        <span className="font-mono">[{i + 1}]</span>
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#181714] dark:text-[#faf8f5] hover:underline flex items-center gap-1 truncate font-medium">
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            {title}
                          </a>
                        ) : (
                          <span>{title}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
