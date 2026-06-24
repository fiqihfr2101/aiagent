'use client';

import React, { useState, useEffect } from 'react';
import { Agent, TaskPriority } from '@/types';

interface TaskDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  preSelectedAgentId?: string;
}

const TaskDispatchModal: React.FC<TaskDispatchModalProps> = ({ isOpen, onClose, agents, preSelectedAgentId }) => {
  const [agentId, setAgentId] = useState(preSelectedAgentId || '');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('P2');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (preSelectedAgentId) {
      setAgentId(preSelectedAgentId);
    }
  }, [preSelectedAgentId]);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setPriority('P2');
      setError('');
      if (!preSelectedAgentId && agents.length > 0) {
        setAgentId(agents[0].id);
      }
    }
  }, [isOpen, preSelectedAgentId, agents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentId || !title.trim()) {
      setError('Please select an agent and enter a task title.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('http://localhost:8000/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          title: title.trim(),
          priority,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to dispatch task');
      }

      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch task');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-50 animate-fadein" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] bg-bg2 border border-border-custom rounded-xl z-50 animate-fadein shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-custom">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-custom/15 border border-cyan-custom/30 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" className="w-4 h-4 stroke-cyan-custom">
                <path d="M6 12L10.243 16.243L18.486 8.001" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold tracking-[0.04em]">Dispatch Task</div>
              <div className="text-[9px] text-txt3 tracking-[0.06em]">Assign a task to an agent</div>
            </div>
          </div>
          <button onClick={onClose} className="text-txt3 hover:text-txt transition-colors">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-5 h-5 stroke-current">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="text-[11px] text-red-custom bg-red-custom/10 border border-red-custom/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Agent Selector */}
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5">Agent</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-xs text-txt font-mono focus:border-cyan-custom/50 focus:outline-none transition-colors"
            >
              <option value="">Select an agent...</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} — {agent.role}
                </option>
              ))}
            </select>
          </div>

          {/* Task Title */}
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5">Task Title / Prompt</label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task instructions..."
              rows={3}
              className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-xs text-txt resize-none focus:border-cyan-custom/50 focus:outline-none transition-colors"
            />
          </div>

          {/* Priority Selector */}
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5">Priority</label>
            <div className="flex gap-2">
              {(['P1', 'P2', 'P3'] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold border transition-all ${
                    priority === p
                      ? p === 'P1'
                        ? 'bg-red-custom/15 border-red-custom/50 text-red-custom'
                        : p === 'P2'
                        ? 'bg-amb-custom/15 border-amb-custom/50 text-amb-custom'
                        : 'bg-grn-custom/15 border-grn-custom/50 text-grn-custom'
                      : 'bg-bg3 border-border-custom text-txt3 hover:border-border2'
                  }`}
                >
                  {p} {p === 'P1' ? '— High' : p === 'P2' ? '— Medium' : '— Low'}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting || !agentId || !title.trim()}
            className={`w-full py-2.5 rounded-lg text-xs font-bold font-mono tracking-[0.06em] border transition-all ${
              isSubmitting || !agentId || !title.trim()
                ? 'bg-bg3 border-border-custom text-txt3 cursor-not-allowed'
                : 'bg-cyan-custom/20 border-cyan-custom/50 text-cyan-custom hover:bg-cyan-custom/30'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
                DISPATCHING...
              </span>
            ) : (
              'DISPATCH TASK'
            )}
          </button>
        </form>
      </div>
    </>
  );
};

export default TaskDispatchModal;
