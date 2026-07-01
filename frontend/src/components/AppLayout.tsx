'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import NavBar from '@/components/NavBar';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSSE } from '@/hooks/useSSE';
import { Agent, LogEntry, TaskLog } from '@/types';
import { ProtectedRoute, useAuth } from '@/contexts/AuthContext';
import { API_BASE, WS_BASE, getAuthHeaders } from '@/utils/api';
import NotificationBell from '@/components/NotificationBell';
import { usePathname } from 'next/navigation';

// ─── Dashboard Context ────────────────────────────────────────────

interface DashboardContextType {
  agents: Agent[];
  logs: LogEntry[];
  systemOnline: boolean;
  stats: { active_nodes: number; running: number; sleeping: number; offline: number };
  taskCounts: Record<string, number>;
  lastStoppedTask: any;
  stoppingAgentIds: Set<string>;
  markAgentStopping: (id: string) => void;
  lastModelUpdate: any;
  lastNotification: any;
  lastNewLog: TaskLog | null;
  lastAgentMessage: any;
  globalLogs: TaskLog[];
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within AppLayout');
  return ctx;
}

// ─── Component Loader ─────────────────────────────────────────────

function ComponentLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
    </div>
  );
}

// ─── AppLayout Component ──────────────────────────────────────────

interface AppLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();

  const { agents, logs, systemOnline, stats, taskCounts, lastStoppedTask, stoppingAgentIds, markAgentStopping, lastModelUpdate, lastNotification, lastNewLog, lastAgentMessage } = useWebSocket(WS_BASE, {
    channels: ['agents', 'tasks', 'metrics', 'logs', 'notifications', 'system', 'messages'],
    enabled: isAuthenticated,
  });

  // CDC real-time updates via SSE
  const { connected: cdcConnected, lastEvent: cdcEvent } = useSSE({
    enabled: isAuthenticated,
    onTableChange: () => {},
  });

  const [globalLogs, setGlobalLogs] = useState<TaskLog[]>([]);
  const [globalLogsLoaded, setGlobalLogsLoaded] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean; color: string }>({ message: '', visible: false, color: 'red' });
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Show toast when a model is updated
  useEffect(() => {
    if (lastModelUpdate) {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      const agentName = agents.find(a => a.id === lastModelUpdate.agent_id)?.name || lastModelUpdate.agent_id;
      setToast({ message: `🔄 ${agentName} model changed → ${lastModelUpdate.model}`, visible: true, color: 'blue' });
      toastTimeoutRef.current = setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
    }
  }, [lastModelUpdate, agents]);

  // Show toast when a task is stopped
  useEffect(() => {
    if (lastStoppedTask) {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      setToast({ message: `⛔ Task stopped: "${lastStoppedTask.title}"`, visible: true, color: 'amber' });
      toastTimeoutRef.current = setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
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
      toastTimeoutRef.current = setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
    }
  }, [lastNotification]);

  // Append new logs from WebSocket
  useEffect(() => {
    if (lastNewLog) {
      setGlobalLogs(prev => [lastNewLog, ...prev].slice(0, 500));
    }
  }, [lastNewLog]);

  const contextValue: DashboardContextType = {
    agents,
    logs,
    systemOnline,
    stats,
    taskCounts,
    lastStoppedTask,
    stoppingAgentIds,
    markAgentStopping,
    lastModelUpdate,
    lastNotification,
    lastNewLog,
    lastAgentMessage,
    globalLogs,
  };

  return (
    <ProtectedRoute>
      <DashboardContext.Provider value={contextValue}>
        <div className="shell dotgrid flex flex-col h-screen overflow-hidden bg-bg text-txt font-sans selection:bg-cyan-custom/30">
          <NavBar
            systemStatus={systemOnline ? 'ONLINE' : 'OFFLINE'}
            activeCount={`${stats.active_nodes} / ${agents.length} active`}
          >
            <NotificationBell newNotification={lastNotification} />
          </NavBar>

          <main className="content flex-1 relative overflow-hidden">
            {children}
          </main>

          {/* TOAST */}
          {toast.visible && (
            <div className="fixed bottom-6 right-6 z-50 animate-fadein">
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
      </DashboardContext.Provider>
    </ProtectedRoute>
  );
}
