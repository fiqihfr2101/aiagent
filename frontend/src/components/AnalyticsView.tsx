
import React, { memo, useMemo } from 'react';
import { Agent } from '../types';

interface AnalyticsViewProps {
  agents?: Agent[];
}

const KPIS = [
  { label: 'Tasks/hour', value: '312', color: 'var(--cyan)', pct: 70 },
  { label: 'Avg latency', value: '1.8s', color: 'var(--ind)', pct: 42 },
  { label: 'Error rate', value: '0.4%', color: 'var(--red)', pct: 6 },
  { label: 'Fleet uptime', value: '98.2%', color: 'var(--grn)', pct: 98 },
];

const bars = (n: number, seed: number, color: string) => {
  const items = [];
  for (let i = 0; i < n; i++) {
    const v = 25 + Math.abs(Math.sin(i * seed + seed)) * 75;
    items.push(
      <i key={i} style={{ height: `${Math.round(v)}%`, background: color }} className="opacity-70 flex-1 rounded-t-[2px] min-h-[2px]"></i>
    );
  }
  return items;
};

const AnalyticsView: React.FC<AnalyticsViewProps> = memo(({ agents = [] }) => {
  // Pre-compute bar data with useMemo
  const throughputBars = useMemo(() => bars(48, 0.4, 'var(--cyan)'), []);
  const latencyBars = useMemo(() => bars(24, 0.8, 'var(--ind)'), []);
  const agentBars = useMemo(() => bars(12, 1.3, 'var(--amb)'), []);
  const successBars = useMemo(() => bars(48, 0.6, 'var(--grn)'), []);

  return (
    <div className="p-[20px_24px] overflow-y-auto flex-1">
      <div className="text-base font-semibold">Diagnostics</div>
      <div className="text-[11px] text-txt2 mt-[3px]">Fleet throughput and reliability · last 24 hours</div>
      
      <div className="grid grid-cols-4 gap-2.5 mt-3.5">
        {KPIS.map((kpi, i) => (
          <div key={i} className="p-3 border border-border-custom rounded-lg bg-bg2">
            <div className="text-[9px] text-txt3 uppercase tracking-[0.1em]">{kpi.label}</div>
            <div className="font-mono text-[22px] font-semibold mt-1 leading-none" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="h-[2px] bg-border-custom rounded-[1px] mt-2 overflow-hidden">
              <i style={{ width: `${kpi.pct}%`, background: kpi.color }} className="block h-full rounded-[1px]"></i>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-[11px] mt-3.5">
        <div className="bg-bg2 border border-border-custom rounded-lg p-3.5 col-span-2">
          <div className="text-[9px] text-txt2 uppercase tracking-[0.08em] mb-[11px]">Task throughput · 24h</div>
          <div className="flex items-end gap-[2px] h-16">{throughputBars}</div>
        </div>
        <div className="bg-bg2 border border-border-custom rounded-lg p-3.5">
          <div className="text-[9px] text-txt2 uppercase tracking-[0.08em] mb-[11px]">Avg latency trend</div>
          <div className="flex items-end gap-[2px] h-16">{latencyBars}</div>
        </div>
        <div className="bg-bg2 border border-border-custom rounded-lg p-3.5">
          <div className="text-[9px] text-txt2 uppercase tracking-[0.08em] mb-[11px]">Tasks by agent</div>
          <div className="flex items-end gap-[2px] h-16">{agentBars}</div>
        </div>
        <div className="bg-bg2 border border-border-custom rounded-lg p-3.5 col-span-2">
          <div className="text-[9px] text-txt2 uppercase tracking-[0.08em] mb-[11px]">Success vs failure · hourly</div>
          <div className="flex items-end gap-[2px] h-16">{successBars}</div>
        </div>
      </div>
    </div>
  );
});

AnalyticsView.displayName = 'AnalyticsView';

export default AnalyticsView;
