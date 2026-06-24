'use client';

import React, { memo, useState, useEffect, useCallback } from 'react';

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
  is_default: boolean;
}

interface AgentConfigProps {
  agentId: string;
  agentName: string;
  agents: Array<{ id: string; name: string }>;
}

const AVAILABLE_TOOLS = [
  'web_search', 'file_read', 'file_write', 'terminal', 'code_execute',
  'git', 'data_analysis', 'visualization', 'sql_query', 'summarize',
  'citation_manager', 'grammar_check', 'image_gen', 'api_call',
];

const AVAILABLE_TOOLSETS = [
  'research', 'development', 'terminal', 'file_access', 'analytics',
  'visualization', 'content', 'communication', 'data', 'system',
];

const AgentConfig: React.FC<AgentConfigProps> = memo(({ agentId, agentName, agents }) => {
  const [config, setConfig] = useState<AgentConfigData | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeSection, setActiveSection] = useState<'general' | 'tools' | 'env' | 'templates'>('general');

  // Form state
  const [model, setModel] = useState('claude-sonnet-4');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.5);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [tools, setTools] = useState<string[]>([]);
  const [toolsets, setToolsets] = useState<string[]>([]);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  // Env var editing
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');

  // Clone state
  const [cloneTargetId, setCloneTargetId] = useState('');

  const API_BASE = 'http://localhost:8000';

  // Load config
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [configRes, templatesRes] = await Promise.all([
          fetch(`${API_BASE}/agents/${agentId}/config`),
          fetch(`${API_BASE}/templates`),
        ]);

        if (configRes.ok) {
          const configData = await configRes.json();
          setConfig(configData);
          setModel(configData.model || 'claude-sonnet-4');
          setSystemPrompt(configData.system_prompt || '');
          setTemperature(configData.temperature ?? 0.5);
          setMaxTokens(configData.max_tokens ?? 4096);
          setTools(configData.tools || []);
          setToolsets(configData.toolsets || []);
          setEnvVars(configData.env_vars || {});
        }

        if (templatesRes.ok) {
          const templatesData = await templatesRes.json();
          setTemplates(templatesData.templates || []);
        }
      } catch (err) {
        setError('Failed to load configuration');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [agentId]);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  // Save config
  const handleSave = async () => {
    clearMessages();
    setIsSaving(true);
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
        const data = await res.json();
        throw new Error(data.detail || 'Failed to save config');
      }

      const saved = await res.json();
      setConfig(saved);
      setSuccess('Configuration saved successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to save config');
    } finally {
      setIsSaving(false);
    }
  };

  // Clone config
  const handleClone = async () => {
    if (!cloneTargetId) {
      setError('Select a target agent to clone to');
      return;
    }
    clearMessages();
    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/config/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_agent_id: cloneTargetId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to clone config');
      }

      setSuccess(`Config cloned to ${agents.find(a => a.id === cloneTargetId)?.name || cloneTargetId}`);
      setCloneTargetId('');
    } catch (err: any) {
      setError(err.message || 'Failed to clone config');
    }
  };

  // Apply template
  const handleApplyTemplate = async (templateId: string) => {
    clearMessages();
    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/config/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to apply template');
      }

      const applied = await res.json();
      setConfig(applied);
      setModel(applied.model);
      setSystemPrompt(applied.system_prompt);
      setTemperature(applied.temperature);
      setMaxTokens(applied.max_tokens);
      setTools(applied.tools);
      setToolsets(applied.toolsets);
      setEnvVars(applied.env_vars);
      setSuccess(`Template applied: ${templates.find(t => t.id === templateId)?.name || templateId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to apply template');
    }
  };

  // Toggle tool
  const toggleTool = (tool: string) => {
    setTools(prev => prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]);
  };

  // Toggle toolset
  const toggleToolset = (toolset: string) => {
    setToolsets(prev => prev.includes(toolset) ? prev.filter(t => t !== toolset) : [...prev, toolset]);
  };

  // Add env var
  const handleAddEnvVar = async () => {
    if (!newEnvKey.trim()) return;
    clearMessages();
    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/config/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newEnvKey.trim(), value: newEnvValue }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to set env var');
      }

      const data = await res.json();
      setEnvVars(data.env_vars);
      setNewEnvKey('');
      setNewEnvValue('');
    } catch (err: any) {
      setError(err.message || 'Failed to set env var');
    }
  };

  // Delete env var
  const handleDeleteEnvVar = async (key: string) => {
    clearMessages();
    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/config/env/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to delete env var');
      }

      const data = await res.json();
      setEnvVars(data.env_vars);
    } catch (err: any) {
      setError(err.message || 'Failed to delete env var');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-[11px] text-txt3 font-mono">Loading configuration...</div>
      </div>
    );
  }

  const otherAgents = agents.filter(a => a.id !== agentId);
  const sectionTabs = [
    { key: 'general', label: 'General' },
    { key: 'tools', label: 'Tools' },
    { key: 'env', label: 'Env Vars' },
    { key: 'templates', label: 'Templates' },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Section Tabs */}
      <div className="flex gap-1 bg-bg3 rounded-lg p-1">
        {sectionTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={`flex-1 px-3 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${
              activeSection === tab.key
                ? 'bg-cyan-custom/20 text-cyan-custom border border-cyan-custom/30'
                : 'text-txt3 hover:text-txt2'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      {error && (
        <div className="p-2 rounded-lg bg-red-custom/10 border border-red-custom/30 text-red-custom text-[11px] font-mono">
          {error}
        </div>
      )}
      {success && (
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-[11px] font-mono">
          {success}
        </div>
      )}

      {/* General Section */}
      {activeSection === 'general' && (
        <div className="space-y-4">
          {/* Model */}
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5 font-semibold">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono focus:outline-none focus:border-cyan-custom/50 transition-colors appearance-none cursor-pointer"
            >
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="claude-sonnet-4">Claude Sonnet 4</option>
              <option value="claude-opus-4">Claude Opus 4</option>
              <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="claude-3-haiku">Claude 3 Haiku</option>
              <option value="kimi-k2">Kimi K2</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5 font-semibold">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              placeholder="Enter system instructions for the agent..."
              className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono placeholder:text-txt3/50 focus:outline-none focus:border-cyan-custom/50 transition-colors resize-none"
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5 font-semibold">
              Temperature: {temperature.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-cyan-custom"
            />
            <div className="flex justify-between text-[8px] text-txt3 mt-1">
              <span>Precise (0)</span>
              <span>Balanced (1)</span>
              <span>Creative (2)</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5 font-semibold">Max Tokens</label>
            <select
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
              className="w-full bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono focus:outline-none focus:border-cyan-custom/50 transition-colors appearance-none cursor-pointer"
            >
              <option value="1024">1,024</option>
              <option value="2048">2,048</option>
              <option value="4096">4,096</option>
              <option value="8192">8,192</option>
              <option value="16384">16,384</option>
              <option value="32768">32,768</option>
            </select>
          </div>

          {/* Clone */}
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-1.5 font-semibold">Clone Config To</label>
            <div className="flex gap-2">
              <select
                value={cloneTargetId}
                onChange={(e) => setCloneTargetId(e.target.value)}
                className="flex-1 bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono focus:outline-none focus:border-cyan-custom/50 transition-colors appearance-none cursor-pointer"
              >
                <option value="">Select agent...</option>
                {otherAgents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <button
                onClick={handleClone}
                disabled={!cloneTargetId}
                className="px-3 py-2 rounded-lg text-[11px] font-medium bg-purple-500/20 border border-purple-500/40 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tools Section */}
      {activeSection === 'tools' && (
        <div className="space-y-4">
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-2 font-semibold">Tools</label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_TOOLS.map(tool => (
                <button
                  key={tool}
                  onClick={() => toggleTool(tool)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-mono border transition-colors ${
                    tools.includes(tool)
                      ? 'bg-cyan-custom/20 border-cyan-custom/40 text-cyan-custom'
                      : 'bg-bg3 border-border-custom text-txt3 hover:text-txt2'
                  }`}
                >
                  {tool}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-[0.14em] mb-2 font-semibold">Toolsets</label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_TOOLSETS.map(toolset => (
                <button
                  key={toolset}
                  onClick={() => toggleToolset(toolset)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-mono border transition-colors ${
                    toolsets.includes(toolset)
                      ? 'bg-green-500/20 border-green-500/40 text-green-400'
                      : 'bg-bg3 border-border-custom text-txt3 hover:text-txt2'
                  }`}
                >
                  {toolset}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Env Vars Section */}
      {activeSection === 'env' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newEnvKey}
              onChange={(e) => setNewEnvKey(e.target.value)}
              placeholder="KEY"
              className="flex-1 bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono placeholder:text-txt3/50 focus:outline-none focus:border-cyan-custom/50 transition-colors"
            />
            <input
              type="text"
              value={newEnvValue}
              onChange={(e) => setNewEnvValue(e.target.value)}
              placeholder="value"
              className="flex-1 bg-bg3 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono placeholder:text-txt3/50 focus:outline-none focus:border-cyan-custom/50 transition-colors"
            />
            <button
              onClick={handleAddEnvVar}
              className="px-3 py-2 rounded-lg text-[11px] font-bold bg-cyan-custom/20 border border-cyan-custom/40 text-cyan-custom hover:bg-cyan-custom/30 transition-colors"
            >
              Add
            </button>
          </div>

          {Object.entries(envVars).length === 0 ? (
            <div className="text-center py-4 text-[11px] text-txt3">No environment variables set</div>
          ) : (
            <div className="space-y-1">
              {Object.entries(envVars).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 p-2 bg-bg3 rounded-lg border border-border-custom">
                  <span className="text-[11px] font-mono text-cyan-custom font-semibold min-w-[120px]">{key}</span>
                  <span className="text-[11px] font-mono text-txt2 flex-1 truncate">{value}</span>
                  <button
                    onClick={() => handleDeleteEnvVar(key)}
                    className="text-txt3 hover:text-red-custom transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-4 h-4 stroke-current">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Templates Section */}
      {activeSection === 'templates' && (
        <div className="space-y-3">
          <div className="text-[10px] text-txt3">Apply a pre-configured template to this agent:</div>
          {templates.map(tpl => (
            <div
              key={tpl.id}
              className="p-3 bg-bg3 rounded-lg border border-border-custom hover:border-cyan-custom/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[12px] font-semibold text-txt">{tpl.name}</div>
                  <div className="text-[10px] text-txt3 mt-0.5">{tpl.description}</div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="text-[8px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
                      {tpl.model}
                    </span>
                    <span className="text-[8px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">
                      temp: {tpl.temperature}
                    </span>
                    <span className="text-[8px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                      {tpl.tools.length} tools
                    </span>
                    {tpl.is_default && (
                      <span className="text-[8px] font-mono text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                        DEFAULT
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleApplyTemplate(tpl.id)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-cyan-custom/20 border border-cyan-custom/40 text-cyan-custom hover:bg-cyan-custom/30 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end pt-2 border-t border-border-custom">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`px-6 py-2 rounded-lg text-[12px] font-bold bg-cyan-custom/20 border border-cyan-custom/40 text-cyan-custom hover:bg-cyan-custom/30 transition-colors ${
            isSaving ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
});

AgentConfig.displayName = 'AgentConfig';

export default AgentConfig;
