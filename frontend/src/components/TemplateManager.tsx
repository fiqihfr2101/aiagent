'use client';

import React, { memo, useState, useEffect } from 'react';

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
  created_at: string;
}

interface TemplateManagerProps {
  agents: Array<{ id: string; name: string }>;
  onClose: () => void;
}

const TemplateManager: React.FC<TemplateManagerProps> = memo(({ agents, onClose }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newModel, setNewModel] = useState('claude-sonnet-4');
  const [newSystemPrompt, setNewSystemPrompt] = useState('');
  const [newTemperature, setNewTemperature] = useState(0.5);
  const [newMaxTokens, setNewMaxTokens] = useState(4096);
  const [newTools, setNewTools] = useState<string[]>([]);
  const [newToolsets, setNewToolsets] = useState<string[]>([]);

  // Create from agent state
  const [createFromAgentId, setCreateFromAgentId] = useState('');
  const [createFromAgentName, setCreateFromAgentName] = useState('');

  const API_BASE = 'http://localhost:8000';

  // Load templates
  useEffect(() => {
    const loadTemplates = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/templates`);
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || []);
        }
      } catch (err) {
        setError('Failed to load templates');
      } finally {
        setIsLoading(false);
      }
    };

    loadTemplates();
  }, []);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  // Create template
  const handleCreateTemplate = async () => {
    if (!newName.trim()) {
      setError('Template name is required');
      return;
    }
    clearMessages();
    try {
      const res = await fetch(`${API_BASE}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim(),
          model: newModel,
          system_prompt: newSystemPrompt,
          temperature: newTemperature,
          max_tokens: newMaxTokens,
          tools: newTools,
          toolsets: newToolsets,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create template');
      }

      const created = await res.json();
      setTemplates(prev => [...prev, created]);
      setShowCreateForm(false);
      resetCreateForm();
      setSuccess(`Template "${created.name}" created`);
    } catch (err: any) {
      setError(err.message || 'Failed to create template');
    }
  };

  // Create template from agent
  const handleCreateFromAgent = async () => {
    if (!createFromAgentId || !createFromAgentName.trim()) {
      setError('Select an agent and provide a template name');
      return;
    }
    clearMessages();
    try {
      const res = await fetch(`${API_BASE}/templates/from-agent/${createFromAgentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createFromAgentName.trim(),
          description: `Template based on ${agents.find(a => a.id === createFromAgentId)?.name || createFromAgentId}`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create template');
      }

      const created = await res.json();
      setTemplates(prev => [...prev, created]);
      setCreateFromAgentId('');
      setCreateFromAgentName('');
      setSuccess(`Template "${created.name}" created from agent`);
    } catch (err: any) {
      setError(err.message || 'Failed to create template from agent');
    }
  };

  const resetCreateForm = () => {
    setNewName('');
    setNewDescription('');
    setNewModel('claude-sonnet-4');
    setNewSystemPrompt('');
    setNewTemperature(0.5);
    setNewMaxTokens(4096);
    setNewTools([]);
    setNewToolsets([]);
  };

  // Toggle tools for create form
  const toggleNewTool = (tool: string) => {
    setNewTools(prev => prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]);
  };

  const toggleNewToolset = (toolset: string) => {
    setNewToolsets(prev => prev.includes(toolset) ? prev.filter(t => t !== toolset) : [...prev, toolset]);
  };

  const AVAILABLE_TOOLS = [
    'web_search', 'file_read', 'file_write', 'terminal', 'code_execute',
    'git', 'data_analysis', 'visualization', 'sql_query', 'summarize',
    'citation_manager', 'grammar_check', 'image_gen', 'api_call',
  ];

  const AVAILABLE_TOOLSETS = [
    'research', 'development', 'terminal', 'file_access', 'analytics',
    'visualization', 'content', 'communication', 'data', 'system',
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-[11px] text-txt3 font-mono">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {/* Template List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-bold text-txt">Config Templates</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-cyan-custom/20 border border-cyan-custom/40 text-cyan-custom hover:bg-cyan-custom/30 transition-colors"
            >
              + New Template
            </button>
            <button
              onClick={onClose}
              className="text-txt3 hover:text-txt transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-5 h-5 stroke-current">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {templates.map(tpl => (
            <div
              key={tpl.id}
              onClick={() => setSelectedTemplate(selectedTemplate?.id === tpl.id ? null : tpl)}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedTemplate?.id === tpl.id
                  ? 'bg-cyan-custom/10 border-cyan-custom/40'
                  : 'bg-bg3 border-border-custom hover:border-border-hover'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-txt">{tpl.name}</span>
                    {tpl.is_default && (
                      <span className="text-[8px] font-mono text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-txt3 mt-0.5">{tpl.description}</p>
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
                    <span className="text-[8px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
                      {tpl.toolsets.length} toolsets
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {selectedTemplate?.id === tpl.id && (
                <div className="mt-3 pt-3 border-t border-border-custom space-y-2">
                  {tpl.system_prompt && (
                    <div>
                      <span className="text-[9px] text-txt3 uppercase tracking-wider">System Prompt:</span>
                      <p className="text-[10px] text-txt2 mt-0.5 font-mono bg-bg2 p-2 rounded">{tpl.system_prompt}</p>
                    </div>
                  )}
                  {tpl.tools.length > 0 && (
                    <div>
                      <span className="text-[9px] text-txt3 uppercase tracking-wider">Tools:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {tpl.tools.map(tool => (
                          <span key={tool} className="text-[8px] font-mono text-cyan-custom bg-cyan-custom/10 px-2 py-0.5 rounded">
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {Object.keys(tpl.env_vars).length > 0 && (
                    <div>
                      <span className="text-[9px] text-txt3 uppercase tracking-wider">Env Vars:</span>
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(tpl.env_vars).map(([k, v]) => (
                          <div key={k} className="text-[9px] font-mono">
                            <span className="text-cyan-custom">{k}</span>
                            <span className="text-txt3"> = </span>
                            <span className="text-txt2">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create from Agent */}
      <div className="p-3 bg-bg3 rounded-lg border border-border-custom">
        <h4 className="text-[11px] font-bold text-txt mb-2">Create from Agent</h4>
        <div className="space-y-2">
          <select
            value={createFromAgentId}
            onChange={(e) => setCreateFromAgentId(e.target.value)}
            className="w-full bg-bg2 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono focus:outline-none focus:border-cyan-custom/50 transition-colors appearance-none cursor-pointer"
          >
            <option value="">Select agent...</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={createFromAgentName}
            onChange={(e) => setCreateFromAgentName(e.target.value)}
            placeholder="Template name..."
            className="w-full bg-bg2 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono placeholder:text-txt3/50 focus:outline-none focus:border-cyan-custom/50 transition-colors"
          />
          <button
            onClick={handleCreateFromAgent}
            disabled={!createFromAgentId || !createFromAgentName.trim()}
            className="w-full px-3 py-2 rounded-lg text-[11px] font-bold bg-purple-500/20 border border-purple-500/40 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Template from Agent
          </button>
        </div>
      </div>

      {/* Create New Template Form */}
      {showCreateForm && (
        <div className="p-4 bg-bg3 rounded-lg border border-border-custom space-y-3">
          <h4 className="text-[11px] font-bold text-txt">New Template</h4>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Template name"
            className="w-full bg-bg2 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono placeholder:text-txt3/50 focus:outline-none focus:border-cyan-custom/50 transition-colors"
          />
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description"
            className="w-full bg-bg2 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono placeholder:text-txt3/50 focus:outline-none focus:border-cyan-custom/50 transition-colors"
          />
          <select
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            className="w-full bg-bg2 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono focus:outline-none focus:border-cyan-custom/50 transition-colors appearance-none cursor-pointer"
          >
            <option value="gpt-4o">GPT-4o</option>
            <option value="claude-sonnet-4">Claude Sonnet 4</option>
            <option value="claude-opus-4">Claude Opus 4</option>
            <option value="kimi-k2">Kimi K2</option>
          </select>
          <textarea
            value={newSystemPrompt}
            onChange={(e) => setNewSystemPrompt(e.target.value)}
            placeholder="System prompt..."
            rows={3}
            className="w-full bg-bg2 border border-border-custom rounded-lg px-3 py-2 text-[12px] text-txt font-mono placeholder:text-txt3/50 focus:outline-none focus:border-cyan-custom/50 transition-colors resize-none"
          />
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-wider mb-1">Temperature: {newTemperature.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={newTemperature}
              onChange={(e) => setNewTemperature(parseFloat(e.target.value))}
              className="w-full accent-cyan-custom"
            />
          </div>
          <div>
            <label className="block text-[9px] text-txt3 uppercase tracking-wider mb-1">Tools</label>
            <div className="flex flex-wrap gap-1">
              {AVAILABLE_TOOLS.map(tool => (
                <button
                  key={tool}
                  onClick={() => toggleNewTool(tool)}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-colors ${
                    newTools.includes(tool)
                      ? 'bg-cyan-custom/20 border-cyan-custom/40 text-cyan-custom'
                      : 'bg-bg2 border-border-custom text-txt3'
                  }`}
                >
                  {tool}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => { setShowCreateForm(false); resetCreateForm(); }}
              className="flex-1 px-4 py-2 rounded-lg text-[11px] font-medium border border-border-custom text-txt2 hover:bg-bg2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateTemplate}
              className="flex-1 px-4 py-2 rounded-lg text-[11px] font-bold bg-cyan-custom/20 border border-cyan-custom/40 text-cyan-custom hover:bg-cyan-custom/30 transition-colors"
            >
              Create Template
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

TemplateManager.displayName = 'TemplateManager';

export default TemplateManager;
