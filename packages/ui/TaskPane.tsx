import React, { useState, useMemo } from 'react';
import { 
  MessageSquare, 
  ShieldCheck, 
  Edit3, 
  BookOpen, 
  FileText 
} from 'lucide-react';
import { Header } from './components/Header';
import { SettingsModal } from './components/SettingsModal';
import { StepLogs } from './components/StepLogs';
import { AskPaperView } from './components/AskPaperView';
import { CheckClaimsView } from './components/CheckClaimsView';
import { ReviewSectionView } from './components/ReviewSectionView';
import { DocsAssistView } from './components/DocsAssistView';
import { ResearchBriefView } from './components/ResearchBriefView';

import { 
  DocumentAdapter, 
  AssistantSettings, 
  AgentStep, 
  HostType 
} from '../core/types';
import { GeminiClient } from '../core/llm/geminiClient';
import { GeminiEmbedder } from '../core/nlp/embedder';
import { AskPaperSkill } from '../core/skills/askPaper';
import { CheckClaimsSkill } from '../core/skills/checkClaims';
import { ReviewSectionSkill } from '../core/skills/reviewSection';
import { DocsAssistSkill } from '../core/skills/docsAssist';
import { ResearchBriefSkill } from '../core/skills/researchBrief';

interface TaskPaneProps {
  currentHost: HostType;
  onHostChange: (host: HostType) => void;
  adapter: DocumentAdapter;
  settings: AssistantSettings;
  onUpdateSettings: (updated: AssistantSettings) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

type ActiveSkill = 'ask' | 'claims' | 'review' | 'docs' | 'brief';

export const TaskPane: React.FC<TaskPaneProps> = ({
  currentHost,
  onHostChange,
  adapter,
  settings,
  onUpdateSettings,
  isDarkMode,
  onToggleDarkMode,
}) => {
  const [activeSkill, setActiveSkill] = useState<ActiveSkill>('ask');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize Core Services
  const client = useMemo(() => {
    return settings.geminiApiKey
      ? new GeminiClient(settings.geminiApiKey, settings.modelId, settings.embeddingModelId)
      : null;
  }, [settings.geminiApiKey, settings.modelId, settings.embeddingModelId]);

  const embedder = useMemo(() => {
    return client ? new GeminiEmbedder(client) : null;
  }, [client]);

  // Initialize Skills
  const askPaperSkill = useMemo(() => {
    return client && embedder ? new AskPaperSkill(client, adapter, embedder) : null;
  }, [client, adapter, embedder]);

  const checkClaimsSkill = useMemo(() => {
    return client ? new CheckClaimsSkill(client, adapter) : null;
  }, [client, adapter]);

  const reviewSectionSkill = useMemo(() => {
    return client && embedder ? new ReviewSectionSkill(client, adapter, embedder) : null;
  }, [client, adapter, embedder]);

  const docsAssistSkill = useMemo(() => {
    return client ? new DocsAssistSkill(adapter, client) : null;
  }, [adapter, client]);

  const researchBriefSkill = useMemo(() => {
    return settings.geminiApiKey
      ? new ResearchBriefSkill(
          settings.geminiApiKey,
          settings.modelId,
          adapter,
          (step) => setSteps((prev) => [...prev, step])
        )
      : null;
  }, [settings.geminiApiKey, settings.modelId, adapter]);

  const progressPercent = useMemo(() => {
    if (steps.length === 0) return 0;
    if (steps[steps.length - 1]?.type === 'final_answer') return 100;
    return Math.min(95, steps.length * 15);
  }, [steps]);

  return (
    <div className="w-full sm:w-[380px] md:w-[420px] h-full flex flex-col bg-[#f5f2eb] dark:bg-[#151412] text-[#181714] dark:text-[#faf8f5] shrink-0 border-l border-[#dcd6c8] dark:border-[#26241f] transition-colors overflow-hidden">
      {/* Editorial Header */}
      <Header
        currentHost={currentHost}
        onHostChange={onHostChange}
        isDarkMode={isDarkMode}
        onToggleDarkMode={onToggleDarkMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Minimal API Key Notice */}
      {!settings.geminiApiKey && (
        <div 
          onClick={() => setIsSettingsOpen(true)}
          className="p-2.5 px-4 bg-[#ede8dc] dark:bg-[#22201b] border-b border-[#dfd9cc] dark:border-[#2d2a23] text-[11px] font-mono uppercase tracking-wider text-[#686153] dark:text-[#b8b09f] flex items-center justify-between cursor-pointer hover:bg-[#e5e0d2] transition-colors"
        >
          <span>→ Configure Gemini API Key</span>
          <span className="font-bold underline">Setup</span>
        </div>
      )}

      {/* Live Step Logs Drawer & Progress Bar */}
      <StepLogs
        steps={steps}
        isProcessing={isProcessing}
        progressPercent={progressPercent}
      />

      {/* Editorial Skill Navigation Tabs */}
      <nav className="p-2 bg-[#faf8f5] dark:bg-[#181714] border-b border-[#e5e0d3] dark:border-[#2b2822] flex items-center justify-between text-xs">
        {[
          { key: 'ask', label: 'Ask', icon: MessageSquare },
          { key: 'claims', label: 'Claims', icon: ShieldCheck },
          { key: 'review', label: 'Review', icon: Edit3 },
          { key: 'docs', label: 'Doc Assist', icon: BookOpen },
          { key: 'brief', label: 'Brief', icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSkill === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSkill(tab.key as ActiveSkill)}
              className={`flex-1 py-1.5 px-1 rounded-full font-mono text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#181714] text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714] shadow-xs'
                  : 'text-[#686153] hover:text-[#181714] dark:text-[#8f8674] dark:hover:text-[#faf8f5]'
              }`}
              title={tab.label}
            >
              <Icon className="w-3 h-3" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Active Skill View Container */}
      <main className="flex-1 overflow-hidden relative bg-[#f5f2eb] dark:bg-[#151412]">
        {activeSkill === 'ask' && (
          <AskPaperView skill={askPaperSkill} adapter={adapter} />
        )}
        {activeSkill === 'claims' && (
          <CheckClaimsView skill={checkClaimsSkill} adapter={adapter} />
        )}
        {activeSkill === 'review' && (
          <ReviewSectionView skill={reviewSectionSkill} adapter={adapter} />
        )}
        {activeSkill === 'docs' && (
          <DocsAssistView skill={docsAssistSkill} adapter={adapter} />
        )}
        {activeSkill === 'brief' && (
          <ResearchBriefView skill={researchBriefSkill} adapter={adapter} />
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal
        settings={settings}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={onUpdateSettings}
      />
    </div>
  );
};
