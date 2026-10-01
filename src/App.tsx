/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { TaskPane } from '../packages/ui/TaskPane';
import { MockDocumentViewer } from '../packages/ui/components/MockDocumentViewer';
import { MockDocumentAdapter } from '../packages/host-mock/mockAdapter';
import { WordDocumentAdapter } from '../packages/host-word/wordAdapter';
import { GoogleDocsAdapter } from '../packages/host-gdocs/docsAdapter';
import { HostType, AssistantSettings, DocumentAdapter } from '../packages/core/types';
import { LocalStorageAdapter } from '../packages/core/storage/storage';

export default function App() {
  const [currentHost, setCurrentHost] = useState<HostType>('mock');
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Storage
  const storage = useMemo(() => new LocalStorageAdapter(), []);

  // Settings State
  const [settings, setSettings] = useState<AssistantSettings>({
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    modelId: 'gemini-3.5-flash',
    embeddingModelId: 'gemini-embedding-001',
    chunkSize: 800,
    chunkOverlap: 100,
    retrievalK: 5,
    driftThreshold: 0.82,
  });

  // Load Settings from Storage on mount
  useEffect(() => {
    (async () => {
      const savedKey = await storage.get('assistant_gemini_api_key');
      let savedModel = await storage.get('assistant_model_id');
      let savedEmbeddingModel = await storage.get('assistant_embedding_model_id');

      // Migrate any deprecated model references stored in browser cache
      if (savedModel === 'gemini-2.5-flash' || savedModel === 'models/gemini-2.5-flash') {
        savedModel = 'gemini-3.5-flash';
        await storage.set('assistant_model_id', savedModel);
      }
      if (savedEmbeddingModel === 'text-embedding-004' || savedEmbeddingModel?.includes('text-embedding-004')) {
        savedEmbeddingModel = 'gemini-embedding-001';
        await storage.set('assistant_embedding_model_id', savedEmbeddingModel);
      }

      if (savedKey || savedModel || savedEmbeddingModel) {
        setSettings((prev) => ({
          ...prev,
          geminiApiKey: savedKey || prev.geminiApiKey,
          modelId: savedModel || prev.modelId,
          embeddingModelId: savedEmbeddingModel || prev.embeddingModelId,
        }));
      }
    })();
  }, [storage]);

  // Handle Settings Update
  const handleUpdateSettings = async (updated: AssistantSettings) => {
    setSettings(updated);
    if (updated.geminiApiKey) {
      await storage.set('assistant_gemini_api_key', updated.geminiApiKey);
    }
    if (updated.modelId) {
      await storage.set('assistant_model_id', updated.modelId);
    }
    if (updated.embeddingModelId) {
      await storage.set('assistant_embedding_model_id', updated.embeddingModelId);
    }
  };

  // Dark Mode
  useEffect(() => {
    const isDark =
      localStorage.getItem('darkMode') === 'true' ||
      (!('darkMode' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setIsDarkMode(isDark);
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem('darkMode', String(next));
      if (next) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      return next;
    });
  };

  // Document Adapters
  const mockAdapter = useMemo(() => new MockDocumentAdapter(), []);
  const wordAdapter = useMemo(() => new WordDocumentAdapter(), []);
  const gdocsAdapter = useMemo(() => new GoogleDocsAdapter(), []);

  const activeAdapter: DocumentAdapter = useMemo(() => {
    switch (currentHost) {
      case 'word':
        return wordAdapter;
      case 'gdocs':
        return gdocsAdapter;
      case 'mock':
      default:
        return mockAdapter;
    }
  }, [currentHost, mockAdapter, wordAdapter, gdocsAdapter]);

  return (
    <div className="w-screen h-screen flex overflow-hidden font-sans bg-[#ede9df] dark:bg-[#12110f] text-[#181714] dark:text-[#faf8f5] transition-colors">
      {/* If host is Mock, render side-by-side interactive document simulator */}
      {currentHost === 'mock' && (
        <MockDocumentViewer adapter={mockAdapter} />
      )}

      {/* Task Pane Assistant Side Panel */}
      <TaskPane
        currentHost={currentHost}
        onHostChange={setCurrentHost}
        adapter={activeAdapter}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />
    </div>
  );
}
