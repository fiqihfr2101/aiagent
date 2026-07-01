'use client';
import { API_BASE, getAuthHeaders } from '../utils/api';

import React, { memo, useState, useEffect } from 'react';
import { Agent } from '../types';
import AgentConfig from './AgentConfig';

interface ModelInfo {
  id: string;
  name: string;
  family: string;
  rates: { input: number; output: number };
}

interface EditAgentModalProps {
  isOpen: boolean;
  agent: Agent | null;
  agents: Array<{ id: string; name: string }>;
  onClose: () => void;
  onAgentUpdated: (agent: any) => void;
}

type TabKey = 'details' | 'config';

const EditAgentModal: React.FC<EditAgentModalProps> = memo(({ isOpen, agent, agents = [], onClose, onAgentUpdated }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [model, setModel] = useState('minimax-m3');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);

  // Fetch available models from backend
  useEffect(() => {
    if (isOpen) {
      fetch(API_BASE + '/models')
        .then(res => res.json())
        .then((data: ModelInfo[]) => setModels(data))
        .catch(() => {
          // Fallback models if fetch fails (OpenCode Go models)
          setModels([
            // MiniMax
            { id: 'minimax-m3', name: 'minimax-m3', family: 'minimax', rates: { input: 0.003, output: 0.015 } },
            { id: 'minimax-m2.7', name: 'minimax-m2.7', family: 'minimax', rates: { input: 0.003, output: 0.015 } },
            { id: 'minimax-m2.5', name: 'minimax-m2.5', family: 'minimax', rates: { input: 0.003, output: 0.015 } },
            // Kimi
            { id: 'kimi-k2.7-code', name: 'kimi-k2.7-code', family: 'kimi', rates: { input: 0.003, output: 0.015 } },
            { id: 'kimi-k2.6', name: 'kimi-k2.6', family: 'kimi', rates: { input: 0.003, output: 0.015 } },
            { id: 'kimi-k2.5', name: 'kimi-k2.5', family: 'kimi', rates: { input: 0.003, output: 0.015 } },
            // GLM
            { id: 'glm-5.2', name: 'glm-5.2', family: 'glm', rates: { input: 0.003, output: 0.015 } },
            { id: 'glm-5.1', name: 'glm-5.1', family: 'glm', rates: { input: 0.003, output: 0.015 } },
            { id: 'glm-5', name: 'glm-5', family: 'glm', rates: { input: 0.003, output: 0.015 } },
            // DeepSeek
            { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro', family: 'deepseek', rates: { input: 0.003, output: 0.015 } },
            { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', family: 'deepseek', rates: { input: 0.003, output: 0.015 } },
            // Qwen
            { id: 'qwen3.7-max', name: 'qwen3.7-max', family: 'qwen', rates: { input: 0.003, output: 0.015 } },
            { id: 'qwen3.7-plus', name: 'qwen3.7-plus', family: 'qwen', rates: { input: 0.003, output: 0.015 } },
            { id: 'qwen3.6-plus', name: 'qwen3.6-plus', family: 'qwen', rates: { input: 0.003, output: 0.015 } },
            { id: 'qwen3.5-plus', name: 'qwen3.5-plus', family: 'qwen', rates: { input: 0.003, output: 0.015 } },
            // Mimo
            { id: 'mimo-v2-pro', name: 'mimo-v2-pro', family: 'mimo', rates: { input: 0.003, output: 0.015 } },
            { id: 'mimo-v2-omni', name: 'mimo-v2-omni', family: 'mimo', rates: { input: 0.003, output: 0.015 } },
            { id: 'mimo-v2.5-pro', name: 'mimo-v2.5-pro', family: 'mimo', rates: { input: 0.003, output: 0.015 } },
            { id: 'mimo-v2.5', name: 'mimo-v2.5', family: 'mimo', rates: { input: 0.003, output: 0.015 } },
            // Other
            { id: 'hy3-preview', name: 'hy3-preview', family: 'other', rates: { input: 0.003, output: 0.015 } },
          ]);
        });
    }
  }, [isOpen]);

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setRole(agent.role);
      setModel(agent.model || 'minimax-m3');
      setActiveTab('details');
      setError('');
    }
  }, [agent]);

  const getFamilyColor = (family: string) => {
    switch (family) {
      case 'claude': return 'text-purple-400';
      case 'gpt': return 'text-green-400';
      case 'kimi': return 'text-blue-400';
      default: return 'text-txt3';
    }
  };

  const selectedModelInfo = models.find(m => m.id === model);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent || !name.trim() || !role.trim()) {
      setError('Name and role are required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/agents/${agent.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: name.trim(), role: role.trim(), model }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update agent');
      }

      const updated = await res.json();
      onAgentUpdated(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update agent');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !agent) return null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'config', label: 'Config' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/70 animate-fadein" onClick={onClose}></div>
      <div className="relative bg-bg2 border border-border-custom rounded-xl w-[460px] max-h-[85vh] flex flex-col animate-fadein shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-0">
          <div>
            <h2 className="text-[15px] font-bold tracking-[0.04em] text-txt">Edit Agent</h2>
            <p className="text-[10px] text-txt3 mt-0.5">Update {agent.name}&apos;s configuration</p>
          </div>
          <button onClick={onClose} className="text-txt3 hover:text-txt transition-colors">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-5 h-5 stroke-current"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-[11px] font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'bg-cyan-custom/20 text-cyan-custom border border-cyan-custom/30'
                  : 'text-txt3 hover:text-txt2 hover:bg-bg3 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 p-2 rounded-lg bg-red-custom/10 border border-red-custom/30 text-red-custom text-[11px] font-mono">
              {error}
            </div>
          )}

          {/* Details Tab */}
          {activeTab === 'details' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5 font-semibold">Agent Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono placeholder:text-txt3 focus:outline-none focus:border-cyan-custom/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5 font-semibold">Role</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono placeholder:text-txt3 focus:outline-none focus:border-cyan-custom/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5 font-semibold">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono focus:outline-none focus:border-cyan-custom/50 transition-colors appearance-none cursor-pointer"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {/* Model rate display */}
                {selectedModelInfo && (
                  <div className="mt-1.5 flex items-center gap-2 text-[9px] font-mono">
                    <span className={`font-semibold ${getFamilyColor(selectedModelInfo.family)}`}>
                      {selectedModelInfo.family.toUpperCase()}
                    </span>
                    <span className="text-txt3">·</span>
                    <span className="text-txt3">
                      ${selectedModelInfo.rates.input}/1K in · ${selectedModelInfo.rates.output}/1K out
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 rounded-lg text-[11px] font-medium border border-border-custom text-txt2 hover:bg-bg3 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`flex-1 px-4 py-2 rounded-lg text-[11px] font-bold bg-cyan-custom/20 border border-cyan-custom/40 text-cyan-custom hover:bg-cyan-custom/30 transition-colors ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {/* Config Tab */}
          {activeTab === 'config' && (
            <AgentConfig
              agentId={agent.id}
              agentName={agent.name}
            />
          )}
        </div>
      </div>
    </div>
  );
});

EditAgentModal.displayName = 'EditAgentModal';

export default EditAgentModal;
