import React, { useEffect, useRef, useState } from 'react';
import { FileText, Upload, Loader2, MousePointer, AlertCircle } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PdfDocumentAdapter, PdfLoadSummary } from '../../host-pdf/pdfAdapter';

(pdfjs as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfDocumentViewerProps {
  adapter: PdfDocumentAdapter;
}

export const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({ adapter }) => {
  const [paragraphs, setParagraphs] = useState<Awaited<ReturnType<PdfDocumentAdapter['getParagraphs']>>>([]);
  const [summary, setSummary] = useState<PdfLoadSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adapter.setLibrary(pdfjs as any);
    const refresh = () => adapter.getParagraphs().then(setParagraphs);
    refresh();
    return adapter.subscribe(refresh);
  }, [adapter]);

  const loadFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setError('Please choose a .pdf file.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      setSummary(await adapter.loadData(buf, file.name));
      setSelected('');
    } catch (e: any) {
      setError(e?.message || 'Could not read this PDF.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelection = () => {
    const text = window.getSelection()?.toString().trim() || '';
    setSelected(text);
    adapter.setSelection(text || null);
  };

  const highlighted = adapter.getHighlightedLocator();

  return (
    <div className="flex-1 flex flex-col h-full bg-[#ede9df] dark:bg-[#12110f] border-r border-[#dcd6c8] dark:border-[#26241f] overflow-hidden transition-colors">
      <div className="p-3 px-6 bg-[#faf8f5] dark:bg-[#181714] border-b border-[#e5e0d3] dark:border-[#2b2822] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full border border-[#181714] dark:border-[#faf8f5] flex items-center justify-center text-[#181714] dark:text-[#faf8f5] shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-editorial text-lg italic text-[#181714] dark:text-[#faf8f5] leading-none truncate">
              {summary ? summary.fileName : 'PDF Document'}
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#8f8674] mt-0.5">
              {summary
                ? `${summary.pages} pages · ${summary.paragraphs} paragraphs · ${summary.headings} headings${
                    summary.columnsDetectedOnPages.length ? ` · two-column on ${summary.columnsDetectedOnPages.length} page(s)` : ''
                  }`
                : 'Read-only · text is extracted from the PDF'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selected && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e8e3d8] dark:bg-[#25221b] text-[#181714] dark:text-[#faf8f5] text-xs font-mono">
              <MousePointer className="w-3 h-3" />
              <span className="max-w-[140px] truncate text-[10px] uppercase tracking-wider">&quot;{selected}&quot;</span>
            </div>
          )}
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => loadFile(e.target.files?.[0])} />
          <button
            onClick={() => inputRef.current?.click()}
            className="px-3 py-1 text-[11px] font-mono uppercase tracking-wider rounded-full border border-[#181714] dark:border-[#faf8f5] text-[#181714] dark:text-[#faf8f5] hover:bg-[#181714] hover:text-[#faf8f5] dark:hover:bg-[#faf8f5] dark:hover:text-[#181714] transition-all cursor-pointer flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            <span>{summary ? 'Open another' : 'Open PDF'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 rounded-lg border border-[#c9a79f] bg-[#f6e9e6] dark:bg-[#2a1a17] dark:border-[#5a352e] text-xs text-[#7a2e22] dark:text-[#e4b4aa] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      <div
        onMouseUp={handleSelection}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          loadFile(e.dataTransfer.files?.[0]);
        }}
        className="flex-1 overflow-y-auto p-8 sm:px-12 md:px-20"
      >
        <div className="max-w-3xl mx-auto bg-[#faf8f5] dark:bg-[#1a1916] p-10 sm:p-14 rounded-lg shadow-sm border border-[#dfd9cc] dark:border-[#2b2822] min-h-[300px] transition-colors">
          {paragraphs.length === 0 ? (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full h-60 border border-dashed border-[#d5cfbe] dark:border-[#38342c] rounded-lg flex flex-col items-center justify-center gap-2 text-[#686153] dark:text-[#b8b09f] hover:border-[#181714] dark:hover:border-[#faf8f5] cursor-pointer transition-colors"
            >
              <Upload className="w-6 h-6" />
              <span className="font-mono text-[11px] uppercase tracking-wider">Drop a PDF here or click to open</span>
              <span className="text-[11px] max-w-xs text-center">Works with text-based PDFs. Scanned pages need OCR first.</span>
            </button>
          ) : (
            <div className="space-y-4 text-[13.5px] leading-relaxed text-[#181714] dark:text-[#faf8f5] selection:bg-[#181714] selection:text-[#faf8f5] dark:selection:bg-[#faf8f5] dark:selection:text-[#181714]">
              {paragraphs.map((p) => {
                const isHit = highlighted?.contextHash === p.locator.contextHash && highlighted?.paragraphIndex === p.index;
                const hit = isHit ? ' bg-[#f1e6a8] dark:bg-[#5a5020] rounded px-1 -mx-1' : '';
                if (p.headingLevel === 1) return <h2 key={p.index} className={`font-editorial text-2xl italic pt-2${hit}`}>{p.text}</h2>;
                if (p.headingLevel === 2) return <h3 key={p.index} className={`font-editorial text-xl italic pt-1${hit}`}>{p.text}</h3>;
                if (p.headingLevel) return <h4 key={p.index} className={`font-mono text-[11px] uppercase tracking-wider text-[#686153] dark:text-[#b8b09f]${hit}`}>{p.text}</h4>;
                return <p key={p.index} className={hit.trim()}>{p.text}</p>;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
