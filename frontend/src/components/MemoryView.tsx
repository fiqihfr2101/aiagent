
import React, { memo } from 'react';
import { Agent, Memory } from '../types';

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
  const [activeId, setActiveId] = React.useState(agents[0]?.id || 'jarvis');
  const [internalMemories, setInternalMemories] = React.useState<Record<string, Memory[]>>(memories);
  const [search, setSearch] = React.useState('');

  // Update internal memories if prop changes
  React.useEffect(() => {
    setInternalMemories(memories);
  }, [memories]);

  // Handle case where parent doesn't handle fetching
  React.useEffect(() => {
    if (Object.keys(memories).length === 0) {
      const fetchMemories = async () => {
        const resp = await fetch(`http://localhost:8000/memories/${activeId}`);
        if (resp.ok) {
          const data = await resp.json();
          setInternalMemories(prev => ({ ...prev, [activeId]: data }));
        }
      };
      fetchMemories();
    }
  }, [activeId, memories]);

  const activeAgent = agents.find(a => a.id === activeId);
  const agentMemories = internalMemories[activeId] || [];
  const filteredMemories = agentMemories.filter(m => 
    m.title.toLowerCase().includes(search.toLowerCase()) || 
    m.body.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grid grid-cols-[240px_1fr] h-full overflow-hidden">
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
      </div>
      <div className="flex flex-col overflow-hidden min-h-0">
        <div className="flex-shrink-0 p-5 border-b border-border-custom flex items-center justify-between bg-bg2">
          <div>
            <div className="text-[13px] font-bold">{activeAgent?.name} — Knowledge base</div>
            <div className="text-[10px] text-txt2 mt-[2px]">{agentMemories.length} memories · live sync</div>
          </div>
          <div className="flex gap-2 items-center">
            <input 
              className="flex-1 max-w-[320px] bg-bg3 border border-border-custom rounded-[7px] text-txt px-[11px] py-1.5 text-[11px] font-sans outline-none focus:border-[rgba(0,212,170,0.35)]" 
              placeholder="Search memories..."
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
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-[10px]">
          {filteredMemories.length > 0 ? filteredMemories.map((m, i) => (
            <div key={i} className="bg-bg2 border border-border-custom rounded-xl p-[13px_15px] transition-all duration-150 cursor-pointer hover:border-[rgba(0,212,170,0.25)] hover:bg-bg3">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs font-medium text-txt leading-relaxed">{m.title}</div>
                <span className={`text-[8px] font-semibold px-[7px] py-0.5 rounded-[5px] font-mono tracking-[0.06em] uppercase ${typeClass[m.type]}`}>{typeLabel[m.type]}</span>
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
      </div>
    </div>
  );
});

MemoryView.displayName = 'MemoryView';

export default MemoryView;
