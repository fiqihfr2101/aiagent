'use client';

import React, { useState, useEffect } from 'react';
import { Agent } from '../types';

interface ModelInfo {
  id: string;
  name: string;
  family: string;
  rates: { input: number; output: number };
}

interface EditAgentModalProps {
  isOpen: boolean;
  agent: Agent | null;
  onClose: () => void;
  onAgentUpdated: (agent: any) => void;
}

const EditAgentModal: React.FC<EditAgentModalProps> = ({ isOpen, agent, onClose, onAgentUpdated }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [model, setModel] = useState('claude-sonnet-4');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);

  // Fetch available models from backend
  useEffect(() => {
    if (isOpen) {
      fetch('http://localhost:8000/models')
        .then(res => res.json())
        .then((data: ModelInfo[]) => setModels(data))
        .catch(() => {
          // Fallback models if fetch fails
          setModels([
            { id: 'gpt-4o', name: 'gpt-4o', family: 'gpt', rates: { input: 0.005, output: 0.015 } },
            { id: 'claude-sonnet-4', name: 'claude-sonnet-4', family: 'claude', rates: { input: 0.003, output: 0.015 } },
            { id: 'claude-opus-4', name: 'claude-opus-4', family: 'claude', rates: { input: 0.015, output: 0.075 } },
            { id: 'kimi-k2', name: 'kimi-k2', family: 'kimi', rates: { input: 0.003, output: 0.015 } },
          ]);
        });
    }
  }, [isOpen]);

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setRole(agent.role);
      setModel(agent.model || 'claude-sonnet-4');
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
      const res = await fetch(`http://localhost:8000/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/70 animate-fadein" onClick={onClose}></div>
      <div className="relative bg-bg2 border border-border-custom rounded-xl w-[400px] p-6 animate-fadein shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[15px] font-bold tracking-[0.04em] text-txt">Edit Agent</h2>
            <p className="text-[10px] text-txt3 mt-0.5">Update {agent.name}&apos;s configuration</p>
          </div>
          <button onClick={onClose} className="text-txt3 hover:text-txt transition-colors">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-5 h-5 stroke-current"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-2 rounded-lg bg-red-custom/10 border border-red-custom/30 text-red-custom text-[11px] font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5 font-semibold">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono placeholder:text-txt3/50 focus:outline-none focus:border-cyan-custom/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5 font-semibold">Role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono placeholder:text-txt3/50 focus:outline-none focus:border-cyan-custom/50 transition-colors"
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
      </div>
    </div>
  );
};

export default EditAgentModal;
