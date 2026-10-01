import React, { useState } from 'react';
import { 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  AlertTriangle, 
  ExternalLink, 
  Loader2, 
  MapPin,
  ArrowRight
} from 'lucide-react';
import { CheckClaimsSkill } from '../../core/skills/checkClaims';
import { ClaimFinding, DocumentAdapter } from '../../core/types';

interface CheckClaimsViewProps {
  skill: CheckClaimsSkill | null;
  adapter: DocumentAdapter;
}

export const CheckClaimsView: React.FC<CheckClaimsViewProps> = ({
  skill,
  adapter,
}) => {
  const [findings, setFindings] = useState<ClaimFinding[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleRunCheck = async (useSelectionOnly: boolean) => {
    if (!skill || isRunning) return;
    setIsRunning(true);
    setStatusMessage('Initiating empirical claim audit...');

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

      const results = await skill.run({
        targetText,
        onProgress: (msg) => setStatusMessage(msg),
      });

      setFindings(results);
    } catch (err: any) {
      setStatusMessage(`Audit error: ${err.message || String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const getVerdictBadge = (verdict: ClaimFinding['verdict']) => {
    switch (verdict) {
      case 'supported':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-wider font-semibold bg-[#edf5f0] dark:bg-[#14281e] text-[#2d6a4f] dark:text-[#52b788] border border-[#b7dfc9] dark:border-[#1d4734]">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Supported
          </span>
        );
      case 'contradicted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-wider font-semibold bg-[#faefec] dark:bg-[#2b1613] text-[#9e3a2b] dark:text-[#e57373] border border-[#f0c5bd] dark:border-[#4d1f19]">
            <XCircle className="w-2.5 h-2.5" />
            Contradicted
          </span>
        );
      case 'reference_not_found':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-wider font-semibold bg-[#f5efe9] dark:bg-[#281e18] text-[#7a482b] dark:text-[#d49b77] border border-[#dfc8b7] dark:border-[#482c1e]">
            <AlertTriangle className="w-2.5 h-2.5" />
            Ref Not Found
          </span>
        );
      case 'unverifiable':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-wider font-semibold bg-[#f7f3e8] dark:bg-[#282415] text-[#856b2b] dark:text-[#d9bf77] border border-[#e5d9b5] dark:border-[#483c18]">
            <HelpCircle className="w-2.5 h-2.5" />
            Unverifiable
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f5f2eb] dark:bg-[#151412]">
      {/* Action Header */}
      <div className="p-4 border-b border-[#e5e0d3] dark:border-[#2b2822] bg-[#faf8f5] dark:bg-[#181714] space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-editorial text-lg italic text-[#181714] dark:text-[#faf8f5] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#181714] dark:text-[#faf8f5]" />
            Claim &amp; Citation Verification
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#8f8674]">
            {findings.length > 0 ? `${findings.length} audited` : 'Ready'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleRunCheck(true)}
            disabled={isRunning || !skill}
            className="py-2 px-3 text-[11px] font-mono uppercase tracking-wider rounded-full border border-[#d5cfbe] dark:border-[#38342c] hover:border-[#181714] dark:hover:border-[#faf8f5] text-[#181714] dark:text-[#faf8f5] transition-all disabled:opacity-40 cursor-pointer text-center"
          >
            Audit Selection
          </button>
          <button
            onClick={() => handleRunCheck(false)}
            disabled={isRunning || !skill}
            className="py-2 px-3 text-[11px] font-mono uppercase tracking-wider font-bold rounded-full bg-[#181714] text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714] hover:opacity-90 transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <span>Audit Entire Paper</span>
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
      </div>

      {/* Findings List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {findings.length === 0 && !isRunning && (
          <div className="text-center py-12 px-4 text-[#8f8674]">
            <ShieldCheck className="w-8 h-8 mx-auto mb-3 opacity-40 text-[#181714] dark:text-[#faf8f5]" />
            <p className="font-editorial text-lg italic text-[#181714] dark:text-[#faf8f5] mb-1">
              No Claims Audited Yet
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider leading-relaxed max-w-xs mx-auto">
              Initiate an audit over selected text or the complete paper to verify factual assertions against live scientific literature.
            </p>
          </div>
        )}

        {findings.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-lg bg-[#faf8f5] dark:bg-[#1a1916] border border-[#dfd9cc] dark:border-[#2b2822] text-xs shadow-2xs space-y-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-editorial text-sm italic text-[#181714] dark:text-[#faf8f5] leading-snug">
                &ldquo;{item.claimText}&rdquo;
              </p>
              {getVerdictBadge(item.verdict)}
            </div>

            {item.citationKeys.length > 0 && (
              <div className="font-mono text-[9px] uppercase tracking-widest text-[#8f8674] flex items-center gap-1.5">
                <span>Citations:</span>
                {item.citationKeys.map((k) => (
                  <span key={k} className="px-1.5 py-0.2 bg-[#ece7da] dark:bg-[#25221b] text-[#181714] dark:text-[#faf8f5] rounded-xs font-mono">
                    [{k}]
                  </span>
                ))}
              </div>
            )}

            {item.explanation && (
              <p className="text-[11px] text-[#49443a] dark:text-[#b8b09f] bg-[#f5f2eb] dark:bg-[#141311] p-2.5 rounded border border-[#e8e3d8] dark:border-[#22201b] leading-relaxed">
                {item.explanation}
              </p>
            )}

            {/* Evidence items strictly from Grounding Metadata */}
            {item.evidence.length > 0 && (
              <div className="pt-2.5 border-t border-[#e8e3d8] dark:border-[#26241f] space-y-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#8f8674]">
                  Grounding Evidence ({item.evidence.length})
                </span>
                {item.evidence.slice(0, 3).map((ev, i) => (
                  <div key={i} className="p-2.5 rounded bg-[#f3efe5] dark:bg-[#201e1a] text-[10px] space-y-1">
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#181714] dark:text-[#faf8f5] hover:underline flex items-center gap-1 truncate"
                    >
                      <ExternalLink className="w-2.5 h-2.5 shrink-0 text-[#8f8674]" />
                      {ev.title}
                    </a>
                    <p className="text-[#686153] dark:text-[#8f8674] line-clamp-2 italic">
                      &ldquo;{ev.snippet}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-1 flex justify-end">
              <button
                onClick={() => adapter.highlight(item.locator)}
                className="font-mono text-[9px] uppercase tracking-widest text-[#181714] dark:text-[#faf8f5] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <MapPin className="w-2.5 h-2.5" />
                Locate in Text
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
