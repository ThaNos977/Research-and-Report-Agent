import React, { useState } from 'react';
import { X, Key, Cpu, Sliders, ShieldCheck, Check } from 'lucide-react';
import { AssistantSettings } from '../../core/types';

interface SettingsModalProps {
  settings: AssistantSettings;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: AssistantSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isOpen,
  onClose,
  onSave,
}) => {
  const [apiKey, setApiKey] = useState(settings.geminiApiKey || '');
  const [modelId, setModelId] = useState(settings.modelId || 'gemini-3.5-flash');
  const [embeddingModelId, setEmbeddingModelId] = useState(settings.embeddingModelId || 'gemini-embedding-001');
  const [chunkSize, setChunkSize] = useState(settings.chunkSize || 800);
  const [retrievalK, setRetrievalK] = useState(settings.retrievalK || 5);
  const [driftThreshold, setDriftThreshold] = useState(settings.driftThreshold || 0.82);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...settings,
      geminiApiKey: apiKey.trim(),
      modelId,
      embeddingModelId,
      chunkSize,
      retrievalK,
      driftThreshold,
    });
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-[#faf8f5] dark:bg-[#181714] rounded-xl shadow-2xl border border-[#dfd9cc] dark:border-[#2b2822] overflow-hidden text-[#181714] dark:text-[#faf8f5]">
        {/* Header */}
        <div className="p-4 border-b border-[#e5e0d3] dark:border-[#2b2822] flex items-center justify-between bg-[#f5f2eb] dark:bg-[#141311]">
          <h2 className="font-editorial text-lg italic text-[#181714] dark:text-[#faf8f5] flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#181714] dark:text-[#faf8f5]" />
            Assistant Configuration
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[#8f8674] hover:text-[#181714] dark:hover:text-[#faf8f5] rounded-full transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Gemini API Key */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-wider text-[#686153] dark:text-[#b8b09f] flex items-center gap-1.5 mb-1.5">
              <Key className="w-3 h-3" />
              Gemini API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your Gemini API key..."
              className="w-full px-3 py-2 text-xs bg-[#f5f2eb] dark:bg-[#12110f] border border-[#d5cfbe] dark:border-[#38342c] rounded-lg focus:border-[#181714] dark:focus:border-[#faf8f5] outline-none text-[#181714] dark:text-[#faf8f5] font-mono"
            />
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8f8674] mt-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-[#2d6a4f]" />
              Stored exclusively in browser user storage; never sent to document.
            </p>
          </div>

          {/* Model ID Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider text-[#686153] dark:text-[#b8b09f] flex items-center gap-1.5 mb-1.5">
                <Cpu className="w-3 h-3" />
                Generative Model
              </label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-[#f5f2eb] dark:bg-[#12110f] border border-[#d5cfbe] dark:border-[#38342c] rounded-lg focus:border-[#181714] dark:focus:border-[#faf8f5] outline-none text-[#181714] dark:text-[#faf8f5] cursor-pointer font-mono"
              >
                <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended)</option>
                <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>
                <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
                <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
              </select>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-wider text-[#686153] dark:text-[#b8b09f] flex items-center gap-1.5 mb-1.5">
                <Sliders className="w-3 h-3" />
                Embedding Model
              </label>
              <select
                value={embeddingModelId}
                onChange={(e) => setEmbeddingModelId(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-[#f5f2eb] dark:bg-[#12110f] border border-[#d5cfbe] dark:border-[#38342c] rounded-lg focus:border-[#181714] dark:focus:border-[#faf8f5] outline-none text-[#181714] dark:text-[#faf8f5] cursor-pointer font-mono"
              >
                <option value="gemini-embedding-001">gemini-embedding-001 (Recommended)</option>
                <option value="gemini-embedding-2-preview">gemini-embedding-2-preview</option>
              </select>
            </div>
          </div>

          {/* Tuning Parameters */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#e8e3d8] dark:border-[#26241f]">
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#686153] dark:text-[#b8b09f] block mb-1">
                Chunk Character Budget
              </label>
              <input
                type="number"
                min="400"
                max="2000"
                step="100"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 text-xs bg-[#f5f2eb] dark:bg-[#12110f] border border-[#d5cfbe] dark:border-[#38342c] rounded-md font-mono"
              />
            </div>
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#686153] dark:text-[#b8b09f] block mb-1">
                Top-K Retrieval
              </label>
              <input
                type="number"
                min="2"
                max="10"
                value={retrievalK}
                onChange={(e) => setRetrievalK(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 text-xs bg-[#f5f2eb] dark:bg-[#12110f] border border-[#d5cfbe] dark:border-[#38342c] rounded-md font-mono"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-mono text-[9px] uppercase tracking-wider text-[#686153] dark:text-[#b8b09f]">
                Meaning-Drift Guard Threshold
              </label>
              <span className="font-mono text-[10px] text-[#8f8674]">{driftThreshold}</span>
            </div>
            <input
              type="range"
              min="0.70"
              max="0.95"
              step="0.01"
              value={driftThreshold}
              onChange={(e) => setDriftThreshold(parseFloat(e.target.value))}
              className="w-full accent-[#181714] dark:accent-[#faf8f5] cursor-pointer"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex justify-end gap-2 border-t border-[#e8e3d8] dark:border-[#26241f]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#8f8674] hover:text-[#181714] dark:hover:text-[#faf8f5] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider font-bold rounded-full bg-[#181714] text-[#faf8f5] dark:bg-[#faf8f5] dark:text-[#181714] hover:opacity-90 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3 h-3 text-[#2d6a4f]" />
                  Saved
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
