import React from 'react';
import { 
  Settings as SettingsIcon, 
  Sun, 
  Moon, 
  ChevronDown
} from 'lucide-react';
import { HostType } from '../../core/types';

interface HeaderProps {
  currentHost: HostType;
  onHostChange: (host: HostType) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentHost,
  onHostChange,
  isDarkMode,
  onToggleDarkMode,
  onOpenSettings,
}) => {
  return (
    <header className="px-4 py-3 bg-[#faf8f5] dark:bg-[#181714] border-b border-[#e5e0d3] dark:border-[#2b2822] flex items-center justify-between transition-colors shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-[#181714] dark:bg-[#faf8f5]" />
        <div>
          <h1 className="font-editorial text-lg italic tracking-tight text-[#181714] dark:text-[#faf8f5] leading-none">
            Research Assistant
          </h1>
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#8f8674] dark:text-[#8f8674] mt-0.5">
            Word &amp; Docs Editorial
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Host Selector */}
        <div className="relative flex items-center">
          <select
            value={currentHost}
            onChange={(e) => onHostChange(e.target.value as HostType)}
            className="text-[11px] font-mono uppercase tracking-wider bg-transparent text-[#181714] dark:text-[#faf8f5] border border-[#d5cfbe] dark:border-[#38342c] rounded-full px-2.5 py-1 pr-6 cursor-pointer outline-none hover:border-[#181714] dark:hover:border-[#faf8f5] transition-colors appearance-none"
            title="Switch Target Host Environment"
          >
            <option value="mock" className="bg-[#faf8f5] text-[#181714] dark:bg-[#181714] dark:text-[#faf8f5]">Mock Paper</option>
            <option value="word" className="bg-[#faf8f5] text-[#181714] dark:bg-[#181714] dark:text-[#faf8f5]">MS Word</option>
            <option value="gdocs" className="bg-[#faf8f5] text-[#181714] dark:bg-[#181714] dark:text-[#faf8f5]">Google Docs</option>
          </select>
          <ChevronDown className="w-3 h-3 text-[#8f8674] absolute right-2 pointer-events-none" />
        </div>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 text-[#686153] dark:text-[#b8b09f] hover:text-[#181714] dark:hover:text-[#faf8f5] hover:bg-[#eae5d8] dark:hover:bg-[#25221b] rounded-full transition-colors cursor-pointer"
          title="Configure API Key and Model"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={onToggleDarkMode}
          className="p-1.5 text-[#686153] dark:text-[#b8b09f] hover:text-[#181714] dark:hover:text-[#faf8f5] hover:bg-[#eae5d8] dark:hover:bg-[#25221b] rounded-full transition-colors cursor-pointer"
          title="Toggle Theme"
        >
          {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </header>
  );
};
