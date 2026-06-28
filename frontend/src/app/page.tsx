'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import NavBar from '@/components/NavBar';
import Sidebar from '@/components/Sidebar';
import AgentCard from '@/components/AgentCard';
import NotificationBell from '@/components/NotificationBell';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Agent, LogEntry, TaskLog } from '@/types';
import { ProtectedRoute } from '@/contexts/AuthContext';
import { ExportButton, exportTaskHistory, exportAnalytics } from '@/utils/exportUtils';
import { API_BASE, WS_BASE } from '@/utils/api';

// Dynamic imports for heavy components (code splitting)
const NodeGraph = lazy(() => import('@/components/NodeGraph'));
const Console = lazy(() => import('@/components/Console'));
const MemoryView = lazy(() => import('@/components/MemoryView'));
const AnalyticsView = lazy(() => import('@/components/AnalyticsView'));
const CostDashboard = lazy(() => import('@/components/CostDashboard'));
const AddAgentModal = lazy(() => import('@/components/AddAgentModal'));
const EditAgentModal = lazy(() => import('@/components/EditAgentModal'));
const TemplateManager = lazy(() => import('@/components/TemplateManager'));
const TaskDispatchModal = lazy(() => import('@/components/TaskDispatchModal'));
const TaskHistory = lazy(() => import('@/components/TaskHistory'));
const TaskLogs = lazy(() => import('@/components/TaskLogs'));
const MessageCenter = lazy(() => import('@/components/MessageCenter'));
const WorkflowBuilder = lazy(() => import('@/components/WorkflowBuilder'));
const Marketplace = lazy(() => import('@/components/Marketplace'));
const PluginManager = lazy(() => import('@/components/PluginManager'));
const CommandPalette = lazy(() => import('@/components/CommandPalette'));
const ShortcutsHelp = lazy(() => import('@/components/ShortcutsHelp'));

