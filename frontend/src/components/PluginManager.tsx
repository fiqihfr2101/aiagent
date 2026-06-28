'use client';
import { API_BASE } from '../utils/api';

import React, { useState, useEffect, useCallback } from 'react';

interface InstalledPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  icon: string;
  capabilities: string[];
  config_schema: Record<string, { type: string; default: any; description: string }>;
  builtin: boolean;
  enabled: boolean;
  config: Record<string, any>;
  installed_at: string;
  updated_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || API_BASE;

export default function PluginManager() {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [configuringPlugin, setConfiguringPlugin] = useState<InstalledPlugin | null>(null);
  const [configDraft, setConfigDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const fetchPlugins = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/plugins`);
      if (res.ok) {
        const data = await res.json();
        setPlugins(data);
      }
    } catch (err) {
      console.error('Failed to fetch plugins:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  const handleToggle = async (pluginId: string, currentlyEnabled: boolean) => {
    const endpoint = currentlyEnabled ? 'disable' : 'enable';
    try {
      const res = await fetch(`${API_URL}/plugins/${pluginId}/${endpoint}`, { method: 'POST' });
      if (res.ok) {
        setPlugins(prev => prev.map(p => p.id === pluginId ? { ...p, enabled: !currentlyEnabled } : p));
      }
    } catch (err) {
      console.error(`Failed to ${endpoint} plugin:`, err);
    }
  };

  const handleUninstall = async (pluginId: string) => {
    try {
      const res = await fetch(`${API_URL}/plugins/${pluginId}`, { method: 'DELETE' });
      if (res.ok) {
        setPlugins(prev => prev.filter(p => p.id !== pluginId));
        if (configuringPlugin?.id === pluginId) setConfiguringPlugin(null);
      }
    } catch (err) {
      console.error('Failed to uninstall plugin:', err);
    }
  };

  const handleOpenConfig = (plugin: InstalledPlugin) => {
    setConfiguringPlugin(plugin);
    setConfigDraft(plugin.config || {});
  };

  const handleSaveConfig = async () => {
    if (!configuringPlugin) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/plugins/${configuringPlugin.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configDraft }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPlugins(prev => prev.map(p => p.id === configuringPlugin.id ? { ...p, ...updated } : p));
        setConfiguringPlugin(null);
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = plugins.filter(p => p.enabled).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border-custom">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-bold tracking-[0.06em] text-txt">Installed Plugins</h2>
            <p className="text-[10px] text-txt3 mt-0.5">
              {plugins.length} installed · {enabledCount} enabled
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[9px] font-mono border border-cyan-custom/20 bg-cyan-custom/5 text-cyan-custom">
              {enabledCount}/{plugins.length} active
            </span>
          </div>
        </div>
      </div>

      {/* Plugin List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
          </div>
        ) : plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-txt3">
            <span className="text-2xl mb-2">🧩</span>
            <span className="text-[11px]">No plugins installed</span>
            <span className="text-[10px] mt-1">Browse the Marketplace to get started</span>
          </div>
        ) : (
          <div className="space-y-2">
            {plugins.map(plugin => (
              <div
                key={plugin.id}
                className={`bg-bg2 border rounded-lg p-3 transition-colors ${
                  plugin.enabled ? 'border-border-custom' : 'border-border-custom/50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <span className="text-lg">{plugin.icon}</span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-txt">{plugin.name}</span>
                      <span className="text-[8px] font-mono text-txt3">v{plugin.version}</span>
                      {plugin.builtin && (
                        <span className="px-1.5 py-0.5 rounded text-[7px] font-mono font-bold border border-ind-custom/30 bg-ind-custom/10 text-ind-custom">
                          BUILTIN
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-txt3 truncate mt-0.5">{plugin.description}</p>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleOpenConfig(plugin)}
                      className="px-2 py-1 rounded text-[9px] font-mono font-bold border border-border-custom bg-white/3 text-txt2 hover:border-cyan-custom/30 hover:text-cyan-custom transition-colors"
                    >
                      ⚙ CONFIG
                    </button>

                    {/* Toggle Switch */}
                    <button
                      onClick={() => handleToggle(plugin.id, plugin.enabled)}
                      className={`relative w-[36px] h-[18px] rounded-full transition-colors ${
                        plugin.enabled
                          ? 'bg-grn-custom/30 border border-grn-custom/50'
                          : 'bg-bg border border-border-custom'
                      }`}
                    >
                      <div
                        className={`absolute top-[2px] w-[12px] h-[12px] rounded-full transition-all ${
                          plugin.enabled
                            ? 'right-[3px] bg-grn-custom shadow-[0_0_5px_var(--grn)]'
                            : 'left-[3px] bg-txt3'
                        }`}
                      />
                    </button>

                    <button
                      onClick={() => handleUninstall(plugin.id)}
                      className="px-2 py-1 rounded text-[9px] font-mono font-bold border border-red-custom/20 text-red-custom/60 hover:border-red-custom/40 hover:text-red-custom hover:bg-red-custom/5 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Capabilities */}
                <div className="flex flex-wrap gap-1 mt-2 ml-8">
                  {plugin.capabilities.map(cap => (
                    <span
                      key={cap}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-mono border ${
                        plugin.enabled
                          ? 'border-cyan-custom/15 bg-cyan-custom/5 text-cyan-custom/80'
                          : 'border-border-custom bg-white/2 text-txt3'
                      }`}
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Config Modal */}
      {configuringPlugin && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40 animate-fadein" onClick={() => setConfiguringPlugin(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] bg-bg2 border border-border-custom rounded-xl z-50 animate-fadein overflow-hidden">
            <div className="p-4 border-b border-border-custom">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{configuringPlugin.icon}</span>
                  <span className="text-[13px] font-bold text-txt">Configure {configuringPlugin.name}</span>
                </div>
                <button onClick={() => setConfiguringPlugin(null)} className="text-txt3 hover:text-txt text-sm">✕</button>
              </div>
            </div>
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {Object.entries(configuringPlugin.config_schema).map(([key, schema]) => (
                <div key={key}>
                  <label className="text-[10px] text-txt3 tracking-[0.08em] uppercase mb-1 block">
                    {key}
                    <span className="ml-1 text-txt2 normal-case">({schema.type})</span>
                  </label>
                  <div className="text-[9px] text-txt3 mb-1">{schema.description}</div>
                  {schema.type === 'boolean' ? (
                    <button
                      onClick={() => setConfigDraft(prev => ({ ...prev, [key]: !prev[key] }))}
                      className={`px-3 py-1 rounded text-[10px] font-mono border ${
                        configDraft[key]
                          ? 'border-grn-custom/30 bg-grn-custom/10 text-grn-custom'
                          : 'border-border-custom bg-bg text-txt3'
                      }`}
                    >
                      {configDraft[key] ? 'true' : 'false'}
                    </button>
                  ) : schema.type === 'integer' ? (
                    <input
                      type="number"
                      value={configDraft[key] ?? schema.default ?? 0}
                      onChange={(e) => setConfigDraft(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-bg border border-border-custom rounded px-2 py-1.5 text-[11px] text-txt font-mono focus:border-cyan-custom/50 focus:outline-none"
                    />
                  ) : schema.type === 'array' ? (
                    <input
                      type="text"
                      value={Array.isArray(configDraft[key]) ? configDraft[key].join(', ') : (configDraft[key] ?? '')}
                      onChange={(e) => setConfigDraft(prev => ({ ...prev, [key]: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                      placeholder="Comma-separated values"
                      className="w-full bg-bg border border-border-custom rounded px-2 py-1.5 text-[11px] text-txt font-mono focus:border-cyan-custom/50 focus:outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={configDraft[key] ?? schema.default ?? ''}
                      onChange={(e) => setConfigDraft(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full bg-bg border border-border-custom rounded px-2 py-1.5 text-[11px] text-txt font-mono focus:border-cyan-custom/50 focus:outline-none"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-border-custom flex justify-end gap-2">
              <button
                onClick={() => setConfiguringPlugin(null)}
                className="px-4 py-1.5 rounded-[6px] text-[10px] font-bold font-mono border border-border-custom text-txt3 hover:text-txt transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-4 py-1.5 rounded-[6px] text-[10px] font-bold font-mono border border-cyan-custom/30 bg-cyan-custom/10 text-cyan-custom hover:bg-cyan-custom/20 transition-colors disabled:opacity-50"
              >
                {saving ? 'SAVING...' : 'SAVE CONFIG'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
