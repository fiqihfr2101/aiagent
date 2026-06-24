'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DispatchTask, TaskHistoryResponse, TaskStatus, Agent, TaskLog } from '@/types';
import TaskLogs from './TaskLogs';

interface TaskHistoryProps {
  agents: Agent[];
}

const statusColors: Record<TaskStatus, { bg: string; text: string; border: string }> = {
  QUEUED: { bg: 'bg-blue-custom/10', text: 'text-blue-custom', border: 'border-blue-custom/30' },
  RUNNING: { bg: 'bg-cyan-custom/10', text: 'text-cyan-custom', border: 'border-cyan-custom/30' },
  COMPLETED: { bg: 'bg-grn-custom/10', text: 'text-grn-custom', border: 'border-grn-custom/30' },
  FAILED: { bg: 'bg-red-custom/10', text: 'text-red-custom', border: 'border-red-custom/30' },
  STOPPED: { bg: 'bg-red-custom/10', text: 'text-red-custom', border: 'border-red-custom/30' },
};

const priorityColors: Record<string, string> = {
  P1: 'text-red-custom',
  P2: 'text-amb-custom',
  P3: 'text-grn-custom',
};

const TaskHistory: React.FC<TaskHistoryProps> = ({ agents }) => {
  const [tasks, setTasks] = useState<DispatchTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterAgent, setFilterAgent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<Record<string, TaskLog[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('page_size', '10');
      if (filterAgent) params.set('agent_id', filterAgent);
      if (filterStatus) params.set('status', filterStatus);

      const res = await fetch(`http://localhost:8000/tasks/history?${params}`);
      if (res.ok) {
        const data: TaskHistoryResponse = await res.json();
        setTasks(data.tasks);
        setTotal(data.total);
        setTotalPages(data.total_pages);
      }
    } catch (err) {
      console.error('Failed to fetch task history:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filterAgent, filterStatus]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filterAgent, filterStatus]);

  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? agent.name : agentId;
  };

  const formatDuration = (seconds?: number | null) => {
    if (seconds == null) return '—';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  };

  const formatTokens = (tokens: number) => {
    if (tokens === 0) return '—';
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return tokens.toString();
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const toggleExpand = async (taskId: string) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }
    setExpandedTaskId(taskId);
    if (!taskLogs[taskId]) {
      setLoadingLogs(taskId);
      try {
        const res = await fetch(`http://localhost:8000/tasks/${taskId}/logs`);
        if (res.ok) {
          const data = await res.json();
          setTaskLogs((prev) => ({ ...prev, [taskId]: data }));
        }
      } catch (err) {
        console.error('Failed to fetch task logs:', err);
      } finally {
        setLoadingLogs(null);
      }
    }
  };

  const handleStopTask = async (taskId: string, taskTitle: string) => {
    if (!confirm(`Stop task "${taskTitle}"?\n\nThis will immediately halt execution.`)) return;
    setStoppingTaskId(taskId);
    try {
      const res = await fetch(`http://localhost:8000/tasks/${taskId}/stop`, { method: 'POST' });
      if (res.ok) {
        fetchHistory();
      }
    } catch (err) {
      console.error('Failed to stop task:', err);
    } finally {
      setStoppingTaskId(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-[16px_24px_16px] border-b border-border-custom">
        <div className="text-[9px] text-txt3 tracking-[0.18em] uppercase mb-3 flex items-center gap-2">
          Task History
          <div className="flex-1 h-px bg-border-custom"></div>
          <span className="text-[10px] text-txt2 font-mono">{total} tasks</span>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="bg-bg3 border border-border-custom rounded-lg px-2.5 py-1.5 text-[10px] text-txt font-mono focus:border-cyan-custom/50 focus:outline-none"
          >
            <option value="">All Agents</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-bg3 border border-border-custom rounded-lg px-2.5 py-1.5 text-[10px] text-txt font-mono focus:border-cyan-custom/50 focus:outline-none"
          >
            <option value="">All Status</option>
            <option value="QUEUED">Queued</option>
            <option value="RUNNING">Running</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="STOPPED">Stopped</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-[11px] text-txt3 font-mono">// No tasks found</div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-custom text-[8px] text-txt3 uppercase tracking-[0.14em]">
                <th className="text-left px-4 py-2 font-medium">Title</th>
                <th className="text-left px-4 py-2 font-medium">Agent</th>
                <th className="text-left px-4 py-2 font-medium">Priority</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Duration</th>
                <th className="text-right px-4 py-2 font-medium">Tokens</th>
                <th className="text-left px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium"></th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const sc = statusColors[task.status] || statusColors.QUEUED;
                const isExpanded = expandedTaskId === task.id;
                return (
                  <React.Fragment key={task.id}>
                    <tr className={`border-b border-border-custom/50 hover:bg-white/[0.02] transition-colors ${isExpanded ? 'bg-white/[0.02]' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="text-[11px] text-txt font-medium max-w-[200px] truncate">{task.title}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] text-txt2 font-mono">{getAgentName(task.agent_id)}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-mono font-bold ${priorityColors[task.priority] || 'text-txt3'}`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[8px] font-bold font-mono border ${sc.bg} ${sc.text} ${sc.border}`}>
                          {(task.status === 'RUNNING') && (
                            <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
                          )}
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-[10px] text-txt2 font-mono">{formatDuration(task.duration)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-[10px] text-txt2 font-mono">{formatTokens(task.tokens_used)}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[9px] text-txt3 font-mono">{formatDate(task.created_at)}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => toggleExpand(task.id)}
                          className="text-[9px] font-mono text-txt3 hover:text-cyan-custom transition-colors px-1"
                          title="View execution logs"
                        >
                          {isExpanded ? '▼' : '▶'} LOGS
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        {(task.status === 'QUEUED' || task.status === 'RUNNING') && (
                          <button
                            onClick={() => handleStopTask(task.id, task.title)}
                            disabled={stoppingTaskId === task.id}
                            className={`text-[8px] font-mono border px-2 py-[2px] rounded transition-colors ${
                              stoppingTaskId === task.id
                                ? 'text-amb-custom border-amb-custom/50 animate-pulse cursor-wait'
                                : 'text-red-custom/70 hover:text-red-custom border-red-custom/30 hover:border-red-custom/50'
                            }`}
                            title="Stop task"
                          >
                            {stoppingTaskId === task.id ? 'STOPPING...' : 'STOP'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} className="px-4 py-3 bg-bg3/30">
                          {loadingLogs === task.id ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="w-4 h-4 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
                            </div>
                          ) : taskLogs[task.id] && taskLogs[task.id].length > 0 ? (
                            <TaskLogs
                              logs={taskLogs[task.id]}
                              maxHeight="max-h-48"
                              showSearch={false}
                              showLevelFilter={false}
                              compact
                            />
                          ) : (
                            <div className="text-[10px] text-txt3 italic text-center py-2">// No execution logs for this task</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-t border-border-custom">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className={`text-[10px] font-mono px-3 py-1 rounded border transition-colors ${
              page <= 1
                ? 'border-border-custom text-txt3 cursor-not-allowed'
                : 'border-border-custom text-txt2 hover:border-cyan-custom/50 hover:text-cyan-custom'
            }`}
          >
            ← PREV
          </button>
          <span className="text-[10px] text-txt3 font-mono">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className={`text-[10px] font-mono px-3 py-1 rounded border transition-colors ${
              page >= totalPages
                ? 'border-border-custom text-txt3 cursor-not-allowed'
                : 'border-border-custom text-txt2 hover:border-cyan-custom/50 hover:text-cyan-custom'
            }`}
          >
            NEXT →
          </button>
        </div>
      )}
    </div>
  );
};

export default TaskHistory;
