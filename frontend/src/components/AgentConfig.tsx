'use client';

import React, { memo, useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../utils/api';

interface AgentConfigData {
  id?: string;
  agent_id: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  tools: string[];
  toolsets: string[];
  env_vars: Record<string, string>;
}

interface Template {
  id: string;
  name: string;
  description: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  tools: string[];
  toolsets: string[];
  env_vars: Record<string, string>;
}

interface AgentConfigProps {
  agentId: string;
  agentName: string;
  onConfigSaved?: () => void;
}

const AgentConfig: React.FC<AgentConfigProps> = memo(({ agentId, agentName, onConfigSaved }) => {
  const [config, setConfig] = useState<AgentConfigData | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'tools' | 'env' | 'templates'>('general');

  // Form state
  const [model, setModel] = useState('claude-sonnet-4');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.5);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [tools, setTools] = useState<string[]>([]);
  const [toolsets, setToolsets] = useState<string[]>([]);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  // New env var form
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');

  // Fetch config
  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/agents/${agentId}/config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setModel(data.model || 'claude-sonnet-4');
        setSystemPrompt(data.system_prompt || '');
        setTemperature(data.temperature || 0.5);
        setMaxTokens(data.max_tokens || 4096);
        setTools(data.tools || []);
        setToolsets(data.toolsets || []);
        setEnvVars(data.env_vars || {});
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/templates`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchTemplates();
  }, [fetchConfig, fetchTemplates]);

  // Save config
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          system_prompt: systemPrompt,
          temperature,
          max_tokens: maxTokens,
          tools,
          toolsets,
          env_vars: envVars,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to save config');
      }

      setSuccess('Config saved successfully');
      onConfigSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  }, [agentId, model, systemPrompt, temperature, maxTokens, tools, toolsets, envVars, onConfigSaved]);

  // Apply template
  const handleApplyTemplate = useCallback(async (templateId: string) => {
    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/config/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to apply template');
      }

      await fetchConfig();
      setSuccess('Template applied successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template');
    }
  }, [agentId, fetchConfig]);

  // Add env var
  const handleAddEnvVar = useCallback(() => {
    if (!newEnvKey.trim()) return;
    setEnvVars(prev => ({ ...prev, [newEnvKey.trim()]: newEnvValue }));
    setNewEnvKey('');
    setNewEnvValue('');
  }, [newEnvKey, newEnvValue]);

  // Remove env var
  const handleRemoveEnvVar = useCallback((key: string) => {
    setEnvVars(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-border-custom pb-2">
        {(['general', 'tools', 'env', 'templates'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
              activeTab === tab
                ? 'bg-cyan-custom/20 text-cyan-custom border border-cyan-custom/40'
                : 'text-txt2 hover:text-txt border border-transparent'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-txt2 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-txt focus:border-cyan-custom focus:outline-none"
            >
              <option value="gpt-4o">gpt-4o</option>
              <option value="claude-sonnet-4">claude-sonnet-4</option>
              <option value="claude-opus-4">claude-opus-4</option>
              <option value="kimi-k2">kimi-k2</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-txt2 mb-1">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-txt focus:border-cyan-custom focus:outline-none font-mono text-sm"
              placeholder="Enter system prompt..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-txt2 mb-1">Temperature: {temperature}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-txt2 mb-1">Max Tokens</label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-txt focus:border-cyan-custom focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tools Tab */}
      {activeTab === 'tools' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-txt2 mb-2">Tools</label>
            <div className="flex flex-wrap gap-2">
              {['terminal', 'file_read', 'file_write', 'code_execute', 'git', 'web_search', 'database_query', 'api_test', 'browser', 'vulnerability_scan'].map(tool => (
                <button
                  key={tool}
                  onClick={() => {
                    setTools(prev => 
                      prev.includes(tool) 
                        ? prev.filter(t => t !== tool)
                        : [...prev, tool]
                    );
                  }}
                  className={`px-2 py-1 text-xs font-mono rounded border transition-colors ${
                    tools.includes(tool)
                      ? 'bg-cyan-custom/20 text-cyan-custom border-cyan-custom/40'
                      : 'bg-bg3 text-txt2 border-border-custom hover:border-cyan-custom/30'
                  }`}
                >
                  {tool}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-txt2 mb-2">Toolsets</label>
            <div className="flex flex-wrap gap-2">
              {['development', 'terminal', 'file_access', 'database', 'testing', 'infrastructure', 'security', 'ui_testing', 'ci_cd', 'monitoring'].map(toolset => (
                <button
                  key={toolset}
                  onClick={() => {
                    setToolsets(prev => 
                      prev.includes(toolset) 
                        ? prev.filter(t => t !== toolset)
                        : [...prev, toolset]
                    );
                  }}
                  className={`px-2 py-1 text-xs font-mono rounded border transition-colors ${
                    toolsets.includes(toolset)
                      ? 'bg-green-900/30 text-green-400 border-green-500/40'
                      : 'bg-bg3 text-txt2 border-border-custom hover:border-green-500/30'
                  }`}
                >
                  {toolset}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Env Vars Tab */}
      {activeTab === 'env' && (
        <div className="space-y-4">
          <div className="space-y-2">
            {Object.entries(envVars).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="text"
                  value={key}
                  readOnly
                  className="flex-1 bg-bg3 border border-border-custom rounded px-2 py-1 text-sm font-mono text-txt"
                />
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setEnvVars(prev => ({ ...prev, [key]: e.target.value }))}
                  className="flex-1 bg-bg3 border border-border-custom rounded px-2 py-1 text-sm font-mono text-txt"
                />
                <button
                  onClick={() => handleRemoveEnvVar(key)}
                  className="px-2 py-1 text-red-custom hover:bg-red-custom/10 rounded"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newEnvKey}
              onChange={(e) => setNewEnvKey(e.target.value)}
              placeholder="Key"
              className="flex-1 bg-bg3 border border-border-custom rounded px-2 py-1 text-sm font-mono text-txt"
            />
            <input
              type="text"
              value={newEnvValue}
              onChange={(e) => setNewEnvValue(e.target.value)}
              placeholder="Value"
              className="flex-1 bg-bg3 border border-border-custom rounded px-2 py-1 text-sm font-mono text-txt"
            />
            <button
              onClick={handleAddEnvVar}
              className="px-3 py-1 bg-cyan-custom/20 text-cyan-custom border border-cyan-custom/40 rounded hover:bg-cyan-custom/30"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-2">
          {templates.map(template => (
            <div
              key={template.id}
              className="p-3 bg-bg3 border border-border-custom rounded-lg hover:border-cyan-custom/30 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-txt">{template.name}</span>
                <button
                  onClick={() => handleApplyTemplate(template.id)}
                  className="px-2 py-0.5 text-xs font-mono bg-cyan-custom/10 text-cyan-custom border border-cyan-custom/30 rounded hover:bg-cyan-custom/20"
                >
                  Apply
                </button>
              </div>
              <p className="text-xs text-txt2">{template.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Error/Success Messages */}
      {error && <div className="text-red-custom text-sm">{error}</div>}
      {success && <div className="text-green-400 text-sm">{success}</div>}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full btn btn-pri justify-center ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {saving ? 'Saving...' : 'Save Configuration'}
      </button>
    </div>
  );
});

AgentConfig.displayName = 'AgentConfig';

export default AgentConfig;
