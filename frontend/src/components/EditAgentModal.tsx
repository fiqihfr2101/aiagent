'use client';

import React, { useState, useEffect } from 'react';
import { Agent } from '../types';

interface EditAgentModalProps {
  isOpen: boolean;
  agent: Agent | null;
  onClose: () => void;
  onAgentUpdated: (agent: any) => void;
}

const MODEL_OPTIONS = [
  'gpt-4o',
  'claude-sonnet-4',
  'claude-opus-4',
  'kimi-k2',
];

const EditAgentModal: React.FC<EditAgentModalProps> = ({ isOpen, agent, onClose, onAgentUpdated }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [model, setModel] = useState('claude-sonnet-4');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setRole(agent.role);
      setModel(agent.model || 'claude-sonnet-4');
    }
  }, [agent]);

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
        throw new Error('Failed to update agent');
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
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
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