// Loading fallback for lazy components
const ComponentLoader = () => (
  <div className="flex items-center justify-center h-full">
    <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
  </div>
);

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
  const [pluginsTab, setPluginsTab] = useState<'marketplace' | 'installed'>('marketplace');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);

  const { agents, logs, systemOnline, stats, taskCounts, lastStoppedTask, stoppingAgentIds, markAgentStopping, lastModelUpdate, lastNotification, lastNewLog, lastAgentMessage } = useWebSocket(WS_BASE, {
    channels: ['agents', 'tasks', 'metrics', 'logs', 'notifications', 'system', 'messages'],
  });
  const [globalLogs, setGlobalLogs] = useState<TaskLog[]>([]);
  const [globalLogsLoaded, setGlobalLogsLoaded] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean; color: string }>({ message: '', visible: false, color: 'red' });
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [newNotificationProp, setNewNotificationProp] = useState<any>(null);

  // Memoized model badge color helper
  const getModelBadgeColor = useCallback((model?: string) => {
    if (!model) return 'text-txt3';
    if (model.includes('claude')) return 'text-purple-400';
    if (model.includes('gpt')) return 'text-green-400';
    if (model.includes('kimi')) return 'text-blue-400';
    return 'text-txt3';
  }, []);

  // Show toast when a model is updated
  useEffect(() => {
    if (lastModelUpdate) {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      const agentName = agents.find(a => a.id === lastModelUpdate.agent_id)?.name || lastModelUpdate.agent_id;
      setToast({ message: `🔄 ${agentName} model changed → ${lastModelUpdate.model}`, visible: true, color: 'blue' });
      toastTimeoutRef.current = setTimeout(() => {
        setToast(prev => ({ ...prev, visible: false }));
      }, 3000);
    }
  }, [lastModelUpdate, agents]);

  // Show toast when a task is stopped
  useEffect(() => {
    if (lastStoppedTask) {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      setToast({ message: `⛔ Task stopped: "${lastStoppedTask.title}"`, visible: true, color: 'amber' });
      toastTimeoutRef.current = setTimeout(() => {
        setToast(prev => ({ ...prev, visible: false }));
      }, 4000);
    }
  }, [lastStoppedTask]);

  // Show toast for new notifications
  useEffect(() => {
    if (lastNotification) {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      const colors: Record<string, string> = {
        task_completed: 'green',
        task_failed: 'red',
        task_stopped: 'amber',
        agent_registered: 'blue',
        cost_alert: 'amber',
      };
      setToast({
        message: `${lastNotification.type === 'task_completed' ? '✅' : lastNotification.type === 'task_failed' ? '❌' : lastNotification.type === 'task_stopped' ? '⛔' : lastNotification.type === 'agent_registered' ? '🆕' : '💰'} ${lastNotification.title}`,
        visible: true,
        color: colors[lastNotification.type] || 'blue',
      });
      toastTimeoutRef.current = setTimeout(() => {
        setToast(prev => ({ ...prev, visible: false }));
      }, 4000);
    }
  }, [lastNotification]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onCommandPalette: () => setIsCommandPaletteOpen(true),
    onNewAgent: () => setIsAddModalOpen(true),
    onNewTask: () => {
      if (selectedAgentId) {
        setIsTaskModalOpen(true);
      }
    },
    onShortcutsHelp: () => setIsShortcutsHelpOpen(true),
  });

  // Fetch global logs on first visit to logs tab
  useEffect(() => {
    if (activeL2 === 'logs' && !globalLogsLoaded) {
      fetch(`${API_BASE}/logs?limit=200`)
        .then(res => res.json())
        .then(data => {
          setGlobalLogs(data.logs || []);
          setGlobalLogsLoaded(true);
        })
        .catch(() => {});
    }
  }, [activeL2, globalLogsLoaded]);

  // Append new logs from WebSocket
  useEffect(() => {
    if (lastNewLog) {
      setGlobalLogs(prev => [lastNewLog, ...prev].slice(0, 500));
    }
  }, [lastNewLog]);

  const handleOpenDrawer = useCallback((id: string) => {
    setSelectedAgentId(id);
    setIsDrawerOpen(true);
    setDrawerTab('overview');
  }, []);

  const handleDeleteAgent = useCallback(async (id: string) => {
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/agents/${id}`, { method: 'DELETE' });
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
  }, [selectedAgentId, taskTitle, taskPriority]);

  const handleStopTask = useCallback(async (taskId: string) => {
    if (!confirm('Stop this task? This will immediately halt execution.')) return;
    const agentId = selectedAgentId;
    if (agentId) markAgentStopping(agentId);
    try {
      await fetch(`${API_BASE}/tasks/${taskId}/stop`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to stop task:', err);
    }
  }, [selectedAgentId, markAgentStopping]);

  const activeAgent = useMemo(() => agents.find(a => a.id === selectedAgentId), [agents, selectedAgentId]);

  const filteredDrawerLogs = useMemo(() => {
    if (!activeAgent) return [];
    return logs.filter(l => l[1] === activeAgent.name);
  }, [logs, activeAgent]);

  return (
    <ProtectedRoute>
      <div className="shell dotgrid flex flex-col h-screen overflow-hidden bg-bg text-txt font-sans selection:bg-cyan-custom/30">
        
        <NavBar 
          activeL1={activeL1} 
          setActiveL1={setActiveL1} 
          systemStatus={systemOnline ? 'ONLINE' : 'OFFLINE'}
          activeCount={`${stats.active_nodes} / ${agents.length} active`}
        >
          <NotificationBell newNotification={lastNotification} />
        </NavBar>

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

          {activeL1 === 'overview' && activeL2 === 'graph' && (
            <Suspense fallback={<ComponentLoader />}>
              <NodeGraph agents={agents} onAgentClick={handleOpenDrawer} />
            </Suspense>
          )}

          {activeL1 === 'overview' && activeL2 === 'console' && (
            <Suspense fallback={<ComponentLoader />}>
              <Console logs={logs} agents={agents} />
            </Suspense>
          )}

          {activeL1 === 'overview' && activeL2 === 'tasks' && (
            <Suspense fallback={<ComponentLoader />}>
              <TaskHistory agents={agents} />
            </Suspense>
          )}

          {activeL1 === 'overview' && activeL2 === 'logs' && (
            <Suspense fallback={<ComponentLoader />}>
              <TaskLogs logs={globalLogs} />
            </Suspense>
          )}

          {activeL1 === 'memory' && (
            <Suspense fallback={<ComponentLoader />}>
              <MemoryView agents={agents} />
            </Suspense>
          )}

          {activeL1 === 'analytics-main' && (
            <Suspense fallback={<ComponentLoader />}>
              <div className="h-full overflow-y-auto">
                <div className="flex justify-end p-4">
                </div>
                <AnalyticsView />
              </div>
            </Suspense>
          )}

          {activeL1 === 'costs' && (
            <Suspense fallback={<ComponentLoader />}>
              <CostDashboard />
            </Suspense>
          )}

          {activeL1 === 'messages' && (
            <Suspense fallback={<ComponentLoader />}>
              <MessageCenter agents={agents} />
            </Suspense>
          )}

          {activeL1 === 'workflows' && (
            <Suspense fallback={<ComponentLoader />}>
              <WorkflowBuilder />
            </Suspense>
          )}

          {activeL1 === 'templates' && (
            <Suspense fallback={<ComponentLoader />}>
              <TemplateManager agents={agents} onClose={() => setActiveL1("overview")} />
            </Suspense>
          )}

          {activeL1 === 'plugins' && (
            <Suspense fallback={<ComponentLoader />}>
              <div className="h-full flex flex-col">
                <div className="flex gap-2 p-4 border-b border-border-custom">
                  <button
                    onClick={() => setPluginsTab('marketplace')}
                    className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${pluginsTab === 'marketplace' ? 'bg-cyan-custom/20 text-cyan-custom border border-cyan-custom/40' : 'text-txt2 hover:text-txt border border-border-custom'}`}
                  >
                    Marketplace
                  </button>
                  <button
                    onClick={() => setPluginsTab('installed')}
                    className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${pluginsTab === 'installed' ? 'bg-cyan-custom/20 text-cyan-custom border border-cyan-custom/40' : 'text-txt2 hover:text-txt border border-border-custom'}`}
                  >
                    Installed
                  </button>
                </div>
                {pluginsTab === 'marketplace' ? <Marketplace /> : <PluginManager />}
              </div>
            </Suspense>
          )}

        </main>

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
                         onClick={() => {
                           setEditingAgent(activeAgent);
                           setIsEditModalOpen(true);
                         }}
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
            <AddAgentModal 
              isOpen={isAddModalOpen}
              onClose={() => setIsAddModalOpen(false)}
              onAgentAdded={() => {
                setIsAddModalOpen(false);
              }}
            />
          </Suspense>
        )}

        {/* EDIT AGENT MODAL */}
        {isEditModalOpen && editingAgent && (
          <Suspense fallback={<ComponentLoader />}>
            <EditAgentModal 
              isOpen={isEditModalOpen}
              agent={editingAgent}
              agents={agents}
              onClose={() => {
                setIsEditModalOpen(false);
                setEditingAgent(null);
              }}
              onAgentUpdated={() => {
                setIsEditModalOpen(false);
                setEditingAgent(null);
              }}
            />
          </Suspense>
        )}

        {/* TASK DISPATCH MODAL */}
        {isTaskModalOpen && selectedAgentId && (
          <Suspense fallback={<ComponentLoader />}>
            <TaskDispatchModal
              isOpen={isTaskModalOpen}
              agents={agents}
              preSelectedAgentId={selectedAgentId}
              onClose={() => setIsTaskModalOpen(false)}
            />
          </Suspense>
        )}

        {/* COMMAND PALETTE */}
        {isCommandPaletteOpen && (
          <Suspense fallback={null}>
          </Suspense>
        )}

        {/* SHORTCUTS HELP */}
        {isShortcutsHelpOpen && (
          <Suspense fallback={null}>
            <ShortcutsHelp
              isOpen={isShortcutsHelpOpen}
              onClose={() => setIsShortcutsHelpOpen(false)}
            />
          </Suspense>
        )}

        {/* TOAST */}
        {toast.visible && (
          <div className={`fixed bottom-6 right-6 z-50 animate-fadein`}>
            <div className={`px-4 py-2.5 rounded-lg shadow-lg border font-mono text-[11px] ${
              toast.color === 'green' ? 'bg-green-900/90 border-green-500/40 text-green-300' :
              toast.color === 'red' ? 'bg-red-900/90 border-red-500/40 text-red-300' :
              toast.color === 'amber' ? 'bg-amber-900/90 border-amber-500/40 text-amber-300' :
              'bg-blue-900/90 border-blue-500/40 text-blue-300'
            }`}>
              {toast.message}
            </div>
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}
