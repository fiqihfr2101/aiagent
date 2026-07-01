'use client';

import React, { memo, useState, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../utils/api';

interface CacheStatus {
  available: boolean;
  hits: number;
  misses: number;
  hit_rate_percent: number | null;
  connected_clients: number;
  used_memory: string;
}

const CacheStatusIndicator: React.FC = memo(() => {
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/cache/status`, { headers: getAuthHeaders('') });
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (err) {
        // Ignore errors
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setVisible(!visible)}
        className={`flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono rounded border transition-colors ${
          status.available
            ? 'bg-purple-900/30 text-purple-400 border-purple-500/30'
            : 'bg-amber-900/30 text-amber-400 border-amber-500/30'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${status.available ? 'bg-purple-400' : 'bg-amber-400'}`} />
        CACHE {status.available ? 'ON' : 'OFF'}
      </button>

      {visible && status.available && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-bg2 border border-border-custom rounded-lg shadow-lg z-50 p-3">
          <div className="text-[9px] text-txt3 uppercase tracking-wider mb-2">Cache Stats</div>
          <div className="space-y-1.5 text-[10px] font-mono">
            <div className="flex justify-between">
              <span className="text-txt2">Hits</span>
              <span className="text-green-400">{status.hits}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-txt2">Misses</span>
              <span className="text-red-custom">{status.misses}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-txt2">Hit Rate</span>
              <span className="text-cyan-custom">{status.hit_rate_percent ?? 0}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-txt2">Memory</span>
              <span className="text-txt">{status.used_memory}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-txt2">Clients</span>
              <span className="text-txt">{status.connected_clients}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

CacheStatusIndicator.displayName = 'CacheStatusIndicator';

export default CacheStatusIndicator;
