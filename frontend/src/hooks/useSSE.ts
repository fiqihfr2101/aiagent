import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE } from '@/utils/api';

export interface CDCEvent {
  seq: number;
  table: string;
  row_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: any;
  new_data: any;
  timestamp: string;
}

interface UseSSEOptions {
  onEvent?: (event: CDCEvent) => void;
  onTableChange?: (table: string, event: CDCEvent) => void;
  enabled?: boolean;
}

/**
 * SSE hook for real-time CDC (Change Data Capture) updates.
 *
 * Connects to the /events SSE endpoint and streams change_log
 * entries from the database in real-time. No polling required.
 *
 * Usage:
 *   const { connected, lastEvent } = useSSE({
 *     enabled: isAuthenticated,
 *     onEvent: (evt) => console.log('change:', evt),
 *   });
 */
export function useSSE(options: UseSSEOptions = {}) {
  const { onEvent, onTableChange, enabled = true } = options;
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<CDCEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const onTableChangeRef = useRef(onTableChange);

  // Keep callback refs fresh without triggering reconnect
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { onTableChangeRef.current = onTableChange; }, [onTableChange]);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    // Clean up previous connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const token = localStorage.getItem('access_token');
    if (!token) return;

    const url = `${API_BASE}/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as CDCEvent;
        setLastEvent(data);
        onEventRef.current?.(data);
        onTableChangeRef.current?.(data.table, data);
      } catch {
        // keepalive comments arrive here as non-JSON — ignore
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      eventSourceRef.current = null;
      // Reconnect with backoff
      reconnectTimerRef.current = setTimeout(() => connect(), 5000);
    };

    eventSourceRef.current = es;
  }, [enabled]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [connect]);

  return { connected, lastEvent };
}
