'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import NavBar from '@/components/NavBar';
import Sidebar from '@/components/Sidebar';
import AgentCard from '@/components/AgentCard';
import NodeGraph from '@/components/NodeGraph';
import Console from '@/components/Console';
import MemoryView from '@/components/MemoryView';
import AnalyticsView from '@/components/AnalyticsView';
import CostDashboard from '@/components/CostDashboard';
import AddAgentModal from '@/components/AddAgentModal';
import EditAgentModal from '@/components/EditAgentModal';
import TaskDispatchModal from '@/components/TaskDispatchModal';
import TaskHistory from '@/components/TaskHistory';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Agent, LogEntry } from '@/types';

export default function MissionControl() {
  const [activeL1, setActiveL1] = useState('overview');
  const [activeL2, setActiveL2] = useState('overview');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('overview');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState('p1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const { agents, logs, systemOnline, stats, taskCounts, lastStoppedTask, stoppingAgentIds, markAgentStopping } = useWebSocket('ws://localhost:8000/ws');
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Show toast when a task is stopped
  useEffect(() => {
    if (lastStoppedTask) {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      setToast({ message: `⛔ Task stopped: "${lastStoppedTask.title}"`, visible: true });
      toastTimeoutRef.current = setTimeout(() => {
        setToast(prev => ({ ...prev, visible: false }));
      }, 4000);
    }
  }, [lastStoppedTask]);

  const handleOpenDrawer = (id: string) => {
    setSelectedAgentId(id);
    setIsDrawerOpen(true);
    setDrawerTab('overview');
  };

  const handleEditAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setIsEditModalOpen(true);
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm('Remove this agent from the fleet?')) return;
    try {
      const res = await fetch(`http://localhost:8000/agents/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete agent');
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  const handleAgentAdded = (agent: any) => {
    // WebSocket will auto-update via fleet_update
  };

  const handleAgentUpdated = (agent: any) => {
    // WebSocket will auto-update via fleet_update
  };

  const handleDispatchTask = async () => {
    if (!selectedAgentId || !taskTitle) return;
    setIsSubmitting(true);
    try {
      const response = await fetch('http://localhost:8000/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: selectedAgentId,
          title: taskTitle,
          priority: taskPriority,
        }),
      });
      if (response.ok) {
        setTaskTitle('');
        setDrawerTab('logs');
      }
    } catch (error) {
      console.error('Failed to dispatch task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="shell dotgrid flex flex-col h-screen overflow-hidden bg-bg text-txt font-sans selection:bg-cyan-custom/30">

      {/* Toast Notification */}
      {toast.visible && (
        <div className="fixed top-4 right-4 z-[100] animate-fadein">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-bg2 border border-red-custom/40 rounded-lg shadow-[0_0_20px_rgba(255,80,80,0.15)] backdrop-blur-sm">
            <span className="text-[11px] font-mono text-red-custom font-medium">{toast.message}</span>
            <button 
              onClick={() => setToast(prev => ({ ...prev, visible: false }))}
              className="text-txt3 hover:text-txt ml-1 text-[10px]"
            >✕</button>
          </div>
        </div>
      )}
      
      <NavBar 
        activeL1={activeL1} 
        setActiveL1={(val: string) => { setActiveL1(val); setActiveL2('overview'); }} 
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
                <button
                  onClick={() => setIsTaskModalOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[9px] font-bold font-mono bg-grn-custom/15 border border-grn-custom/30 text-grn-custom hover:bg-grn-custom/25 transition-colors tracking-[0.06em]"
                >
                  <span className="text-[11px]">⚡</span> DISPATCH TASK
                </button>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[9px] font-bold font-mono bg-cyan-custom/15 border border-cyan-custom/30 text-cyan-custom hover:bg-cyan-custom/25 transition-colors tracking-[0.06em]"
                >
                  <span className="text-[11px]">+</span> ADD AGENT
                </button>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
                {agents.map(agent => (
                  <AgentCard 
                    key={agent.id} 
                    agent={agent} 
                    onClick={() => handleOpenDrawer(agent.id)}
                    onEdit={handleEditAgent}
                    onDelete={handleDeleteAgent}
                    taskCount={taskCounts[agent.id] || 0}
                    isStopping={stoppingAgentIds.has(agent.id)}
                  />
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

        {activeL1 === 'overview' && activeL2 === 'tasks' && (
          <div className="view on h-full animate-fadein">
            <TaskHistory agents={agents} />
          </div>
        )}

        {activeL1 === 'memory' && (
          <MemoryView agents={agents} />
        )}

        {activeL1 === 'analytics-main' && (
          <AnalyticsView />
        )}

        {activeL1 === 'costs' && (
          <div className="view on h-full animate-fadein">
            <CostDashboard />
          </div>
        )}

      </main>

      {/* ADD AGENT MODAL */}
      <AddAgentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAgentAdded={handleAgentAdded}
      />

      {/* EDIT AGENT MODAL */}
      <EditAgentModal
        isOpen={isEditModalOpen}
        agent={editingAgent}
        onClose={() => { setIsEditModalOpen(false); setEditingAgent(null); }}
        onAgentUpdated={handleAgentUpdated}
      />

      {/* TASK DISPATCH MODAL */}
      <TaskDispatchModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        agents={agents}
        preSelectedAgentId={selectedAgentId || undefined}
      />

      {/* DRAWER & OVERLAY */}
      {isDrawerOpen && activeAgent && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40 animate-fadein" onClick={() => setIsDrawerOpen(false)}></div>
          <div className="fixed top-0 right-0 h-full w-[390px] bg-bg2 border-l border-border-custom z-50 animate-fadein transform translate-x-0 transition-transform flex flex-col">
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
              <div className="flex items-center gap-2">
                <span className={`badge ${activeAgent.status} px-2 py-[2px] rounded-full text-[8px] font-bold font-mono border`}>
                  {activeAgent.status.toUpperCase()}
                </span>
                {activeAgent.model && (
                  <span className="px-2 py-[2px] rounded-full text-[8px] font-bold font-mono border border-border-custom bg-[rgba(255,255,255,0.03)] text-purple-400">
                    {activeAgent.model}
                  </span>
                )}
                {/* Active task count in drawer */}
                {(taskCounts[activeAgent.id] || 0) > 0 && (
                  <span className="px-2 py-[2px] rounded-full text-[8px] font-bold font-mono border border-cyan-custom/30 bg-cyan-custom/10 text-cyan-custom flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-cyan-custom animate-pulse" />
                    {taskCounts[activeAgent.id]} active task{(taskCounts[activeAgent.id] || 0) > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            <div className="drtabs">
              <div className={`drtab ${drawerTab === 'overview' ? 'on' : ''}`} onClick={() => setDrawerTab('overview')}>Overview</div>
              <div className={`drtab ${drawerTab === 'tasks' ? 'on' : ''}`} onClick={() => setDrawerTab('tasks')}>Tasks</div>
              <div className={`drtab ${drawerTab === 'logs' ? 'on' : ''}`} onClick={() => setDrawerTab('logs')}>Logs</div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
               {drawerTab === 'overview' && (
                 <div className="animate-fadein">
                   <div className="grid grid-cols-2 gap-2 mb-4">
                     <div className="bg-bg3 border border-border-custom rounded-lg p-3">
                       <div className="text-[8px] text-txt2 uppercase tracking-wider mb-1">Uptime</div>
                       <div className="text-lg font-mono font-bold text-grn-custom">{activeAgent.uptime}</div>
                     </div>
                     <div className="bg-bg3 border border-border-custom rounded-lg p-3">
                       <div className="text-[8px] text-txt2 uppercase tracking-wider mb-1">Heartbeat</div>
                       <div className="text-lg font-mono font-bold text-cyan-custom">{activeAgent.hb}</div>
                     </div>
                     <div className="bg-bg3 border border-border-custom rounded-lg p-3">
                       <div className="text-[8px] text-txt2 uppercase tracking-wider mb-1">Active Tasks</div>
                       <div className="text-lg font-mono font-bold text-cyan-custom">{taskCounts[activeAgent.id] || 0}</div>
                     </div>
                     <div className="bg-bg3 border border-border-custom rounded-lg p-3">
                       <div className="text-[8px] text-txt2 uppercase tracking-wider mb-1">Model</div>
                       <div className="text-xs font-mono font-bold text-purple-400 truncate">{activeAgent.model || 'N/A'}</div>
                     </div>
                   </div>
                   <div className="text-txt2 text-[11px] leading-relaxed">
                     Agent {activeAgent.name} is currently {activeAgent.status}. 
                     Last seen {activeAgent.seen}.
                   </div>
                   <button
                     onClick={() => setIsTaskModalOpen(true)}
                     className="mt-4 w-full py-2 rounded-lg text-[10px] font-bold font-mono bg-cyan-custom/15 border border-cyan-custom/30 text-cyan-custom hover:bg-cyan-custom/25 transition-colors tracking-[0.06em]"
                   >
                     ⚡ DISPATCH TASK TO {activeAgent.name}
                   </button>
                 </div>
               )}

               {drawerTab === 'tasks' && (
                 <div className="animate-fadein">
                   <div className="text-[9px] text-txt3 uppercase tracking-[0.14em] mb-4">Dispatch New Task</div>
                   <div className="field">
                     <label>Task Description / Prompt</label>
                     <textarea 
                        className="h-24 resize-none"
                        placeholder="Enter instructions for the agent..."
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                     />
                   </div>
                   <div className="field">
                     <label>Priority Level</label>
                     <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)}>
                       <option value="p1">P1 — High Priority</option>
                       <option value="p2">P2 — Medium Priority</option>
                       <option value="p3">P3 — Low Priority</option>
                     </select>
                   </div>
                   <button 
                    className={`btn btn-pri w-full justify-center mt-2 ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleDispatchTask}
                    disabled={isSubmitting}
                   >
                     {isSubmitting ? 'Dispatching...' : 'Dispatch Task'}
                   </button>
                 </div>
               )}

               {drawerTab === 'logs' && (
                 <div className="animate-fadein bg-bg5 border border-border-custom rounded-lg p-3 font-mono text-[10px] leading-relaxed">
                   {logs.filter(l => l[1] === activeAgent.name).map((log, i) => (
                     <div key={i} className="mb-1">
                       <span className="text-txt3">[{log[0]}]</span> <span className="text-cyan-custom font-semibold mr-2">{log[2]}</span> <span className="text-txt">{log[3]}</span>
                     </div>
                   ))}
                   {logs.filter(l => l[1] === activeAgent.name).length === 0 && (
                     <div className="text-txt3 italic">// No recent logs for this agent</div>
                   )}
                 </div>
               )}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
