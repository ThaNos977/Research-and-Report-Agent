import React, { useState } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  FileText, 
  ListTree, 
  BookOpen, 
  PlusCircle, 
  Loader2,
  ArrowRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { DocsAssistSkill } from '../../core/skills/docsAssist';
import { DocAssistFinding, DocumentAdapter } from '../../core/types';

interface DocsAssistViewProps {
  skill: DocsAssistSkill | null;
  adapter: DocumentAdapter;
}

export const DocsAssistView: React.FC<DocsAssistViewProps> = ({
  skill,
  adapter,
}) => {
  const [findings, setFindings] = useState<DocAssistFinding[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [generatedContent, setGeneratedContent] = useState<{ title: string; text: string } | null>(null);

  const handleRunAudits = async () => {
    if (!skill || isRunning) return;
    setIsRunning(true);
    setStatusMessage('Auditing manuscript structure, acronyms, and references...');

    try {
      const [hFindings, aFindings, cFindings] = await Promise.all([
        skill.checkHeadingStructure(),
        skill.checkAcronyms(),
        skill.checkCrossReferences(),
      ]);

      setFindings([...hFindings, ...aFindings, ...cFindings]);
      setStatusMessage('');
    } catch (err: any) {
      setStatusMessage(`Audit error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleGenerateAbstract = async () => {
    if (!skill || isRunning) return;
    setIsRunning(true);
    setStatusMessage('Synthesizing academic structured abstract...');

    try {
      const text = await skill.generateStructuredAbstract();
      setGeneratedContent({ title: 'Structured Academic Abstract', text });
    } catch (err: any) {
      alert(`Generation failed: ${err.message}`);
    } finally {
      setIsRunning(false);
      setStatusMessage('');
    }
  };

  const handleGenerateToC = async () => {
    if (!skill || isRunning) return;
    setIsRunning(true);
    setStatusMessage('Generating Table of Contents...');

    try {
      const text = await skill.generateTableOfContents();
      setGeneratedContent({ title: 'Table of Contents', text });
    } catch (err: any) {
      alert(`Generation failed: ${err.message}`);
    } finally {
      setIsRunning(false);
      setStatusMessage('');
    }
  };

  const handleInsertAtCursor = async (markdown: string) => {
    await adapter.insertAtCursor({ markdown });
    alert('Inserted into manuscript at cursor position.');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f5f2eb] dark:bg-[#151412]">
      {/* Editorial Header */}
      <div className="p-4 border-b border-[#e5e0d3] dark:border-[#2b2822] bg-[#faf8f5] dark:bg-[#181714] space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-editorial text-lg italic text-[#181714] dark:text-[#faf8f5] flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#181714] dark:text-[#faf8f5]" />
            Documentation &amp; Structure Assist
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#8f8674]">
            Integrity
          </span>
        </div>

        {/* Hero Pill Button inspired by the user design */}
        <button
          onClick={handleRunAudits}
          disabled={isRunning || !skill}
          className="w-full py-2.5 px-4 text-xs font-mono uppercase tracking-widest font-bold rounded-full border border-[#181714] dark:border-[#faf8f5] bg-[#181714] text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714] hover:opacity-90 shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Auditing Manuscript...
            </>
          ) : (
            <>
              <span>Run Structural Audit</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>

        {/* Secondary Pill Actions */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            onClick={handleGenerateAbstract}
            disabled={isRunning || !skill}
            className="py-1.5 px-3 text-[10px] font-mono uppercase tracking-wider rounded-full border border-[#d5cfbe] dark:border-[#38342c] hover:border-[#181714] dark:hover:border-[#faf8f5] text-[#181714] dark:text-[#faf8f5] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-3 h-3" />
            Synthesize Abstract
          </button>
          <button
            onClick={handleGenerateToC}
            disabled={isRunning || !skill}
            className="py-1.5 px-3 text-[10px] font-mono uppercase tracking-wider rounded-full border border-[#d5cfbe] dark:border-[#38342c] hover:border-[#181714] dark:hover:border-[#faf8f5] text-[#181714] dark:text-[#faf8f5] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ListTree className="w-3 h-3" />
            Construct ToC
          </button>
        </div>

        {isRunning && (
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#181714] dark:text-[#faf8f5] animate-pulse font-medium">
            {statusMessage}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {/* Generated Content Box if present */}
        {generatedContent && (
          <div className="p-4 rounded-lg bg-[#faf8f5] dark:bg-[#1a1916] border border-[#181714] dark:border-[#faf8f5] text-xs space-y-3 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#e5e0d3] dark:border-[#2b2822] pb-2">
              <h4 className="font-editorial text-base italic text-[#181714] dark:text-[#faf8f5]">
                {generatedContent.title}
              </h4>
              <button
                onClick={() => handleInsertAtCursor(generatedContent.text)}
                className="px-3 py-1 bg-[#181714] text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714] rounded-full font-mono text-[9px] uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:opacity-90"
              >
                <PlusCircle className="w-2.5 h-2.5" />
                Insert into Paper
              </button>
            </div>
            <div className="text-[#2b2822] dark:text-[#dcd6c8] prose prose-stone dark:prose-invert max-w-none text-xs leading-relaxed font-sans">
              <ReactMarkdown>{generatedContent.text}</ReactMarkdown>
            </div>
          </div>
        )}

        {findings.length === 0 && !isRunning && !generatedContent && (
          <div className="text-center py-12 px-4 text-[#8f8674]">
            <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-40 text-[#181714] dark:text-[#faf8f5]" />
            <p className="font-editorial text-lg italic text-[#181714] dark:text-[#faf8f5] mb-1">
              Structural Audits Ready
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider leading-relaxed max-w-xs mx-auto">
              Execute structural checks to verify section hierarchy, acronym introductions at first use, and figure/table cross-reference validity.
            </p>
          </div>
        )}

        {findings.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-lg bg-[#faf8f5] dark:bg-[#1a1916] border border-[#dfd9cc] dark:border-[#2b2822] text-xs shadow-2xs space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-editorial text-base italic text-[#181714] dark:text-[#faf8f5] flex items-center gap-2">
                {item.status === 'pass' ? (
                  <CheckCircle2 className="w-4 h-4 text-[#2d6a4f] shrink-0" />
                ) : item.status === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-[#9e3a2b] shrink-0" />
                ) : (
                  <Info className="w-4 h-4 text-[#181714] dark:text-[#faf8f5] shrink-0" />
                )}
                {item.title}
              </span>
              <span
                className={`font-mono text-[9px] uppercase tracking-wider font-semibold px-2.5 py-0.5 rounded-full border ${
                  item.status === 'pass'
                    ? 'bg-[#edf5f0] text-[#2d6a4f] border-[#b7dfc9]'
                    : item.status === 'warning'
                    ? 'bg-[#faefec] text-[#9e3a2b] border-[#f0c5bd]'
                    : 'bg-[#f0ece2] text-[#49443a] border-[#d5cfbe]'
                }`}
              >
                {item.status}
              </span>
            </div>

            <p className="text-[#686153] dark:text-[#8f8674] text-[11px] leading-relaxed">
              {item.description}
            </p>

            {item.details && item.details.length > 0 && (
              <ul className="pt-2 space-y-1 border-t border-[#e8e3d8] dark:border-[#26241f]">
                {item.details.map((d, i) => (
                  <li key={i} className="font-mono text-[10px] text-[#49443a] dark:text-[#b8b09f] flex items-start gap-1.5">
                    <span className="text-[#8f8674]">&gt;</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
