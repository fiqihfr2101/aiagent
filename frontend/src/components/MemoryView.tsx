'use client';
import { API_BASE } from '../utils/api';

import React, { memo, useState, useEffect, useCallback } from 'react';
import { Agent, Memory, MemoryStats } from '../types';
import MemorySearch from './MemorySearch';

interface MemoryViewProps {
  agents: Agent[];
  memories?: Record<string, Memory[]>;
  onSync?: () => void;
  onAdd?: (agentId: string) => void;
}

const typeLabel: Record<string, string> = { fact: 'Fact', proc: 'Procedure', ctx: 'Context', ref: 'Reference' };
const typeClass: Record<string, string> = { 
  fact: 'bg-[rgba(0,212,170,0.1)] text-cyan-custom border border-[rgba(0,212,170,0.2)]',
  proc: 'bg-[rgba(99,102,241,0.1)] text-[#A5B4FC] border border-[rgba(99,102,241,0.2)]',
  ctx: 'bg-[rgba(245,158,11,0.1)] text-amb-custom border border-[rgba(245,158,11,0.2)]',
  ref: 'bg-[rgba(34,197,94,0.1)] text-grn-custom border border-[rgba(34,197,94,0.2)]'
};

const MemoryView: React.FC<MemoryViewProps> = memo(({ agents, memories = {}, onSync = () => {}, onAdd = () => {} }) => {
  const [activeId, setActiveId] = useState(agents[0]?.id || 'jarvis');
  const [internalMemories, setInternalMemories] = useState<Record<string, Memory[]>>(memories);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'search'>('list');
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareMemoryId, setShareMemoryId] = useState<string | null>(null);
  const [shareTargetAgent, setShareTargetAgent] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  // Update internal memories if prop changes
  useEffect(() => {
    setInternalMemories(memories);
  }, [memories]);

  // Handle case where parent doesn't handle fetching
  useEffect(() => {
    if (Object.keys(memories).length === 0) {
      const fetchMemories = async () => {
        const resp = await fetch(`${API_BASE}/memories/${activeId}`);
        if (resp.ok) {
          const data = await resp.json();
          setInternalMemories(prev => ({ ...prev, [activeId]: data }));
        }
      };
      fetchMemories();
    }
  }, [activeId, memories]);

  // Fetch stats when agent changes
  const fetchStats = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/memories/${activeId}/stats`);
      if (resp.ok) {
        const data = await resp.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, [activeId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleArchive = async () => {
    setArchiving(true);
    setActionResult(null);
    try {
      const resp = await fetch(`${API_BASE}/memories/${activeId}/archive?older_than_days=30`, { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json();
        setActionResult(`Archived ${data.archived_count} memories`);
        // Refresh memories
        const memResp = await fetch(`${API_BASE}/memories/${activeId}`);
        if (memResp.ok) {
          const memData = await memResp.json();
          setInternalMemories(prev => ({ ...prev, [activeId]: memData }));
        }
        fetchStats();
      }
    } catch (err) {
      setActionResult('Archive failed');
    } finally {
      setArchiving(false);
    }
  };

  const handleConsolidate = async () => {
    setConsolidating(true);
    setActionResult(null);
    try {
      const resp = await fetch(`${API_BASE}/memories/${activeId}/consolidate`, { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json();
        setActionResult(`Merged ${data.merged_count} similar memories (${data.memories_remaining} remaining)`);
        // Refresh memories
        const memResp = await fetch(`${API_BASE}/memories/${activeId}`);
        if (memResp.ok) {
          const memData = await memResp.json();
          setInternalMemories(prev => ({ ...prev, [activeId]: memData }));
        }
        fetchStats();
      }
    } catch (err) {
      setActionResult('Consolidation failed');
    } finally {
      setConsolidating(false);
    }
  };

  const handleShare = async () => {
    if (!shareMemoryId || !shareTargetAgent) return;
    try {
      const resp = await fetch(API_BASE + '/memories/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memory_id: shareMemoryId,
          from_agent_id: activeId,
          to_agent_id: shareTargetAgent,
        }),
      });
      if (resp.ok) {
        setActionResult('Memory shared successfully');
        setShowShareDialog(false);
        setShareMemoryId(null);
        setShareTargetAgent('');
        fetchStats();
      } else {
        const err = await resp.json();
        setActionResult(`Share failed: ${err.detail || 'Unknown error'}`);
      }
    } catch (err) {
      setActionResult('Share failed');
    }
  };

  const activeAgent = agents.find(a => a.id === activeId);
  const agentMemories = internalMemories[activeId] || [];
  const filteredMemories = agentMemories.filter(m => 
    m.title.toLowerCase().includes(search.toLowerCase()) || 
    m.body.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grid grid-cols-[240px_1fr] h-full overflow-hidden">
      {/* Sidebar */}
      <div className="bg-bg2 border-r border-border-custom flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border-custom flex-shrink-0">
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-txt2">Agent knowledge base</div>
          <div className="text-[9px] text-txt3 mt-1 font-mono uppercase">Powered by Gobrain</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {agents.map(a => (
            <div 
              key={a.id} 
              onClick={() => setActiveId(a.id)}
              className={`flex items-center gap-[9px] p-2 rounded-lg cursor-pointer transition-all duration-150 border border-transparent ${
                activeId === a.id ? 'bg-[rgba(0,212,170,0.08)] border-[rgba(0,212,170,0.2)]' : 'hover:bg-bg3'
              }`}
            >
              <div className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-[10px] font-bold font-mono flex-shrink-0 bg-[rgba(0,212,170,0.12)] text-cyan-custom border border-[rgba(0,212,170,0.25)]">
                {a.name[0]}
              </div>
              <div>
                <div className="text-xs font-medium">{a.name}</div>
                <div className="text-[9px] text-txt3 font-mono mt-[1px]">{(memories[a.id] || []).length} memories</div>
              </div>
            </div>
          ))}
        </div>
        {/* Stats Toggle */}
        <div className="p-2 border-t border-border-custom">
          <button
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium cursor-pointer border border-border2 bg-bg3 text-txt hover:bg-bg4 transition-all duration-150"
            onClick={() => setShowStats(!showStats)}
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[13px] h-[13px] stroke-current"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            {showStats ? 'Hide' : 'Show'} Stats
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col overflow-hidden min-h-0">
        {/* Header */}
        <div className="flex-shrink-0 p-5 border-b border-border-custom flex items-center justify-between bg-bg2">
          <div>
            <div className="text-[13px] font-bold">{activeAgent?.name} — Knowledge base</div>
            <div className="text-[10px] text-txt2 mt-[2px]">{agentMemories.length} memories · live sync</div>
          </div>
          <div className="flex gap-2 items-center">
            {/* View Toggle */}
            <div className="flex rounded-md border border-border-custom overflow-hidden">
              <button
                className={`px-2.5 py-1 text-[10px] font-medium transition-all ${view === 'list' ? 'bg-[rgba(0,212,170,0.1)] text-cyan-custom' : 'bg-bg3 text-txt2 hover:bg-bg4'}`}
                onClick={() => setView('list')}
              >
                List
              </button>
              <button
                className={`px-2.5 py-1 text-[10px] font-medium transition-all border-l border-border-custom ${view === 'search' ? 'bg-[rgba(0,212,170,0.1)] text-cyan-custom' : 'bg-bg3 text-txt2 hover:bg-bg4'}`}
                onClick={() => setView('search')}
              >
                Search
              </button>
            </div>
            <input 
              className={`flex-1 max-w-[320px] bg-bg3 border border-border-custom rounded-[7px] text-txt px-[11px] py-1.5 text-[11px] font-sans outline-none focus:border-[rgba(0,212,170,0.35)] ${view === 'search' ? 'hidden' : ''}`} 
              placeholder="Filter memories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium cursor-pointer border border-[rgba(0,212,170,0.28)] bg-[rgba(0,212,170,0.08)] text-cyan-custom hover:bg-bg4 transition-all duration-150" onClick={onSync}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[13px] h-[13px] stroke-current"><path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15.66-3M20 15a9 9 0 0 1-15.66 3"/></svg>
              Sync Gobrain
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium cursor-pointer border border-border2 bg-bg3 text-txt hover:bg-bg4 transition-all duration-150" onClick={() => onAdd(activeId)}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[13px] h-[13px] stroke-current"><path d="M12 5v14M5 12h14"/></svg>
              Add memory
            </button>
          </div>
        </div>

        {/* Stats Panel */}
        {showStats && stats && (
          <div className="flex-shrink-0 p-4 border-b border-border-custom bg-bg2">
            <div className="grid grid-cols-6 gap-3">
              <div className="bg-bg3 rounded-lg p-3 border border-border-custom">
                <div className="text-[9px] text-txt3 font-mono uppercase">Total</div>
                <div className="text-lg font-bold text-txt mt-1">{stats.total}</div>
              </div>
              <div className="bg-bg3 rounded-lg p-3 border border-border-custom">
                <div className="text-[9px] text-txt3 font-mono uppercase">Active</div>
                <div className="text-lg font-bold text-grn-custom mt-1">{stats.active}</div>
              </div>
              <div className="bg-bg3 rounded-lg p-3 border border-border-custom">
                <div className="text-[9px] text-txt3 font-mono uppercase">Archived</div>
                <div className="text-lg font-bold text-txt2 mt-1">{stats.archived}</div>
              </div>
              <div className="bg-bg3 rounded-lg p-3 border border-border-custom">
                <div className="text-[9px] text-txt3 font-mono uppercase">Shared</div>
                <div className="text-lg font-bold text-[#C4B5FD] mt-1">{stats.shared}</div>
              </div>
              <div className="bg-bg3 rounded-lg p-3 border border-border-custom">
                <div className="text-[9px] text-txt3 font-mono uppercase">Avg Importance</div>
                <div className="text-lg font-bold text-amb-custom mt-1">{Math.round(stats.avg_importance * 100)}%</div>
              </div>
              <div className="bg-bg3 rounded-lg p-3 border border-border-custom">
                <div className="text-[9px] text-txt3 font-mono uppercase">Accesses</div>
                <div className="text-lg font-bold text-cyan-custom mt-1">{stats.total_accesses}</div>
              </div>
            </div>
            {/* Type breakdown */}
            <div className="flex gap-4 mt-3">
              {Object.entries(stats.by_type).map(([type, count]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span className={`text-[8px] font-semibold px-[5px] py-0.5 rounded-[4px] font-mono tracking-[0.06em] uppercase ${typeClass[type]}`}>{typeLabel[type]}</span>
                  <span className="text-[10px] text-txt2 font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex-shrink-0 px-5 py-2 border-b border-border-custom bg-bg2 flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium cursor-pointer border border-border2 bg-bg3 text-txt hover:bg-bg4 transition-all duration-150 disabled:opacity-50"
            onClick={handleArchive}
            disabled={archiving}
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[12px] h-[12px] stroke-current"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>
            {archiving ? 'Archiving...' : 'Archive Old (30d+)'}
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium cursor-pointer border border-border2 bg-bg3 text-txt hover:bg-bg4 transition-all duration-150 disabled:opacity-50"
            onClick={handleConsolidate}
            disabled={consolidating}
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[12px] h-[12px] stroke-current"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
            {consolidating ? 'Consolidating...' : 'Consolidate Similar'}
          </button>
          {actionResult && (
            <span className="text-[10px] text-cyan-custom font-mono ml-2">{actionResult}</span>
          )}
        </div>

        {/* Content Area */}
        {view === 'search' ? (
          <MemorySearch agents={agents} />
        ) : (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-[10px]">
            {filteredMemories.length > 0 ? filteredMemories.map((m, i) => (
              <div key={i} className="bg-bg2 border border-border-custom rounded-xl p-[13px_15px] transition-all duration-150 cursor-pointer hover:border-[rgba(0,212,170,0.25)] hover:bg-bg3">
                <div className="flex items-start justify-between mb-2">
                  <div className="text-xs font-medium text-txt leading-relaxed">{m.title}</div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-semibold px-[7px] py-0.5 rounded-[5px] font-mono tracking-[0.06em] uppercase ${typeClass[m.type]}`}>{typeLabel[m.type]}</span>
                    <button
                      className="text-[8px] font-semibold px-[7px] py-0.5 rounded-[5px] font-mono tracking-[0.06em] uppercase bg-[rgba(168,85,247,0.1)] text-[#C4B5FD] border border-[rgba(168,85,247,0.2)] hover:bg-[rgba(168,85,247,0.2)] transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShareMemoryId(m.id || null);
                        setShowShareDialog(true);
                      }}
                    >
                      Share
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-txt2 leading-relaxed mt-[5px]">{m.body}</div>
                <div className="flex items-center gap-[10px] mt-[9px] pt-[9px] border-t border-border-custom">
                  <span className="text-[9px] text-txt3 font-mono">{m.ts}</span>
                  <span className="text-[9px] text-txt3 font-mono flex items-center gap-1"><span className="w-[5px] h-[5px] rounded-full bg-grn-custom inline-block"></span>Synced from {m.src}</span>
                  <span className="flex items-center gap-[5px] text-[9px] text-grn-custom font-mono ml-auto bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.2)] px-2 py-[2px] rounded-lg">● GOBRAIN</span>
                </div>
              </div>
            )) : (
              <div className="text-txt3 text-xs text-center py-10 font-mono">// No memories stored for this agent</div>
            )}
          </div>
        )}
      </div>

      {/* Share Dialog */}
      {showShareDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowShareDialog(false)}>
          <div className="bg-bg2 border border-border-custom rounded-xl p-5 w-[380px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-[13px] font-bold mb-4">Share Memory</div>
            <div className="mb-3">
              <label className="text-[10px] text-txt2 font-mono uppercase mb-1 block">Target Agent</label>
              <select
                className="w-full bg-bg3 border border-border-custom rounded-[7px] text-txt px-3 py-2 text-[11px] outline-none focus:border-[rgba(0,212,170,0.35)]"
                value={shareTargetAgent}
                onChange={(e) => setShareTargetAgent(e.target.value)}
              >
                <option value="">Select agent...</option>
                {agents.filter(a => a.id !== activeId).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-1.5 rounded-md text-[11px] font-medium cursor-pointer border border-border2 bg-bg3 text-txt hover:bg-bg4 transition-all"
                onClick={() => setShowShareDialog(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded-md text-[11px] font-medium cursor-pointer border border-[rgba(0,212,170,0.28)] bg-[rgba(0,212,170,0.08)] text-cyan-custom hover:bg-bg4 transition-all disabled:opacity-50"
                onClick={handleShare}
                disabled={!shareTargetAgent}
              >
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

MemoryView.displayName = 'MemoryView';

export default MemoryView;
