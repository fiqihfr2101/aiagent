'use client';
import { API_BASE, getAuthHeaders } from '../utils/api';

import React, { memo, useState, useEffect, useCallback } from 'react';
import { Agent, Memory, MemoryStats } from '../types';
import MemorySearch from './MemorySearch';

interface KnowledgeSearchResult {
  id: string;
  agent_id: string;
  type: string;
  title: string;
  body: string;
  ts: string;
  src: string;
  importance: number;
  relevance: number;
  shared: boolean;
}

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
  const [view, setView] = useState<'list' | 'search' | 'knowledge'>('list');
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareMemoryId, setShareMemoryId] = useState<string | null>(null);
  const [shareTargetAgent, setShareTargetAgent] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  // Knowledge search state
  const [kbQuery, setKbQuery] = useState('');
  const [kbResults, setKbResults] = useState<KnowledgeSearchResult[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbSearched, setKbSearched] = useState(false);
  const [kbAgentFilter, setKbAgentFilter] = useState('');
  const [showStoreDialog, setShowStoreDialog] = useState(false);
  const [storeTitle, setStoreTitle] = useState('');
  const [storeBody, setStoreBody] = useState('');
  const [storeType, setStoreType] = useState('fact');
  const [storeImportance, setStoreImportance] = useState(0.5);
  const [storeShared, setStoreShared] = useState(false);
  const [storeLoading, setStoreLoading] = useState(false);

  // Update internal memories if prop changes
  useEffect(() => {
    setInternalMemories(memories);
  }, [memories]);

  // Handle case where parent doesn't handle fetching
  useEffect(() => {
    if (Object.keys(memories).length === 0) {
      const fetchMemories = async () => {
        const resp = await fetch(`${API_BASE}/memories/${activeId}`, { headers: getAuthHeaders('') });
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
      const resp = await fetch(`${API_BASE}/memories/${activeId}/stats`, { headers: getAuthHeaders('') });
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
      const resp = await fetch(`${API_BASE}/memories/${activeId}/archive?older_than_days=30`, { method: 'POST', headers: getAuthHeaders('') });
      if (resp.ok) {
        const data = await resp.json();
        setActionResult(`Archived ${data.archived_count} memories`);
        // Refresh memories
        const memResp = await fetch(`${API_BASE}/memories/${activeId}`, { headers: getAuthHeaders('') });
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
      const resp = await fetch(`${API_BASE}/memories/${activeId}/consolidate`, { method: 'POST', headers: getAuthHeaders('') });
      if (resp.ok) {
        const data = await resp.json();
        setActionResult(`Merged ${data.merged_count} similar memories (${data.memories_remaining} remaining)`);
        // Refresh memories
         const memResp = await fetch(`${API_BASE}/memories/${activeId}`, { headers: getAuthHeaders('') });
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
        headers: getAuthHeaders(),
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

  // Knowledge search handler
  const handleKnowledgeSearch = useCallback(async () => {
    if (!kbQuery.trim()) return;
    setKbLoading(true);
    setKbSearched(true);
    try {
      const params = new URLSearchParams({ query: kbQuery.trim(), max_results: '20' });
      if (kbAgentFilter) params.append('agent_id', kbAgentFilter);
      const resp = await fetch(API_BASE + '/knowledge/search?' + params.toString(), {
        headers: getAuthHeaders(''),
      });
      if (resp.ok) {
        const data = await resp.json();
        setKbResults(data.results || []);
      }
    } catch (err) {
      console.error('Knowledge search failed:', err);
    } finally {
      setKbLoading(false);
    }
  }, [kbQuery, kbAgentFilter]);

  // Store memory handler
  const handleStoreMemory = useCallback(async () => {
    if (!storeTitle.trim() || !storeBody.trim()) return;
    setStoreLoading(true);
    try {
      const resp = await fetch(API_BASE + '/knowledge/store', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          agent_id: activeId,
          mem_type: storeType,
          title: storeTitle.trim(),
          body: storeBody.trim(),
          importance: storeImportance,
          shared: storeShared,
        }),
      });
      if (resp.ok) {
        setActionResult('Memory stored successfully');
        setShowStoreDialog(false);
        setStoreTitle('');
        setStoreBody('');
        setStoreType('fact');
        setStoreImportance(0.5);
        setStoreShared(false);
        // Refresh memories
        const memResp = await fetch(API_BASE + '/memories/' + activeId, { headers: getAuthHeaders('') });
        if (memResp.ok) {
          const memData = await memResp.json();
          setInternalMemories(prev => ({ ...prev, [activeId]: memData }));
        }
        fetchStats();
      } else {
        const err = await resp.json();
        setActionResult('Store failed: ' + (err.detail || 'Unknown error'));
      }
    } catch (err) {
      setActionResult('Store failed');
    } finally {
      setStoreLoading(false);
    }
  }, [storeTitle, storeBody, storeType, storeImportance, storeShared, activeId, fetchStats]);

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
              <button
                className={`px-2.5 py-1 text-[10px] font-medium transition-all border-l border-border-custom ${view === 'knowledge' ? 'bg-[rgba(0,212,170,0.1)] text-cyan-custom' : 'bg-bg3 text-txt2 hover:bg-bg4'}`}
                onClick={() => setView('knowledge')}
              >
                📚 Knowledge
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
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[13px] h-[13px] stroke-current"><path d="M12 5v14M5 12h14" /></svg>
              Add memory
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium cursor-pointer border border-[rgba(168,85,247,0.28)] bg-[rgba(168,85,247,0.08)] text-[#C4B5FD] hover:bg-bg4 transition-all duration-150" onClick={() => setShowStoreDialog(true)}>
              📚 Store Knowledge
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
        ) : view === 'knowledge' ? (
          /* Knowledge Search View */
          <div className="flex flex-col h-full overflow-hidden">
            {/* Knowledge Search Header */}
            <div className="flex-shrink-0 p-5 border-b border-border-custom bg-bg2">
              <div className="text-[13px] font-bold mb-1">📚 Knowledge Base Search</div>
              <div className="text-[10px] text-txt3 mb-3">Search across all agent memories and shared knowledge pool</div>
              <div className="flex gap-2 mb-3">
                <input
                  className="flex-1 bg-bg3 border border-border-custom rounded-[7px] text-txt px-3 py-2 text-[12px] font-sans outline-none focus:border-[rgba(0,212,170,0.35)]"
                  placeholder="Search knowledge base..."
                  value={kbQuery}
                  onChange={(e) => setKbQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleKnowledgeSearch(); }}
                />
                <select
                  className="bg-bg3 border border-border-custom rounded-[5px] text-txt px-2 py-2 text-[10px] outline-none focus:border-[rgba(0,212,170,0.35)]"
                  value={kbAgentFilter}
                  onChange={(e) => setKbAgentFilter(e.target.value)}
                >
                  <option value="">All agents</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[11px] font-medium cursor-pointer border border-[rgba(0,212,170,0.28)] bg-[rgba(0,212,170,0.08)] text-cyan-custom hover:bg-bg4 transition-all duration-150 disabled:opacity-50"
                  onClick={handleKnowledgeSearch}
                  disabled={kbLoading || !kbQuery.trim()}
                >
                  {kbLoading ? (
                    <svg className="w-[13px] h-[13px] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[13px] h-[13px] stroke-current"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                  )}
                  Search
                </button>
              </div>
              {kbSearched && (
                <div className="text-[10px] text-txt3 font-mono">
                  {kbResults.length} result{kbResults.length !== 1 ? 's' : ''} found
                </div>
              )}
            </div>

            {/* Knowledge Results */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-[10px]">
              {!kbSearched ? (
                <div className="flex flex-col items-center justify-center h-full text-txt3">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.2" className="w-10 h-10 stroke-current mb-3 opacity-30"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                  <div className="text-xs font-mono">Search the knowledge base for relevant memories</div>
                  <div className="text-[10px] text-txt3 mt-1">Results are ranked by relevance and importance</div>
                </div>
              ) : kbLoading ? (
                <div className="flex items-center justify-center h-full text-txt3 text-xs font-mono">Searching knowledge base...</div>
              ) : kbResults.length === 0 ? (
                <div className="flex items-center justify-center h-full text-txt3 text-xs font-mono">No knowledge found matching your query</div>
              ) : (
                kbResults.map((m) => {
                  const agentName = agents.find(a => a.id === m.agent_id)?.name || m.agent_id;
                  return (
                    <div
                      key={m.id}
                      className="bg-bg2 border border-border-custom rounded-xl p-[13px_15px] transition-all duration-150 hover:border-[rgba(0,212,170,0.25)] hover:bg-bg3"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-xs font-medium text-txt leading-relaxed">{m.title}</div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[8px] font-semibold px-[7px] py-0.5 rounded-[5px] font-mono tracking-[0.06em] uppercase ${typeClass[m.type]}`}>{typeLabel[m.type]}</span>
                          {m.shared && (
                            <span className="text-[8px] font-semibold px-[7px] py-0.5 rounded-[5px] font-mono tracking-[0.06em] uppercase bg-[rgba(168,85,247,0.1)] text-[#C4B5FD] border border-[rgba(168,85,247,0.2)]">SHARED</span>
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] text-txt2 leading-relaxed mt-[5px] line-clamp-3">{m.body}</div>
                      <div className="flex items-center gap-[10px] mt-[9px] pt-[9px] border-t border-border-custom">
                        <span className="text-[9px] text-txt3 font-mono">{m.ts}</span>
                        <span className="text-[9px] text-txt3 font-mono flex items-center gap-1">
                          <span className="w-[5px] h-[5px] rounded-full bg-[#6366F1] inline-block"></span>
                          {agentName}
                        </span>
                        <div className="flex items-center gap-3 ml-auto">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-txt3 font-mono">Relevance</span>
                            <div className="w-[40px] h-[4px] bg-bg3 rounded-full overflow-hidden">
                              <div className="h-full bg-cyan-custom rounded-full" style={{ width: (m.relevance * 100) + '%' }} />
                            </div>
                            <span className="text-[9px] text-cyan-custom font-mono">{Math.round(m.relevance * 100)}%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-txt3 font-mono">Importance</span>
                            <div className="w-[40px] h-[4px] bg-bg3 rounded-full overflow-hidden">
                              <div className="h-full bg-amb-custom rounded-full" style={{ width: (m.importance * 100) + '%' }} />
                            </div>
                            <span className="text-[9px] text-amb-custom font-mono">{Math.round(m.importance * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
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

      {/* Store Knowledge Dialog */}
      {showStoreDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowStoreDialog(false)}>
          <div className="bg-bg2 border border-border-custom rounded-xl p-5 w-[500px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-[13px] font-bold mb-4">📚 Store Knowledge</div>
            <div className="text-[10px] text-txt3 mb-4">Manually inject knowledge into {activeAgent?.name}&apos;s memory. This will be available for future conversations.</div>
            <div className="mb-3">
              <label className="text-[10px] text-txt2 font-mono uppercase mb-1 block">Title</label>
              <input
                className="w-full bg-bg3 border border-border-custom rounded-[7px] text-txt px-3 py-2 text-[11px] outline-none focus:border-[rgba(0,212,170,0.35)]"
                placeholder="e.g., API Authentication Pattern"
                value={storeTitle}
                onChange={(e) => setStoreTitle(e.target.value)}
              />
            </div>
            <div className="mb-3">
              <label className="text-[10px] text-txt2 font-mono uppercase mb-1 block">Knowledge Content</label>
              <textarea
                className="w-full bg-bg3 border border-border-custom rounded-[7px] text-txt px-3 py-2 text-[11px] outline-none focus:border-[rgba(0,212,170,0.35)] resize-none"
                placeholder="Enter the knowledge to store..."
                rows={4}
                value={storeBody}
                onChange={(e) => setStoreBody(e.target.value)}
              />
            </div>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-[10px] text-txt2 font-mono uppercase mb-1 block">Type</label>
                <select
                  className="w-full bg-bg3 border border-border-custom rounded-[5px] text-txt px-2 py-1.5 text-[11px] outline-none focus:border-[rgba(0,212,170,0.35)]"
                  value={storeType}
                  onChange={(e) => setStoreType(e.target.value)}
                >
                  <option value="fact">Fact</option>
                  <option value="proc">Procedure</option>
                  <option value="ctx">Context</option>
                  <option value="ref">Reference</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-txt2 font-mono uppercase mb-1 block">Importance ({Math.round(storeImportance * 100)}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(storeImportance * 100)}
                  onChange={(e) => setStoreImportance(parseInt(e.target.value) / 100)}
                  className="w-full accent-cyan-custom"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-1.5 text-[10px] text-txt2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={storeShared}
                  onChange={(e) => setStoreShared(e.target.checked)}
                  className="accent-cyan-custom"
                />
                Share with all agents (add to shared pool)
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-md text-[11px] font-medium cursor-pointer border border-border2 bg-bg3 text-txt hover:bg-bg4 transition-all"
                onClick={() => setShowStoreDialog(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded-md text-[11px] font-medium cursor-pointer border border-[rgba(0,212,170,0.28)] bg-[rgba(0,212,170,0.08)] text-cyan-custom hover:bg-bg4 transition-all disabled:opacity-50"
                onClick={handleStoreMemory}
                disabled={storeLoading || !storeTitle.trim() || !storeBody.trim()}
              >
                {storeLoading ? 'Storing...' : 'Store Knowledge'}
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
