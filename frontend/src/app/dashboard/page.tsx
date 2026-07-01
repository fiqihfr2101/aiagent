'use client';

import React, { useState, useCallback, useMemo, Suspense, lazy } from 'react';
import AppLayout, { useDashboard } from '@/components/AppLayout';
import Sidebar from '@/components/Sidebar';
import AgentCard from '@/components/AgentCard';
import { API_BASE, getAuthHeaders } from '@/utils/api';
import { Agent } from '@/types';

// Dynamic imports for heavy components
const NodeGraph = lazy(() => import('@/components/NodeGraph'));
const Console = lazy(() => import('@/components/Console'));
const TaskHistory = lazy(() => import('@/components/TaskHistory'));
const TaskLogs = lazy(() => import('@/components/TaskLogs'));
const AddAgentModal = lazy(() => import('@/components/AddAgentModal'));
const EditAgentModal = lazy(() => import('@/components/EditAgentModal'));
const TemplateManager = lazy(() => import('@/components/TemplateManager'));
const TaskDispatchModal = lazy(() => import('@/components/TaskDispatchModal'));
const ShortcutsHelp = lazy(() => import('@/components/ShortcutsHelp'));

function ComponentLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
    </div>
  );
}

function DashboardContent() {
  const { agents, logs, systemOnline, stats, taskCounts, lastStoppedTask, stoppingAgentIds, markAgentStopping, globalLogs } = useDashboard();

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
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [globalLogsLoaded, setGlobalLogsLoaded] = useState(false);

  const handleOpenDrawer = useCallback((id: string) => {
    setSelectedAgentId(id);
    setIsDrawerOpen(true);
    setDrawerTab('overview');
  }, []);

  const handleDeleteAgent = useCallback(async (id: string) => {
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/agents/${id}`, { method: 'DELETE', headers: getAuthHeaders('') });
      if (res.ok) {
        setIsDrawerOpen(false);
        setSelectedAgentId(null);
      }
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  }, []);

  const handleDispatchTask = useCallback(async () => {
    if (!selectedAgentId || !taskTitle) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/task`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ agent_id: selectedAgentId, title: taskTitle, priority: taskPriority }),
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
  }, [selectedAgentId, taskTitle, taskPriority]);

  const handleStopTask = useCallback(async (taskId: string) => {
    if (!confirm('Stop this task? This will immediately halt execution.')) return;
    const agentId = selectedAgentId;
    if (agentId) markAgentStopping(agentId);
    try {
      await fetch(`${API_BASE}/tasks/${taskId}/stop`, { method: 'POST', headers: getAuthHeaders('') });
    } catch (err) {
      console.error('Failed to stop task:', err);
    }
  }, [selectedAgentId, markAgentStopping]);

  const activeAgent = useMemo(() => agents.find(a => a.id === selectedAgentId), [agents, selectedAgentId]);

  const filteredDrawerLogs = useMemo(() => {
    if (!activeAgent) return [];
    return logs.filter(l => l[1] === activeAgent.name);
  }, [logs, activeAgent]);

  const getModelBadgeColor = useCallback((model?: string) => {
    if (!model) return 'text-txt3';
    if (model.includes('claude')) return 'text-purple-400';
    if (model.includes('gpt')) return 'text-green-400';
    if (model.includes('kimi')) return 'text-blue-400';
    return 'text-txt3';
  }, []);

  return (
    <>
      <Sidebar activeL2={activeL2} setActiveL2={setActiveL2} stats={stats} />

      {/* BREADCRUMB */}
      <div className="flex-shrink-0 h-7 bg-bg2 border-b border-border-custom/50 flex items-center px-[18px] gap-[6px]">
        <span className="text-[10px] text-txt3 tracking-[0.04em]">Operations Dashboard</span>
        <span className="text-txt3 text-[10px]">›</span>
        <span className="text-[10px] text-txt2 tracking-[0.04em]">
          {activeL2.charAt(0).toUpperCase() + activeL2.slice(1)} — Command center summary
        </span>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {/* OVERVIEW PAGE */}
        {activeL2 === 'overview' && (
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
                <div className="text-[38px] font-bold tracking-[0.06em] leading-none text-txt">AFILABS</div>
                <div className="text-[12px] text-txt2 mt-[10px] max-w-[500px] leading-[1.65]">
                  Orbital command for your agent fleet. Live telemetry, organizational graph, and second-brain memory — one console.
                </div>
                <div className="flex gap-[7px] mt-[14px] flex-wrap">
                  <span className="hpill g flex items-center gap-[5px] px-2.5 py-1 rounded-[10px] text-[10px] font-medium border border-grn-custom/25 bg-grn-custom/5 text-grn-custom font-mono">
                    <span className="w-[5px] h-[5px] rounded-full bg-grn-custom shadow-[0_0_5px_var(--grn)] animate-pulse"></span>
                    {systemOnline ? 'Systems Nominal' : 'Systems Offline'}
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
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-2 py-0.5 text-[9px] font-mono bg-cyan-custom/10 border border-cyan-custom/30 text-cyan-custom rounded hover:bg-cyan-custom/20 transition-colors"
                >
                  + ADD AGENT
                </button>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
                {agents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    taskCount={taskCounts[agent.id] || 0}
                    onClick={() => handleOpenDrawer(agent.id)}
                    onEdit={(a) => { setEditingAgent(a); setIsEditModalOpen(true); }}
                    onDelete={handleDeleteAgent}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeL2 === 'graph' && (
          <Suspense fallback={<ComponentLoader />}>
            <NodeGraph agents={agents} onAgentClick={handleOpenDrawer} />
          </Suspense>
        )}

        {activeL2 === 'console' && (
          <Suspense fallback={<ComponentLoader />}>
            <Console logs={logs} agents={agents} />
          </Suspense>
        )}

        {activeL2 === 'tasks' && (
          <Suspense fallback={<ComponentLoader />}>
            <TaskHistory agents={agents} />
          </Suspense>
        )}

        {activeL2 === 'logs' && (
          <Suspense fallback={<ComponentLoader />}>
            <TaskLogs logs={globalLogs} />
          </Suspense>
        )}

        {activeL2 === 'templates' && (
          <Suspense fallback={<ComponentLoader />}>
            <TemplateManager agents={agents} onClose={() => setActiveL2('overview')} />
          </Suspense>
        )}
      </div>

      {/* DRAWER & OVERLAY */}
      {isDrawerOpen && activeAgent && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40 animate-fadein" onClick={() => setIsDrawerOpen(false)}></div>
          <div className="fixed top-0 right-0 h-full w-[390px] max-w-[90vw] bg-bg2 border-l border-border-custom z-50 animate-fadein flex flex-col overflow-hidden">
            <div className="flex-shrink-0 p-4 border-b border-border-custom">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-lg" style={{backgroundColor: `${activeAgent.color}22`, color: activeAgent.color, border: `1px solid ${activeAgent.color}55`}}>
                    {activeAgent.name[0]}
                  </div>
                  <div>
                    <div className="text-[15px] font-bold tracking-[0.04em]">{activeAgent.name}</div>
                    <div className="text-[10px] text-txt2 mt-px flex items-center gap-1.5">
                      {activeAgent.role}
                      {activeAgent.model && (
                        <span className={`text-[9px] font-mono ${getModelBadgeColor(activeAgent.model)}`}>
                          [{activeAgent.model}]
                        </span>
                      )}
                    </div>
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
                {taskCounts[activeAgent.id] > 0 && (
                  <span className="px-2 py-[2px] rounded-full text-[8px] font-bold font-mono border border-cyan-custom/30 bg-cyan-custom/10 text-cyan-custom">
                    {taskCounts[activeAgent.id]} TASK{taskCounts[activeAgent.id] > 1 ? 'S' : ''}
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
                  </div>
                  <div className="text-txt2 text-[11px] leading-relaxed mb-4">
                    Agent {activeAgent.name} is currently {activeAgent.status}.
                    Last seen {activeAgent.seen}.
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingAgent(activeAgent); setIsEditModalOpen(true); }}
                      className="flex-1 px-3 py-1.5 text-[10px] font-mono bg-bg3 border border-border-custom rounded hover:border-cyan-custom/30 transition-colors"
                    >
                      ✏️ EDIT
                    </button>
                    <button
                      onClick={() => handleDeleteAgent(activeAgent.id)}
                      className="px-3 py-1.5 text-[10px] font-mono bg-bg3 border border-red-custom/30 text-red-custom rounded hover:bg-red-custom/10 transition-colors"
                    >
                      🗑️ DELETE
                    </button>
                  </div>
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
                  {filteredDrawerLogs.length > 0 ? filteredDrawerLogs.map((log, i) => (
                    <div key={i} className="mb-1">
                      <span className="text-txt3">[{log[0]}]</span> <span className="text-cyan-custom font-semibold mr-2">{log[2]}</span> <span className="text-txt">{log[3]}</span>
                    </div>
                  )) : (
                    <div className="text-txt3 italic">// No recent logs for this agent</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ADD AGENT MODAL */}
      {isAddModalOpen && (
        <Suspense fallback={<ComponentLoader />}>
          <AddAgentModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAgentAdded={() => setIsAddModalOpen(false)} />
        </Suspense>
      )}

      {/* EDIT AGENT MODAL */}
      {isEditModalOpen && editingAgent && (
        <Suspense fallback={<ComponentLoader />}>
          <EditAgentModal isOpen={isEditModalOpen} agent={editingAgent} agents={agents} onClose={() => { setIsEditModalOpen(false); setEditingAgent(null); }} onAgentUpdated={() => { setIsEditModalOpen(false); setEditingAgent(null); }} />
        </Suspense>
      )}

      {/* TASK DISPATCH MODAL */}
      {isTaskModalOpen && selectedAgentId && (
        <Suspense fallback={<ComponentLoader />}>
          <TaskDispatchModal isOpen={isTaskModalOpen} agents={agents} preSelectedAgentId={selectedAgentId} onClose={() => setIsTaskModalOpen(false)} />
        </Suspense>
      )}

      {/* SHORTCUTS HELP */}
      {isShortcutsHelpOpen && (
        <Suspense fallback={null}>
          <ShortcutsHelp isOpen={isShortcutsHelpOpen} onClose={() => setIsShortcutsHelpOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <AppLayout>
      <DashboardContent />
    </AppLayout>
  );
}
