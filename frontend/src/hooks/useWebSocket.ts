import { API_BASE, getAuthHeaders } from '../utils/api';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useDebouncedCallback } from './useDebounce';
import { apiCache } from '../utils/apiCache';
import { Agent, FeedItem, LogEntry, TaskCounts, TaskLog } from '../types';

export interface StoppedTaskEvent {
  id: string;
  agent_id: string;
  title: string;
}

// Channel types matching backend
type Channel = 'agents' | 'tasks' | 'metrics' | 'logs' | 'notifications' | 'system' | 'messages';

interface UseWebSocketOptions {
  channels?: Channel[];
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  messageBufferMax?: number;
  /** When false, the hook skips connecting and fetching until it becomes true. */
  enabled?: boolean;
}

export const useWebSocket = (
  url: string,
  options: UseWebSocketOptions = {},
) => {
  const {
    channels = ['agents', 'tasks', 'metrics', 'logs', 'notifications', 'system', 'messages'],
    reconnectBaseMs = 1000,
    reconnectMaxMs = 30000,
    messageBufferMax = 200,
    enabled = true,
  } = options;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [systemOnline, setSystemOnline] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [stats, setStats] = useState({ active_nodes: 0, running: 0, sleeping: 0, offline: 0 });
  const [taskCounts, setTaskCounts] = useState<TaskCounts>({})
  const [lastTaskUpdate, setLastTaskUpdate] = useState<any>(null);
  const [lastStoppedTask, setLastStoppedTask] = useState<StoppedTaskEvent | null>(null);
  const [stoppingAgentIds, setStoppingAgentIds] = useState<Set<string>>(new Set());
  const [lastModelUpdate, setLastModelUpdate] = useState<{ agent_id: string; model: string } | null>(null);
  const [lastNotification, setLastNotification] = useState<any>(null);
  const [lastNewLog, setLastNewLog] = useState<TaskLog | null>(null);
  const [lastAgentMessage, setLastAgentMessage] = useState<any>(null);
  
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  // ── Message buffer for reconnects ──────────────────────────
  const messageBufferRef = useRef<any[]>([]);
  const bufferMessage = useCallback((msg: any) => {
    const buf = messageBufferRef.current;
    if (buf.length >= messageBufferMax) buf.shift();
    buf.push(msg);
  }, [messageBufferMax]);

  // ── Flush buffered messages after reconnect ────────────────
  const flushBuffer = useCallback(() => {
    const buf = messageBufferRef.current.splice(0);
    for (const msg of buf) {
      handleMessage(msg);
    }
  }, []);

  // ── Process a single message ───────────────────────────────
  const handleMessage = useCallback((data: any) => {
    if (data.type === 'batch' && Array.isArray(data.messages)) {
      for (const msg of data.messages) handleMessage(msg);
      return;
    }

    if (data.type === 'heartbeat') {
      setStats({
        active_nodes: data.active_nodes,
        running: data.running,
        sleeping: data.sleeping || 0,
        offline: data.offline || 0
      });
    } else if (data.type === 'fleet_update') {
      setAgents(data.agents);
    } else if (data.type === 'log') {
      setLogs(prev => [data.data, ...prev].slice(0, 100));
    } else if (data.type === 'task_counts') {
      setTaskCounts(data.counts || {});
    } else if (data.type === 'task_update') {
      setLastTaskUpdate(data.task);
      fetchTaskCounts();
    } else if (data.type === 'model_update') {
      setLastModelUpdate({ agent_id: data.agent_id, model: data.model });
    } else if (data.type === 'task_stopped') {
      const stoppedTask = data.task;
      setLastStoppedTask({
        id: stoppedTask.id,
        agent_id: stoppedTask.agent_id,
        title: stoppedTask.title,
      });
      setStoppingAgentIds(prev => {
        const next = new Set(prev);
        next.delete(stoppedTask.agent_id);
        return next;
      });
    } else if (data.type === 'new_notification') {
      setLastNotification(data.notification);
    } else if (data.type === 'new_log') {
      setLastNewLog(data.log);
    } else if (data.type === 'agent_message') {
      setLastAgentMessage(data.message);
    } else if (data.type === 'ping') {
      // Reply with pong for heartbeat
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'pong' }));
      }
    }
  }, []);

  useEffect(() => {
    let unmounted = false;

    // Don't connect if not enabled (e.g. user not authenticated)
    if (!enabled) {
      setSystemOnline(false);
      setConnectionStatus('disconnected');
      return;
    }

    const connect = () => {
      if (unmounted) return;
      setConnectionStatus('connecting');
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('Connected to Mission Control WebSocket');
        setSystemOnline(true);
        setConnectionStatus('connected');
        reconnectAttemptRef.current = 0;

        // Subscribe to channels
        socket.send(JSON.stringify({
          type: 'subscribe',
          channels: channelsRef.current,
        }));

        // Flush any buffered messages from brief disconnects
        flushBuffer();
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (e) {
          // ignore parse errors
        }
      };

      socket.onclose = () => {
        if (unmounted) return;
        setSystemOnline(false);
        setConnectionStatus('disconnected');
        // Exponential backoff reconnect
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(reconnectBaseMs * Math.pow(2, attempt), reconnectMaxMs);
        reconnectAttemptRef.current = attempt + 1;
        console.log(`WebSocket disconnected. Reconnecting in ${delay}ms (attempt ${attempt + 1})`);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      socket.onerror = (err) => {
        console.error('WebSocket Error:', err);
        socket.close();
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [url, enabled, reconnectBaseMs, reconnectMaxMs, handleMessage, flushBuffer]);

  const fetchTaskCounts = useDebouncedCallback(async () => {
    try {
      // Don't fetch if not enabled (user not authenticated)
      if (typeof window !== 'undefined' && !localStorage.getItem('access_token')) {
        return;
      }
      const cached = apiCache.get<TaskCounts>('GET:' + API_BASE + '/tasks/counts');
      if (cached) {
        setTaskCounts(cached);
        return;
      }
      const res = await fetch(API_BASE + '/tasks/counts', { headers: getAuthHeaders('') });
      if (res.ok) {
        const counts = await res.json();
        setTaskCounts(counts);
        apiCache.set('GET:' + API_BASE + '/tasks/counts', counts, 5000);
      }
    } catch (err) {
      // Silently fail
    }
  }, 300);

  // Fetch task counts on mount (only when enabled)
  useEffect(() => {
    if (enabled) {
      fetchTaskCounts();
    }
  }, [enabled]);

  const markAgentStopping = (agentId: string) => {
    setStoppingAgentIds(prev => new Set(prev).add(agentId));
  };

  return { agents, logs, systemOnline, connectionStatus, stats, taskCounts, lastTaskUpdate, lastStoppedTask, stoppingAgentIds, markAgentStopping, lastModelUpdate, lastNotification, lastNewLog, lastAgentMessage };
};
