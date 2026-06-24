'use client';

import React, { useCallback } from 'react';

// ─── CSV Export ───────────────────────────────────────────────────

export function exportToCSV(data: Record<string, any>[], filename: string) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const str = val == null ? '' : String(val);
          // Escape quotes and wrap in quotes if contains comma/newline/quote
          if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    ),
  ];

  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

// ─── JSON Export ──────────────────────────────────────────────────

export function exportToJSON(data: any, filename: string) {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  downloadBlob(blob, `${filename}.json`);
}

// ─── PDF-style Text Export (no external deps) ─────────────────────

export function exportToText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  downloadBlob(blob, `${filename}.txt`);
}

// ─── Analytics Export ─────────────────────────────────────────────

export interface AnalyticsExportData {
  timestamp: string;
  kpis: { label: string; value: string }[];
  agentCount: number;
  activeCount: number;
}

export function exportAnalytics(data: AnalyticsExportData, format: 'csv' | 'json') {
  if (format === 'csv') {
    const rows = data.kpis.map((kpi) => ({
      Metric: kpi.label,
      Value: kpi.value,
      Timestamp: data.timestamp,
    }));
    exportToCSV(rows, `hermes-analytics-${Date.now()}`);
  } else {
    exportToJSON(data, `hermes-analytics-${Date.now()}`);
  }
}

// ─── Task History Export ──────────────────────────────────────────

export interface TaskExportRow {
  id: string;
  title: string;
  agent: string;
  priority: string;
  status: string;
  duration: string;
  tokens: number;
  created_at: string;
}

export function exportTaskHistory(tasks: TaskExportRow[], format: 'csv' | 'json') {
  if (format === 'csv') {
    exportToCSV(tasks, `hermes-tasks-${Date.now()}`);
  } else {
    exportToJSON(tasks, `hermes-tasks-${Date.now()}`);
  }
}

// ─── Agent Config Export ──────────────────────────────────────────

export interface AgentConfigExport {
  agent_id: string;
  agent_name: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  tools: string[];
  toolsets: string[];
  env_vars: Record<string, string>;
  exported_at: string;
}

export function exportAgentConfig(config: AgentConfigExport) {
  exportToJSON(config, `hermes-agent-${config.agent_name}-${Date.now()}`);
}

export function exportAllAgentConfigs(configs: AgentConfigExport[]) {
  exportToJSON(configs, `hermes-all-agents-${Date.now()}`);
}

// ─── Utility ──────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Export Button Component ──────────────────────────────────────

interface ExportButtonProps {
  onExport: (format: 'csv' | 'json') => void;
  label?: string;
  className?: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  onExport,
  label = 'Export',
  className = '',
}) => {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[9px] font-bold font-mono bg-ind-custom/15 border border-ind-custom/30 text-ind-custom hover:bg-ind-custom/25 transition-colors tracking-[0.06em] ${className}`}
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="w-3 h-3 stroke-current">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-bg2 border border-border-custom rounded-lg shadow-lg overflow-hidden min-w-[120px]">
            <button
              onClick={() => {
                onExport('csv');
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-[10px] font-mono text-txt2 hover:text-txt hover:bg-white/[0.05] transition-colors flex items-center gap-2"
            >
              <span className="text-[12px]">📊</span> CSV
            </button>
            <button
              onClick={() => {
                onExport('json');
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-[10px] font-mono text-txt2 hover:text-txt hover:bg-white/[0.05] transition-colors flex items-center gap-2"
            >
              <span className="text-[12px]">📋</span> JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
};
