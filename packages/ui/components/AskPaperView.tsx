import React, { useState } from 'react';
import { Send, Globe, Database, Loader2, Sparkles, MapPin } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { AskPaperSkill, AskPaperResponse } from '../../core/skills/askPaper';
import { DocumentAdapter } from '../../core/types';

interface AskPaperViewProps {
  skill: AskPaperSkill | null;
  adapter: DocumentAdapter;
  onStepLogged?: (msg: string) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  responseObj?: AskPaperResponse;
}

export const AskPaperView: React.FC<AskPaperViewProps> = ({
  skill,
  adapter,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [enableWeb, setEnableWeb] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !skill || isAsking) return;

    const query = input.trim();
    setInput('');

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: query,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsAsking(true);

    try {
      const res = await skill.ask(query, {
        enableWebSearch: enableWeb,
        topK: 4,
      });

      const assistantMsg: ChatMessage = {
        id: Math.random().toString(),
        role: 'assistant',
        content: res.answer,
        responseObj: res,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          role: 'assistant',
          content: `Error generating answer: ${err.message || String(err)}`,
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleCitationClick = async (chunk: any) => {
    if (chunk?.locator) {
      await adapter.highlight(chunk.locator);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f5f2eb] dark:bg-[#151412]">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.length === 0 ? (
          <div className="text-center py-12 px-4 text-[#8f8674]">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full border border-[#181714] dark:border-[#faf8f5] text-[#181714] dark:text-[#faf8f5] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="font-editorial text-xl italic text-[#181714] dark:text-[#faf8f5] mb-1">
              Inquire Over Manuscript
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-wider leading-relaxed max-w-xs mx-auto">
              Hybrid dense &amp; sparse BM25 retrieval. All assertions are strictly anchored to verified document chunks.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[92%] p-3.5 rounded-xl text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#181714] text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714] font-medium'
                    : 'bg-[#faf8f5] dark:bg-[#1a1916] text-[#181714] dark:text-[#faf8f5] border border-[#dfd9cc] dark:border-[#2b2822] shadow-2xs'
                }`}
              >
                <div className="prose prose-stone dark:prose-invert max-w-none text-xs">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>

                {/* Grounding Source Badges */}
                {msg.responseObj && msg.responseObj.citedChunks.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-[#e8e3d8] dark:border-[#26241f] space-y-1.5">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-[#8f8674] flex items-center gap-1">
                      <Database className="w-3 h-3 text-[#181714] dark:text-[#faf8f5]" />
                      Verified Document Chunks
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {msg.responseObj.citedChunks.map((r, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleCitationClick(r.chunk)}
                          className="px-2.5 py-1 rounded-full bg-[#f0ece2] dark:bg-[#25221b] text-[#181714] dark:text-[#faf8f5] border border-[#d5cfbe] dark:border-[#38342c] font-mono text-[9px] uppercase tracking-wider flex items-center gap-1 hover:border-[#181714] dark:hover:border-[#faf8f5] cursor-pointer transition-colors"
                          title={`Click to locate: ${r.chunk.headingPath.join(' > ')}`}
                        >
                          <MapPin className="w-2.5 h-2.5" />
                          {r.chunk.id} ({Math.round(r.score * 100)}%)
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isAsking && (
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[#8f8674] p-2">
            <Loader2 className="w-3 h-3 animate-spin text-[#181714] dark:text-[#faf8f5]" />
            <span>Hybrid retrieval &amp; synthesis in progress...</span>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="p-3 border-t border-[#e5e0d3] dark:border-[#2b2822] bg-[#faf8f5] dark:bg-[#181714]">
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider px-1">
            <label className="flex items-center gap-1.5 cursor-pointer text-[#686153] dark:text-[#b8b09f] select-none">
              <input
                type="checkbox"
                checked={enableWeb}
                onChange={(e) => setEnableWeb(e.target.checked)}
                className="w-3 h-3 accent-[#181714] dark:accent-[#faf8f5]"
              />
              <Globe className="w-3 h-3" />
              <span>Supplement with Web Search</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask an academic inquiry on this paper..."
              className="flex-1 px-3.5 py-2 text-xs bg-[#f5f2eb] dark:bg-[#12110f] border border-[#d5cfbe] dark:border-[#38342c] rounded-full focus:border-[#181714] dark:focus:border-[#faf8f5] outline-none text-[#181714] dark:text-[#faf8f5] placeholder-[#8f8674]"
              disabled={isAsking}
            />
            <button
              type="submit"
              disabled={isAsking || !input.trim()}
              className="p-2.5 bg-[#181714] text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714] hover:opacity-90 disabled:opacity-40 rounded-full transition-all flex items-center justify-center cursor-pointer shrink-0"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
