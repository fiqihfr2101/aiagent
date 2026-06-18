'use client';

import React, { useState } from 'react';
import NavBar from '@/components/NavBar';
import Sidebar from '@/components/Sidebar';
import AgentCard from '@/components/AgentCard';
import NodeGraph from '@/components/NodeGraph';
import Console from '@/components/Console';
import MemoryView from '@/components/MemoryView';
import AnalyticsView from '@/components/AnalyticsView';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Agent, LogEntry } from '@/types';

export default function MissionControl() {
  const [activeL1, setActiveL1] = useState('overview');
  const [activeL2, setActiveL2] = useState('overview');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { agents, logs, systemOnline, stats } = useWebSocket('ws://localhost:8000/ws');

  const handleOpenDrawer = (id: string) => {
    setSelectedAgentId(id);
    setIsDrawerOpen(true);
  };

  const activeAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="shell dotgrid flex flex-col h-screen overflow-hidden bg-bg text-txt font-sans selection:bg-cyan-custom/30">
      
      <NavBar 
        activeL1={activeL1} 
        setActiveL1={setActiveL1} 
        systemStatus={systemOnline ? 'ONLINE' : 'OFFLINE'}
        activeCount={`${stats.active_nodes} / 12 active`}
      />

      {activeL1 === 'overview' && (
        <Sidebar activeL2={activeL2} setActiveL2={setActiveL2} stats={stats} />
      )}

      {/* BREADCRUMB */}
      {activeL1 === 'overview' && (
        <div className="flex-shrink-0 h-7 bg-bg2 border-b border-border-custom/50 flex items-center px-[18px] gap-[6px]">
          <span className="text-[10px] text-txt3 tracking-[0.04em]">Operations Dashboard</span>
          <span className="text-txt3 text-[10px]">›</span>
          <span className="text-[10px] text-txt2 tracking-[0.04em]">
            {activeL2.charAt(0).toUpperCase() + activeL2.slice(1)} — Command center summary
          </span>
        </div>
      )}

      <main className="content flex-1 relative overflow-hidden">
        
        {/* OVERVIEW PAGE */}
        {activeL1 === 'overview' && activeL2 === 'overview' && (
          <div className="view on flex flex-col h-full overflow-y-auto animate-fadein">
            {/* HERO */}
            <div className="flex-shrink-0 p-[26px_28px_22px] bg-linear-to-b from-[rgba(0,30,50,0.4)] to-transparent border-b border-border-custom flex items-center gap-7">
              <div className="flex-shrink-0 w-[190px] h-[190px] flex items-center justify-center">
                 {/* Simplified Orbital for now or port the full SVG from HTML */}
                 <div className="w-32 h-32 rounded-full border-2 border-cyan-custom/20 flex items-center justify-center animate-pulse">
                    <div className="w-24 h-24 rounded-full border border-cyan-custom/40 animate-spin" style={{animationDuration: '10s'}}></div>
                    <div className="absolute w-12 h-12 rounded-full bg-cyan-custom/10 blur-xl"></div>
                 </div>
              </div>
              <div className="hero-body flex-1">
                <div className="font-mono text-[9px] text-cyan-custom tracking-[0.22em] uppercase mb-1.5">Fiqih&apos;s Team · Mission Control</div>
                <div className="text-[38px] font-bold tracking-[0.06em] leading-none text-txt">H.E.R.M.E.S.</div>
                <div className="text-[12px] text-txt2 mt-[10px] max-w-[500px] leading-[1.65]">
                  Orbital command for your agent fleet. Live telemetry, organizational graph, and second-brain memory — one console.
                </div>
                <div className="flex gap-[7px] mt-[14px] flex-wrap">
                  <span className="hpill g flex items-center gap-[5px] px-2.5 py-1 rounded-[10px] text-[10px] font-medium border border-grn-custom/25 bg-grn-custom/5 text-grn-custom font-mono">
                    <span className="w-[5px] h-[5px] rounded-full bg-grn-custom shadow-[0_0_5px_var(--grn)] animate-pulse"></span>
                    Systems Nominal
                  </span>
                  <span className="hpill px-2.5 py-1 rounded-[10px] text-[10px] font-medium border border-border2 bg-white/5 text-txt2 font-mono">{stats.active_nodes} Nodes</span>
                  <span className="hpill px-2.5 py-1 rounded-[10px] text-[10px] font-medium border border-cyan-custom/25 bg-cyan-custom/5 text-cyan-custom font-mono">{stats.running} Active</span>
                </div>
              </div>
            </div>

            {/* AGENT GRID */}
            <div className="flex-shrink-0 p-[16px_24px_20px] border-b border-border-custom">
              <div className="text-[9px] text-txt3 tracking-[0.18em] uppercase mb-3 flex items-center gap-2">
                Agent fleet · live status
                <div className="flex-1 h-px bg-border-custom"></div>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
                {agents.map(agent => (
                  <AgentCard key={agent.id} agent={agent} onClick={() => handleOpenDrawer(agent.id)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeL1 === 'overview' && activeL2 === 'graph' && (
          <NodeGraph agents={agents} onAgentClick={handleOpenDrawer} />
        )}

        {activeL1 === 'overview' && activeL2 === 'console' && (
          <Console logs={logs} agents={agents} />
        )}

        {activeL1 === 'memory' && (
          <MemoryView agents={agents} />
        )}

        {activeL1 === 'analytics-main' && (
          <AnalyticsView />
        )}

      </main>

      {/* DRAWER & OVERLAY */}
      {isDrawerOpen && activeAgent && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40 animate-fadein" onClick={() => setIsDrawerOpen(false)}></div>
          <div className="fixed top-0 right-0 h-full w-[390px] bg-bg2 border-l border-border-custom z-50 animate-fadein transform translate-x-0 transition-transform">
            <div className="p-4 border-b border-border-custom">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-lg" style={{backgroundColor: `${activeAgent.color}22`, color: activeAgent.color, border: `1px solid ${activeAgent.color}55`}}>
                    {activeAgent.name[0]}
                  </div>
                  <div>
                    <div className="text-[15px] font-bold tracking-[0.04em]">{activeAgent.name}</div>
                    <div className="text-[10px] text-txt2 mt-px">{activeAgent.role}</div>
                  </div>
                </div>
                <div className="cursor-pointer text-txt3 hover:text-txt" onClick={() => setIsDrawerOpen(false)}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-6 h-6 stroke-current"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </div>
              </div>
              <span className={`badge ${activeAgent.status} px-2 py-[2px] rounded-full text-[8px] font-bold font-mono border`}>
                {activeAgent.status.toUpperCase()}
              </span>
            </div>
            <div className="p-4">
               {/* Drawer content (logs, config, etc) could be added here */}
               <div className="text-txt3 text-xs italic">Details view for {activeAgent.name} in progress...</div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
