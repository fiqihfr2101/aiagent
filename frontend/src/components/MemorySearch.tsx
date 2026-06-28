'use client';
import { API_BASE } from '../utils/api';
import React, { useState, useCallback } from 'react';
import { MemorySearchResult } from '../types';

interface MemorySearchProps {
  agents: { id: string; name: string }[];
  onSelectMemory?: (memory: MemorySearchResult) => void;
}

const typeLabel: Record<string, string> = { fact: 'Fact', proc: 'Procedure', ctx: 'Context', ref: 'Reference' };
const typeClass: Record<string, string> = {
  fact: 'bg-[rgba(0,212,170,0.1)] text-cyan-custom border border-[rgba(0,212,170,0.2)]',
  proc: 'bg-[rgba(99,102,241,0.1)] text-[#A5B4FC] border border-[rgba(99,102,241,0.2)]',
  ctx: 'bg-[rgba(245,158,11,0.1)] text-amb-custom border border-[rgba(245,158,11,0.2)]',
  ref: 'bg-[rgba(34,197,94,0.1)] text-grn-custom border border-[rgba(34,197,94,0.2)]',
};

const MemorySearch: React.FC<MemorySearchProps> = ({ agents, onSelectMemory }) => {
  const [query, setQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [includeShared, setIncludeShared] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const resp = await fetch(API_BASE + '/memories/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          agent_id: agentFilter || undefined,
          type: typeFilter || undefined,
          include_shared: includeShared,
          include_archived: includeArchived,
          limit: 20,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setResults(data.results || []);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }, [query, agentFilter, typeFilter, includeShared, includeArchived]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const relevancePercent = (r: number) => Math.round(r * 100);
  const importancePercent = (i: number) => Math.round(i * 100);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search Header */}
      <div className="flex-shrink-0 p-5 border-b border-border-custom bg-bg2">
        <div className="text-[13px] font-bold mb-3">Semantic Memory Search</div>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 bg-bg3 border border-border-custom rounded-[7px] text-txt px-3 py-2 text-[12px] font-sans outline-none focus:border-[rgba(0,212,170,0.35)]"
            placeholder="Search memories semantically..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[11px] font-medium cursor-pointer border border-[rgba(0,212,170,0.28)] bg-[rgba(0,212,170,0.08)] text-cyan-custom hover:bg-bg4 transition-all duration-150 disabled:opacity-50"
            onClick={handleSearch}
            disabled={loading || !query.trim()}
          >
            {loading ? (
              <svg className="w-[13px] h-[13px] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[13px] h-[13px] stroke-current"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            )}
            Search
          </button>
        </div>

        {/* Filters Row */}
        <div className="flex gap-3 items-center flex-wrap">
          <select
            className="bg-bg3 border border-border-custom rounded-[5px] text-txt px-2 py-1 text-[10px] outline-none focus:border-[rgba(0,212,170,0.35)]"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <select
            className="bg-bg3 border border-border-custom rounded-[5px] text-txt px-2 py-1 text-[10px] outline-none focus:border-[rgba(0,212,170,0.35)]"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            <option value="fact">Fact</option>
            <option value="proc">Procedure</option>
            <option value="ctx">Context</option>
            <option value="ref">Reference</option>
          </select>

          <label className="flex items-center gap-1.5 text-[10px] text-txt2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeShared}
              onChange={(e) => setIncludeShared(e.target.checked)}
              className="accent-cyan-custom"
            />
            Include shared
          </label>

          <label className="flex items-center gap-1.5 text-[10px] text-txt2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="accent-cyan-custom"
            />
            Include archived
          </label>

          {searched && (
            <span className="text-[10px] text-txt3 font-mono ml-auto">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-[10px]">
        {!searched ? (
          <div className="flex flex-col items-center justify-center h-full text-txt3">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.2" className="w-10 h-10 stroke-current mb-3 opacity-30"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <div className="text-xs font-mono">Enter a query to search memories semantically</div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-txt3 text-xs font-mono">Searching...</div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-full text-txt3 text-xs font-mono">No memories found matching your query</div>
        ) : (
          results.map((m) => (
            <div
              key={m.id}
              className="bg-bg2 border border-border-custom rounded-xl p-[13px_15px] transition-all duration-150 cursor-pointer hover:border-[rgba(0,212,170,0.25)] hover:bg-bg3"
              onClick={() => onSelectMemory?.(m)}
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
              <div className="text-[11px] text-txt2 leading-relaxed mt-[5px] line-clamp-2">{m.body}</div>
              <div className="flex items-center gap-[10px] mt-[9px] pt-[9px] border-t border-border-custom">
                <span className="text-[9px] text-txt3 font-mono">{m.ts}</span>
                <span className="text-[9px] text-txt3 font-mono flex items-center gap-1">
                  <span className="w-[5px] h-[5px] rounded-full bg-grn-custom inline-block"></span>
                  {m.src}
                </span>
                <div className="flex items-center gap-3 ml-auto">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-txt3 font-mono">Relevance</span>
                    <div className="w-[40px] h-[4px] bg-bg3 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-custom rounded-full" style={{ width: `${relevancePercent(m.relevance)}%` }} />
                    </div>
                    <span className="text-[9px] text-cyan-custom font-mono">{relevancePercent(m.relevance)}%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-txt3 font-mono">Importance</span>
                    <div className="w-[40px] h-[4px] bg-bg3 rounded-full overflow-hidden">
                      <div className="h-full bg-amb-custom rounded-full" style={{ width: `${importancePercent(m.importance)}%` }} />
                    </div>
                    <span className="text-[9px] text-amb-custom font-mono">{importancePercent(m.importance)}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MemorySearch;
