'use client';

import React, { memo, useState, useEffect } from 'react';

interface CacheStatus {
  available: boolean;
  hits: number;
  misses: number;
  hit_rate_percent: number | null;
  connected_clients: number;
  used_memory: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const CacheStatusIndicator: React.FC = memo(() => {
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/cache/status`);
        if (res.ok) {
          setStatus(await res.json());
        }
      } catch {
        // Silently fail
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
        onClick={() => setVisible(v => !v)}
        className={`flex items-center gap-[5px] px-[9px] py-1 rounded-[10px] text-[9px] font-semibold font-mono tracking-[0.06em] transition-all cursor-pointer ${
          status.available
            ? 'bg-[rgba(168,85,247,0.08)] border border-[rgba(168,85,247,0.2)] text-purple-400'
            : 'bg-[rgba(234,179,8,0.08)] border border-[rgba(234,179,8,0.2)] text-yellow-400'
        }`}
        title="Redis Cache Status"
      >
        <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${
          status.available ? 'bg-purple-400 shadow-[0_0_5px_rgba(168,85,247,0.5)]' : 'bg-yellow-400'
        }`} />
        CACHE {status.available ? 'ON' : 'OFF'}
        {status.hit_rate_percent !== null && (
          <span className="opacity-70">{status.hit_rate_percent}%</span>
        )}
      </button>

      {visible && status.available && (
        <div className="absolute right-0 top-full mt-1 w-[220px] bg-bg2 border border-border-custom rounded-lg p-3 shadow-lg z-[60] animate-fadein">
          <div className="text-[9px] text-txt3 tracking-[0.14em] uppercase mb-2">Redis Cache Stats</div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
            <div className="text-txt3">Status</div>
            <div className="text-grn-custom">Connected</div>
            <div className="text-txt3">Hits</div>
            <div className="text-txt">{status.hits.toLocaleString()}</div>
            <div className="text-txt3">Misses</div>
            <div className="text-txt">{status.misses.toLocaleString()}</div>
            <div className="text-txt3">Hit Rate</div>
            <div className="text-purple-400">{status.hit_rate_percent ?? 0}%</div>
            <div className="text-txt3">Memory</div>
            <div className="text-txt">{status.used_memory}</div>
            <div className="text-txt3">Clients</div>
            <div className="text-txt">{status.connected_clients}</div>
          </div>
        </div>
      )}
    </div>
  );
});

CacheStatusIndicator.displayName = 'CacheStatusIndicator';

export default CacheStatusIndicator;
