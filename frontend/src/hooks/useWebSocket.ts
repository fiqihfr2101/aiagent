
import { useEffect, useRef, useState } from 'react';
import { Agent, FeedItem, LogEntry, TaskCounts } from '../types';

export interface StoppedTaskEvent {
  id: string;
  agent_id: string;
  title: string;
}

export const useWebSocket = (url: string) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [systemOnline, setSystemOnline] = useState(false);
  const [stats, setStats] = useState({ active_nodes: 0, running: 0, sleeping: 0, offline: 0 });
  const [taskCounts, setTaskCounts] = useState<TaskCounts>({})
  const [lastTaskUpdate, setLastTaskUpdate] = useState<any>(null);
  const [lastStoppedTask, setLastStoppedTask] = useState<StoppedTaskEvent | null>(null);
  const [stoppingAgentIds, setStoppingAgentIds] = useState<Set<string>>(new Set());
  const [lastModelUpdate, setLastModelUpdate] = useState<{ agent_id: string; model: string } | null>(null);
  const [lastNotification, setLastNotification] = useState<any>(null);
  
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('Connected to Mission Control WebSocket');
        setSystemOnline(true);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
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
          // Refresh task counts on task update
          fetchTaskCounts();
        } else if (data.type === 'model_update') {
          // Model changed — fleet_update will follow, but set state for immediate feedback
          setLastModelUpdate({ agent_id: data.agent_id, model: data.model });
        } else if (data.type === 'task_stopped') {
          const stoppedTask = data.task;
          setLastStoppedTask({
            id: stoppedTask.id,
            agent_id: stoppedTask.agent_id,
            title: stoppedTask.title,
          });
          // Clear stopping state for this agent after a brief delay
          setStoppingAgentIds(prev => {
            const next = new Set(prev);
            next.delete(stoppedTask.agent_id);
            return next;
          });
        } else if (data.type === 'new_notification') {
          setLastNotification(data.notification);
        }
      };

      socket.onclose = () => {
        console.log('Disconnected from WebSocket. Retrying...');
        setSystemOnline(false);
        setTimeout(connect, 3000);
      };

      socket.onerror = (err) => {
        console.error('WebSocket Error:', err);
        socket.close();
      };
    };

    connect();

    return () => {
      socketRef.current?.close();
    };
  }, [url]);

  const fetchTaskCounts = async () => {
    try {
      const res = await fetch('http://localhost:8000/tasks/counts');
      if (res.ok) {
        const counts = await res.json();
        setTaskCounts(counts);
      }
    } catch (err) {
      // Silently fail
    }
  };

  // Fetch task counts on mount
  useEffect(() => {
    fetchTaskCounts();
  }, []);

  const markAgentStopping = (agentId: string) => {
    setStoppingAgentIds(prev => new Set(prev).add(agentId));
  };

  return { agents, logs, systemOnline, stats, taskCounts, lastTaskUpdate, lastStoppedTask, stoppingAgentIds, markAgentStopping, lastModelUpdate, lastNotification };
};
