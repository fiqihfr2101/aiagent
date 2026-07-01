'use client';

import React, { memo, useState, useEffect } from 'react';
import { Role } from '../types';
import { API_BASE, getAuthHeaders } from '../utils/api';

interface AddAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentAdded: (agent: any) => void;
}

const MODEL_OPTIONS = [
  // MiniMax
  'minimax-m3',
  'minimax-m2.7',
  'minimax-m2.5',
  // Kimi
  'kimi-k2.7-code',
  'kimi-k2.6',
  'kimi-k2.5',
  // GLM
  'glm-5.2',
  'glm-5.1',
  'glm-5',
  // DeepSeek
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  // Qwen
  'qwen3.7-max',
  'qwen3.7-plus',
  'qwen3.6-plus',
  'qwen3.5-plus',
  // Mimo
  'mimo-v2-pro',
  'mimo-v2-omni',
  'mimo-v2.5-pro',
  'mimo-v2.5',
  // Other
  'hy3-preview',
];

const AddAgentModal: React.FC<AddAgentModalProps> = memo(({ isOpen, onClose, onAgentAdded }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [roleId, setRoleId] = useState('');
  const [model, setModel] = useState('minimax-m3');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [isCustomRole, setIsCustomRole] = useState(false);

  // Fetch roles on mount
  useEffect(() => {
    if (!isOpen) return;
    setLoadingRoles(true);
    fetch(`${API_BASE}/roles`)
      .then(res => res.json())
      .then(data => {
        setRoles(data || []);
        setLoadingRoles(false);
      })
      .catch(() => {
        setLoadingRoles(false);
      });
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Agent name is required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const body: any = {
        name: name.trim(),
        model,
      };

      if (isCustomRole) {
        body.role = role.trim();
      } else {
        body.role_id = roleId;
      }

      const res = await fetch(`${API_BASE}/agents`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to create agent');
      }

      const agent = await res.json();
      onAgentAdded(agent);
      setName('');
      setRole('');
      setRoleId('');
      setModel('minimax-m3');
      setIsCustomRole(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedRole = roles.find(r => r.id === roleId);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fadein">
      <div className="bg-bg2 border border-border-custom rounded-lg w-[480px] max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-border-custom">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-txt">Add New Agent</h2>
            <button onClick={onClose} className="text-txt3 hover:text-txt">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-6 h-6 stroke-current">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Agent Name */}
          <div>
            <label className="block text-sm text-txt2 mb-1">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., BACKEND-01"
              className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-txt focus:border-cyan-custom focus:outline-none"
              required
            />
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm text-txt2 mb-1">Role</label>
            {loadingRoles ? (
              <div className="text-txt3 text-sm">Loading roles...</div>
            ) : (
              <>
                <select
                  value={isCustomRole ? 'custom' : roleId}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsCustomRole(true);
                      setRoleId('');
                    } else {
                      setIsCustomRole(false);
                      setRoleId(e.target.value);
                      setRole('');
                    }
                  }}
                  className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-txt focus:border-cyan-custom focus:outline-none"
                >
                  <option value="">Select a role...</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.icon} {r.name}
                    </option>
                  ))}
                  <option value="custom">✏️ Custom Role</option>
                </select>

                {/* Role Preview */}
                {selectedRole && !isCustomRole && (
                  <div className="mt-2 p-3 bg-bg3 border border-border-custom rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{selectedRole.icon}</span>
                      <span className="font-semibold text-txt">{selectedRole.name}</span>
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedRole.color }} />
                    </div>
                    <p className="text-xs text-txt2 mb-2">{selectedRole.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedRole.tools?.slice(0, 5).map(tool => (
                        <span key={tool} className="px-1.5 py-0.5 text-[9px] font-mono bg-bg border border-border-custom rounded text-txt3">
                          {tool}
                        </span>
                      ))}
                      {selectedRole.tools?.length > 5 && (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono text-txt3">
                          +{selectedRole.tools.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Custom Role Input */}
                {isCustomRole && (
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Enter custom role..."
                    className="w-full mt-2 bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-txt focus:border-cyan-custom focus:outline-none"
                  />
                )}
              </>
            )}
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm text-txt2 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-txt focus:border-cyan-custom focus:outline-none"
            >
              {MODEL_OPTIONS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-custom text-sm">{error}</div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full btn btn-pri justify-center ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSubmitting ? 'Creating...' : 'Create Agent'}
          </button>
        </form>
      </div>
    </div>
  );
});

AddAgentModal.displayName = 'AddAgentModal';

export default AddAgentModal;
