'use client';

import React, { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TaskLog } from '@/types';

interface TaskLogsProps {
  taskId?: string;
  logs?: TaskLog[];
  maxHeight?: string;
  showSearch?: boolean;
  showCopy?: boolean;
  showLevelFilter?: boolean;
  autoScroll?: boolean;
  compact?: boolean;
}

const levelColors: Record<string, { bg: string; text: string; border: string }> = {
  INFO: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  WARNING: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  ERROR: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  DEBUG: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30' },
};

const levelIcons: Record<string, string> = {
  INFO: 'ℹ',
  WARNING: '⚠',
  ERROR: '✕',
  DEBUG: '⚙',
};

const formatTimestamp = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const TaskLogs: React.FC<TaskLogsProps> = memo(({
  taskId,
  logs: externalLogs,
  maxHeight = 'max-h-80',
  showSearch = true,
  showCopy = true,
  showLevelFilter = true,
  autoScroll = true,
  compact = false,
}) => {
  const [logs, setLogs] = useState<TaskLog[]>(externalLogs || []);
  const [filterLevel, setFilterLevel] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch logs when taskId changes
  const fetchLogs = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tasks/${taskId}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch task logs:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId) {
      fetchLogs();
    }
  }, [taskId, fetchLogs]);

  // Update when external logs change
  useEffect(() => {
    if (externalLogs) {
      setLogs(externalLogs);
    }
  }, [externalLogs]);

  // Auto-scroll on new logs
  useEffect(() => {
    if (autoScroll && !isPaused && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, isPaused]);

  // Filter logs with useMemo
  const filteredLogs = useMemo(() => logs.filter((log) => {
    if (filterLevel && log.level !== filterLevel) return false;
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }), [logs, filterLevel, searchQuery]);

  // Copy all visible logs to clipboard
  const handleCopy = useCallback(() => {
    const text = filteredLogs
      .map((log) => `[${log.timestamp}] [${log.level}] ${log.message}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [filteredLogs]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-2 mb-2 flex-wrap">
        {showLevelFilter && (
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="bg-bg3 border border-border-custom rounded px-2 py-1 text-[10px] text-txt font-mono focus:border-cyan-custom/50 focus:outline-none"
          >
            <option value="">All Levels</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
            <option value="DEBUG">DEBUG</option>
          </select>
        )}
        {showSearch && (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="bg-bg3 border border-border-custom rounded px-2 py-1 text-[10px] text-txt font-mono flex-1 min-w-[100px] focus:border-cyan-custom/50 focus:outline-none placeholder:text-txt3"
          />
        )}
        <button
          onClick={() => setIsPaused(!isPaused)}
          className={`px-2 py-1 rounded text-[9px] font-mono font-bold border transition-colors ${
            isPaused
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-bg3 border-border-custom text-txt3 hover:text-txt2'
          }`}
        >
          {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
        </button>
        {showCopy && (
          <button
            onClick={handleCopy}
            className="px-2 py-1 rounded text-[9px] font-mono font-bold border bg-bg3 border-border-custom text-txt3 hover:text-txt2 transition-colors"
          >
            {copied ? '✓ COPIED' : '📋 COPY'}
          </button>
        )}
        <span className="text-[9px] text-txt3 font-mono">{filteredLogs.length} entries</span>
      </div>

      {/* Log viewer */}
      <div
        ref={containerRef}
        className={`flex-1 ${maxHeight} overflow-y-auto bg-bg5 border border-border-custom rounded-lg ${compact ? 'p-2' : 'p-3'} font-mono`}
      >
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <div className="w-5 h-5 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-[10px] text-txt3 italic text-center py-4">// No log entries</div>
        ) : (
          filteredLogs.map((log) => {
            const lc = levelColors[log.level] || levelColors.INFO;
            return (
              <div
                key={log.id}
                className={`flex items-start gap-2 ${compact ? 'py-0.5' : 'py-1'} border-b border-border-custom/30 last:border-0 hover:bg-white/[0.015] transition-colors`}
              >
                <span className="text-[8px] text-txt3 font-mono whitespace-nowrap mt-px min-w-[65px]">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded text-[7px] font-bold font-mono border ${lc.bg} ${lc.text} ${lc.border} whitespace-nowrap`}
                >
                  {levelIcons[log.level]} {log.level}
                </span>
                <span className="text-[10px] text-txt leading-relaxed break-all">{log.message}</span>
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
});

TaskLogs.displayName = 'TaskLogs';

export default TaskLogs;
