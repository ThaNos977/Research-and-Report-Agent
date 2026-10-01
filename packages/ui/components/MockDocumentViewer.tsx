import React, { useState, useEffect } from 'react';
import { 
  RotateCcw, 
  MousePointer, 
  Check, 
  Eye, 
  Code2,
  BookOpen
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { MockDocumentAdapter } from '../../host-mock/mockAdapter';
import { SAMPLE_RESEARCH_PAPER } from '../../host-mock/samplePaper';

interface MockDocumentViewerProps {
  adapter: MockDocumentAdapter;
}

export const MockDocumentViewer: React.FC<MockDocumentViewerProps> = ({ adapter }) => {
  const [docText, setDocText] = useState(adapter.getDocumentText());
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionConfirmed, setSelectionConfirmed] = useState(false);

  useEffect(() => {
    return adapter.subscribe(() => {
      setDocText(adapter.getDocumentText());
    });
  }, [adapter]);

  const handleTextSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) {
      const text = sel.toString().trim();
      setSelectedText(text);
      adapter.setSelection(text);
      setSelectionConfirmed(true);
      setTimeout(() => setSelectionConfirmed(false), 1200);
    }
  };

  const handleResetPaper = () => {
    adapter.setDocumentText(SAMPLE_RESEARCH_PAPER);
    setSelectedText('');
    adapter.setSelection('');
  };

  const highlightedLocator = adapter.getHighlightedLocator();

  return (
    <div className="flex-1 flex flex-col h-full bg-[#ede9df] dark:bg-[#12110f] border-r border-[#dcd6c8] dark:border-[#26241f] overflow-hidden transition-colors">
      {/* Editorial Top Bar */}
      <div className="p-3 px-6 bg-[#faf8f5] dark:bg-[#181714] border-b border-[#e5e0d3] dark:border-[#2b2822] flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border border-[#181714] dark:border-[#faf8f5] flex items-center justify-center text-[#181714] dark:text-[#faf8f5]">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-editorial text-lg italic text-[#181714] dark:text-[#faf8f5] flex items-center gap-2 leading-none">
              Academic Working Manuscript
              <span className="font-mono text-[9px] not-italic uppercase tracking-widest text-[#686153] dark:text-[#b8b09f] border border-[#d5cfbe] dark:border-[#38342c] px-2 py-0.5 rounded-full">
                Mock Host
              </span>
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#8f8674] mt-0.5">
              Interactive Document Preview &amp; Verification Environment
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedText && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e8e3d8] dark:bg-[#25221b] text-[#181714] dark:text-[#faf8f5] text-xs font-mono">
              <MousePointer className="w-3 h-3" />
              <span className="max-w-[140px] truncate text-[10px] uppercase tracking-wider">&quot;{selectedText}&quot;</span>
              {selectionConfirmed && <Check className="w-3 h-3 text-[#2d6a4f]" />}
            </div>
          )}

          <button
            onClick={() => setIsEditingRaw(!isEditingRaw)}
            className="px-3 py-1 text-[11px] font-mono uppercase tracking-wider rounded-full border border-[#181714] dark:border-[#faf8f5] text-[#181714] dark:text-[#faf8f5] hover:bg-[#181714] hover:text-[#faf8f5] dark:hover:bg-[#faf8f5] dark:hover:text-[#181714] transition-all cursor-pointer flex items-center gap-1.5"
            title="Toggle Markdown Raw Source / Formatted View"
          >
            {isEditingRaw ? <Eye className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
            <span>{isEditingRaw ? 'Proof View' : 'Raw Text'}</span>
          </button>

          <button
            onClick={handleResetPaper}
            className="p-1.5 px-3 text-[11px] font-mono uppercase tracking-wider rounded-full border border-[#d5cfbe] dark:border-[#38342c] hover:border-[#181714] dark:hover:border-[#faf8f5] text-[#686153] dark:text-[#b8b09f] hover:text-[#181714] dark:hover:text-[#faf8f5] flex items-center gap-1 transition-all cursor-pointer"
            title="Reset to default sample paper"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* Editorial Paper Canvas */}
      <div 
        onMouseUp={handleTextSelection}
        className="flex-1 overflow-y-auto p-8 sm:px-12 md:px-20"
      >
        <div className="max-w-3xl mx-auto bg-[#faf8f5] dark:bg-[#1a1916] p-10 sm:p-14 md:p-16 rounded-lg shadow-sm border border-[#dfd9cc] dark:border-[#2b2822] transition-colors">
          {isEditingRaw ? (
            <textarea
              value={docText}
              onChange={(e) => {
                setDocText(e.target.value);
                adapter.setDocumentText(e.target.value);
              }}
              className="w-full h-[700px] font-mono text-xs p-5 bg-[#f3f0e8] dark:bg-[#12110f] text-[#181714] dark:text-[#faf8f5] border border-[#dcd6c8] dark:border-[#2b2822] rounded-lg outline-none focus:border-[#181714] dark:focus:border-[#faf8f5] leading-relaxed"
            />
          ) : (
            <div className="prose prose-stone dark:prose-invert max-w-none text-[13.5px] leading-relaxed selection:bg-[#181714] selection:text-[#faf8f5] dark:selection:bg-[#faf8f5] dark:selection:text-[#181714]">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="font-editorial text-3xl sm:text-4xl italic text-[#181714] dark:text-[#faf8f5] border-b border-[#e5e0d3] dark:border-[#2b2822] pb-4 mb-6 leading-tight">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="font-editorial text-2xl italic text-[#181714] dark:text-[#faf8f5] mt-8 mb-3 border-b border-[#f0ece2] dark:border-[#26241f] pb-1">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="font-mono text-xs uppercase tracking-widest text-[#49443a] dark:text-[#b8b09f] mt-6 mb-2">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => {
                    const textContent = String(children);
                    const isHighlighted = highlightedLocator && textContent.includes(highlightedLocator.startsWith.slice(0, 30));
                    return (
                      <p className={`my-3 text-[#2b2822] dark:text-[#dcd6c8] leading-relaxed ${
                        isHighlighted 
                          ? 'bg-[#ede7d8] dark:bg-[#2b261d] p-3 rounded-sm border-l-2 border-[#181714] dark:border-[#faf8f5] transition-all' 
                          : ''
                      }`}>
                        {children}
                      </p>
                    );
                  },
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-[#181714] dark:border-[#faf8f5] pl-4 italic text-[#686153] dark:text-[#b8b09f] my-4">
                      {children}
                    </blockquote>
                  ),
                  table: ({ children }) => (
                    <div className="my-6 overflow-x-auto border border-[#e5e0d3] dark:border-[#2b2822] rounded">
                      <table className="w-full text-xs font-mono">{children}</table>
                    </div>
                  ),
                }}
              >
                {docText}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
