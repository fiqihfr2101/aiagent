'use client';
import { API_BASE } from '../utils/api';

import React, { useState, useEffect, useCallback } from 'react';

interface Plugin {
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
  enabled?: boolean;
  installed_at?: string;
}

interface MarketplaceProps {
  onInstall?: (pluginId: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || API_BASE;

const categoryIcons: Record<string, string> = {
  search: '🔍',
  filesystem: '📁',
  database: '🗄️',
  integration: '🌐',
  development: '💻',
};

const categoryLabels: Record<string, string> = {
  search: 'Search',
  filesystem: 'Filesystem',
  database: 'Database',
  integration: 'Integration',
  development: 'Development',
};

export default function Marketplace({ onInstall }: MarketplaceProps) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);

  const fetchMarketplace = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category', categoryFilter);
      const res = await fetch(`${API_URL}/marketplace?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPlugins(data);
      }
    } catch (err) {
      console.error('Failed to fetch marketplace:', err);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter]);

  const fetchInstalled = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/plugins`);
      if (res.ok) {
        const data = await res.json();
        setInstalled(new Set(data.map((p: Plugin) => p.id)));
      }
    } catch (err) {
      console.error('Failed to fetch installed plugins:', err);
    }
  }, []);

  useEffect(() => {
    fetchMarketplace();
    fetchInstalled();
  }, [fetchMarketplace, fetchInstalled]);

  const handleInstall = async (pluginId: string) => {
    setInstalling(pluginId);
    try {
      const res = await fetch(`${API_URL}/plugins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin_id: pluginId }),
      });
      if (res.ok) {
        setInstalled(prev => new Set([...prev, pluginId]));
        onInstall?.(pluginId);
      }
    } catch (err) {
      console.error('Failed to install plugin:', err);
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (pluginId: string) => {
    try {
      const res = await fetch(`${API_URL}/plugins/${pluginId}`, { method: 'DELETE' });
      if (res.ok) {
        setInstalled(prev => {
          const next = new Set(prev);
          next.delete(pluginId);
          return next;
        });
        if (selectedPlugin?.id === pluginId) setSelectedPlugin(null);
      }
    } catch (err) {
      console.error('Failed to uninstall plugin:', err);
    }
  };

  const categories = [...new Set(plugins.map(p => p.category))];

  const filteredPlugins = plugins.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && p.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border-custom">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[14px] font-bold tracking-[0.06em] text-txt">Plugin Marketplace</h2>
            <p className="text-[10px] text-txt3 mt-0.5">Browse and install plugins for your agents</p>
          </div>
          <span className="text-[10px] font-mono text-txt3">{plugins.length} available</span>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search plugins..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg border border-border-custom rounded-[6px] px-3 py-1.5 text-[11px] text-txt placeholder-txt3 focus:border-cyan-custom/50 focus:outline-none"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-txt3">🔍</span>
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-bg border border-border-custom rounded-[6px] px-2 py-1.5 text-[11px] text-txt focus:border-cyan-custom/50 focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{categoryLabels[cat] || cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Plugin Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPlugins.map(plugin => (
              <div
                key={plugin.id}
                className="bg-bg2 border border-border-custom rounded-lg p-3 hover:border-cyan-custom/30 transition-colors cursor-pointer"
                onClick={() => setSelectedPlugin(plugin)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{plugin.icon}</span>
                    <div>
                      <div className="text-[12px] font-bold text-txt">{plugin.name}</div>
                      <div className="text-[9px] text-txt3 font-mono">v{plugin.version} · {plugin.author}</div>
                    </div>
                  </div>
                  {installed.has(plugin.id) ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUninstall(plugin.id); }}
                      className="px-2 py-0.5 rounded text-[9px] font-mono font-bold border border-red-custom/30 bg-red-custom/10 text-red-custom hover:bg-red-custom/20 transition-colors"
                    >
                      UNINSTALL
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleInstall(plugin.id); }}
                      disabled={installing === plugin.id}
                      className="px-2 py-0.5 rounded text-[9px] font-mono font-bold border border-grn-custom/30 bg-grn-custom/10 text-grn-custom hover:bg-grn-custom/20 transition-colors disabled:opacity-50"
                    >
                      {installing === plugin.id ? '...' : 'INSTALL'}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-txt2 leading-relaxed mb-2 line-clamp-2">{plugin.description}</p>
                <div className="flex flex-wrap gap-1">
                  {plugin.capabilities.slice(0, 3).map(cap => (
                    <span key={cap} className="px-1.5 py-0.5 rounded text-[8px] font-mono border border-border-custom bg-white/3 text-txt3">
                      {cap}
                    </span>
                  ))}
                  {plugin.capabilities.length > 3 && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-mono text-txt3">+{plugin.capabilities.length - 3}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plugin Detail Modal */}
      {selectedPlugin && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40 animate-fadein" onClick={() => setSelectedPlugin(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-h-[80vh] bg-bg2 border border-border-custom rounded-xl z-50 animate-fadein overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border-custom">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{selectedPlugin.icon}</span>
                  <div>
                    <div className="text-[15px] font-bold text-txt">{selectedPlugin.name}</div>
                    <div className="text-[10px] text-txt3 font-mono">v{selectedPlugin.version} · {selectedPlugin.author}</div>
                  </div>
                </div>
                <button onClick={() => setSelectedPlugin(null)} className="text-txt3 hover:text-txt text-sm">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <div className="text-[9px] text-txt3 tracking-[0.14em] uppercase mb-1">Description</div>
                <p className="text-[11px] text-txt2 leading-relaxed">{selectedPlugin.description}</p>
              </div>
              <div>
                <div className="text-[9px] text-txt3 tracking-[0.14em] uppercase mb-1">Category</div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-border-custom bg-white/3 text-txt2">
                  {categoryIcons[selectedPlugin.category]} {categoryLabels[selectedPlugin.category] || selectedPlugin.category}
                </span>
              </div>
              <div>
                <div className="text-[9px] text-txt3 tracking-[0.14em] uppercase mb-1.5">Capabilities</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPlugin.capabilities.map(cap => (
                    <span key={cap} className="px-2 py-0.5 rounded text-[10px] font-mono border border-cyan-custom/20 bg-cyan-custom/5 text-cyan-custom">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
              {Object.keys(selectedPlugin.config_schema).length > 0 && (
                <div>
                  <div className="text-[9px] text-txt3 tracking-[0.14em] uppercase mb-1.5">Configuration</div>
                  <div className="space-y-1.5">
                    {Object.entries(selectedPlugin.config_schema).map(([key, schema]) => (
                      <div key={key} className="flex items-center gap-2 px-2 py-1.5 bg-bg rounded border border-border-custom">
                        <span className="text-[10px] font-mono text-cyan-custom">{key}</span>
                        <span className="text-[9px] text-txt3">({schema.type})</span>
                        <span className="flex-1 text-[9px] text-txt3">{schema.description}</span>
                        <span className="text-[9px] font-mono text-txt2">default: {JSON.stringify(schema.default)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border-custom flex justify-end gap-2">
              {installed.has(selectedPlugin.id) ? (
                <button
                  onClick={() => handleUninstall(selectedPlugin.id)}
                  className="px-4 py-1.5 rounded-[6px] text-[10px] font-bold font-mono border border-red-custom/30 bg-red-custom/10 text-red-custom hover:bg-red-custom/20 transition-colors"
                >
                  UNINSTALL
                </button>
              ) : (
                <button
                  onClick={() => handleInstall(selectedPlugin.id)}
                  disabled={installing === selectedPlugin.id}
                  className="px-4 py-1.5 rounded-[6px] text-[10px] font-bold font-mono border border-grn-custom/30 bg-grn-custom/10 text-grn-custom hover:bg-grn-custom/20 transition-colors disabled:opacity-50"
                >
                  {installing === selectedPlugin.id ? 'Installing...' : 'INSTALL PLUGIN'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
