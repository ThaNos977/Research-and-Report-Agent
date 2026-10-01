import React, { useState } from 'react';
import { 
  Check, 
  AlertTriangle, 
  ShieldCheck, 
  Loader2, 
  Edit3, 
  GitBranch,
  ArrowRight
} from 'lucide-react';
import { ReviewSectionSkill } from '../../core/skills/reviewSection';
import { Suggestion, DocumentAdapter, ReadabilityMetrics } from '../../core/types';

interface ReviewSectionViewProps {
  skill: ReviewSectionSkill | null;
  adapter: DocumentAdapter;
}

export const ReviewSectionView: React.FC<ReviewSectionViewProps> = ({
  skill,
  adapter,
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [metrics, setMetrics] = useState<ReadabilityMetrics | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleRunReview = async (useSelectionOnly: boolean) => {
    if (!skill || isRunning) return;
    setIsRunning(true);
    setStatusMessage('Auditing section readability metrics and syntax...');

    try {
      let targetText: string | undefined;
      if (useSelectionOnly) {
        const sel = await adapter.getSelection();
        if (sel?.text) {
          targetText = sel.text;
        } else {
          setStatusMessage('No text currently selected in document.');
          setIsRunning(false);
          return;
        }
      }

      const res = await skill.run({
        targetText,
        onProgress: (m) => setStatusMessage(m),
      });

      setSuggestions(res.suggestions);
      setMetrics(res.metrics);
    } catch (err: any) {
      setStatusMessage(`Review error: ${err.message || String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleApply = async (s: Suggestion, mode: 'tracked' | 'direct') => {
    const res = await adapter.applySuggestion(s, mode);
    if (res.success) {
      setSuggestions((prev) =>
        prev.map((item) => (item.id === s.id ? { ...item, status: 'applied' } : item))
      );
    } else {
      alert(`Apply failed: ${res.error || 'Text could not be located.'}`);
      setSuggestions((prev) =>
        prev.map((item) => (item.id === s.id ? { ...item, status: 'stale' } : item))
      );
    }
  };

  const handleDismiss = (id: string) => {
    setSuggestions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'dismissed' } : item))
    );
  };

  const filteredSuggestions = suggestions.filter(
    (s) => selectedCategory === 'all' || s.category === selectedCategory
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f5f2eb] dark:bg-[#151412]">
      {/* Header and Controls */}
      <div className="p-4 border-b border-[#e5e0d3] dark:border-[#2b2822] bg-[#faf8f5] dark:bg-[#181714] space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-editorial text-lg italic text-[#181714] dark:text-[#faf8f5] flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-[#181714] dark:text-[#faf8f5]" />
            Section Peer Review &amp; Rewrite
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#8f8674]">
            {suggestions.length > 0 ? `${suggestions.length} items` : 'Ready'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleRunReview(true)}
            disabled={isRunning || !skill}
            className="py-2 px-3 text-[11px] font-mono uppercase tracking-wider rounded-full border border-[#d5cfbe] dark:border-[#38342c] hover:border-[#181714] dark:hover:border-[#faf8f5] text-[#181714] dark:text-[#faf8f5] transition-all disabled:opacity-40 cursor-pointer"
          >
            Review Selection
          </button>
          <button
            onClick={() => handleRunReview(false)}
            disabled={isRunning || !skill}
            className="py-2 px-3 text-[11px] font-mono uppercase tracking-wider font-bold rounded-full bg-[#181714] text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714] hover:opacity-90 transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <span>Review Section</span>
                <ArrowRight className="w-3 h-3" />
              </>
            )}
          </button>
        </div>

        {isRunning && (
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#181714] dark:text-[#faf8f5] animate-pulse font-medium">
            {statusMessage}
          </div>
        )}

        {/* Readability Metrics Banner */}
        {metrics && (
          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[#e8e3d8] dark:border-[#26241f] text-center">
            <div className="p-2 rounded bg-[#f3efe5] dark:bg-[#201e1a] border border-[#dfd9cc] dark:border-[#2d2a23]">
              <span className="font-mono text-[8px] uppercase tracking-widest text-[#8f8674] block">Flesch Ease</span>
              <span className="font-mono text-xs font-bold text-[#181714] dark:text-[#faf8f5]">
                {metrics.fleschReadingEase}
              </span>
            </div>
            <div className="p-2 rounded bg-[#f3efe5] dark:bg-[#201e1a] border border-[#dfd9cc] dark:border-[#2d2a23]">
              <span className="font-mono text-[8px] uppercase tracking-widest text-[#8f8674] block">Grade</span>
              <span className="font-mono text-xs font-bold text-[#181714] dark:text-[#faf8f5]">
                {metrics.fleschKincaidGrade}
              </span>
            </div>
            <div className="p-2 rounded bg-[#f3efe5] dark:bg-[#201e1a] border border-[#dfd9cc] dark:border-[#2d2a23]">
              <span className="font-mono text-[8px] uppercase tracking-widest text-[#8f8674] block">Avg Sent.</span>
              <span className="font-mono text-xs font-bold text-[#181714] dark:text-[#faf8f5]">
                {metrics.avgSentenceLength}w
              </span>
            </div>
            <div className="p-2 rounded bg-[#f3efe5] dark:bg-[#201e1a] border border-[#dfd9cc] dark:border-[#2d2a23]">
              <span className="font-mono text-[8px] uppercase tracking-widest text-[#8f8674] block">Passive</span>
              <span className="font-mono text-xs font-bold text-[#181714] dark:text-[#faf8f5]">
                {metrics.passiveVoicePercentage}%
              </span>
            </div>
          </div>
        )}

        {/* Category Filter Chips */}
        {suggestions.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pt-1 pb-0.5 font-mono text-[9px] uppercase tracking-wider">
            {['all', 'clarity', 'tone', 'structure', 'grammar', 'terminology'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-full cursor-pointer transition-all ${
                  selectedCategory === cat
                    ? 'bg-[#181714] text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714]'
                    : 'bg-[#ede8dc] dark:bg-[#201e1a] text-[#686153] dark:text-[#8f8674] hover:text-[#181714]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Suggestions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {suggestions.length === 0 && !isRunning && (
          <div className="text-center py-12 px-4 text-[#8f8674]">
            <Edit3 className="w-8 h-8 mx-auto mb-3 opacity-40 text-[#181714] dark:text-[#faf8f5]" />
            <p className="font-editorial text-lg italic text-[#181714] dark:text-[#faf8f5] mb-1">
              No Suggestions Generated
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider leading-relaxed max-w-xs mx-auto">
              Select a section or click Review to audit syntax, academic tone, readability, and terminology.
            </p>
          </div>
        )}

        {filteredSuggestions.map((s) => (
          <div
            key={s.id}
            className={`p-4 rounded-lg border text-xs shadow-2xs space-y-3 transition-all ${
              s.status === 'applied'
                ? 'bg-[#edf5f0]/60 dark:bg-[#14281e]/40 border-[#b7dfc9] dark:border-[#1d4734] opacity-80'
                : s.status === 'dismissed'
                ? 'bg-[#ede8dc] dark:bg-[#1a1916] border-[#dfd9cc] opacity-50'
                : s.status === 'stale'
                ? 'bg-[#faefec]/60 dark:bg-[#2b1613]/40 border-[#f0c5bd] dark:border-[#4d1f19]'
                : 'bg-[#faf8f5] dark:bg-[#1a1916] border-[#dfd9cc] dark:border-[#2b2822]'
            }`}
          >
            {/* Header category badge and status */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-[#d5cfbe] dark:border-[#38342c] text-[#49443a] dark:text-[#b8b09f]">
                {s.category}
              </span>

              {s.meaningDrift && (
                <span
                  className={`font-mono text-[9px] uppercase tracking-wider font-semibold flex items-center gap-1 ${
                    s.meaningDrift.warning
                      ? 'text-[#9e3a2b] dark:text-[#e57373]'
                      : 'text-[#2d6a4f] dark:text-[#52b788]'
                  }`}
                  title={s.meaningDrift.message}
                >
                  {s.meaningDrift.warning ? (
                    <AlertTriangle className="w-3 h-3" />
                  ) : (
                    <ShieldCheck className="w-3 h-3" />
                  )}
                  {Math.round(s.meaningDrift.similarity * 100)}% preserved
                </span>
              )}
            </div>

            {/* Proofreading Box */}
            <div className="space-y-2 p-3 bg-[#f5f2eb] dark:bg-[#141311] rounded border border-[#e5e0d3] dark:border-[#26241f] text-xs">
              <div className="text-[#9e3a2b] dark:text-[#e57373] line-through opacity-85 leading-relaxed font-editorial italic text-[13px]">
                {s.original}
              </div>
              <div className="text-[#2d6a4f] dark:text-[#52b788] font-editorial italic text-[13px] leading-relaxed">
                {s.replacement}
              </div>
            </div>

            {/* Rationale */}
            <p className="text-[11px] text-[#686153] dark:text-[#8f8674] italic leading-relaxed">
              {s.rationale}
            </p>

            {/* Action Buttons */}
            {s.status === 'proposed' && (
              <div className="pt-2 border-t border-[#e8e3d8] dark:border-[#26241f] flex items-center justify-between">
                <button
                  onClick={() => handleDismiss(s.id)}
                  className="font-mono text-[10px] uppercase tracking-wider text-[#8f8674] hover:text-[#181714] dark:hover:text-[#faf8f5] cursor-pointer"
                >
                  Dismiss
                </button>

                <div className="flex gap-2">
                  {adapter.capabilities.trackedChanges ? (
                    <button
                      onClick={() => handleApply(s, 'tracked')}
                      className="px-3 py-1 bg-[#181714] hover:opacity-90 text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714] rounded-full font-mono text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <GitBranch className="w-3 h-3" />
                      Tracked
                    </button>
                  ) : (
                    <button
                      onClick={() => handleApply(s, 'direct')}
                      className="px-3 py-1 bg-[#2d6a4f] hover:bg-[#1e4634] text-white rounded-full font-mono text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      Direct Apply
                    </button>
                  )}
                </div>
              </div>
            )}

            {s.status === 'applied' && (
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#2d6a4f] dark:text-[#52b788] flex items-center gap-1 font-bold">
                <Check className="w-3 h-3" />
                Applied to manuscript
              </div>
            )}

            {s.status === 'stale' && (
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#9e3a2b] dark:text-[#e57373] flex items-center gap-1 font-bold">
                <AlertTriangle className="w-3 h-3" />
                Text modified; cannot apply automatically
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
