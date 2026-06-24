
import { useEffect, useRef, useState } from 'react';
import { Agent, FeedItem, LogEntry, TaskCounts } from '../types';

export const useWebSocket = (url: string) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [systemOnline, setSystemOnline] = useState(false);
  const [stats, setStats] = useState({ active_nodes: 0, running: 0, sleeping: 0, offline: 0 });
  const [taskCounts, setTaskCounts] = useState<TaskCounts>({});
  const [lastTaskUpdate, setLastTaskUpdate] = useState<any>(null);
  
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

  return { agents, logs, systemOnline, stats, taskCounts, lastTaskUpdate };
};
