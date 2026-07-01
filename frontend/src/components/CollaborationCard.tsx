'use client';

import React, { useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────

interface AgentContribution {
  id: string;
  name: string;
  role?: string;
  color: string;
  subtask: string;
  response: string;
  success: boolean;
}

interface CollaborationCardProps {
  agents: AgentContribution[];
  primaryAgent?: string;
  combinedResponse?: string;
}

// ─── Agent Badge ─────────────────────────────────────────────────

function AgentBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wide"
      style={{
        backgroundColor: color + '22',
        color: color,
        border: '1px solid ' + color + '55',
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
}

// ─── Collapsible Agent Section ────────────────────────────────────

function AgentSection({ agent }: { agent: AgentContribution }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className="border rounded-lg overflow-hidden transition-all"
      style={{
        borderColor: agent.color + '33',
        backgroundColor: agent.color + '08',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <span
          className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0"
          style={{
            backgroundColor: agent.color + '22',
            color: agent.color,
            border: '1px solid ' + agent.color + '44',
          }}
        >
          {agent.name[0]}
        </span>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-bold font-mono tracking-wider"
              style={{ color: agent.color }}
            >
              {agent.name}
            </span>
            {agent.role && (
              <span className="text-[9px] text-txt3">· {agent.role}</span>
            )}
            {agent.success ? (
              <span className="text-[9px] text-green-400">✓ Done</span>
            ) : (
              <span className="text-[9px] text-amber-400">⚠ Partial</span>
            )}
          </div>
          <div className="text-[10px] text-txt3 truncate mt-0.5">
            📋 {agent.subtask}
          </div>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="2"
          className="w-4 h-4 stroke-txt3 transition-transform flex-shrink-0"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-4 pb-4 pt-1">
          <div className="text-[12px] text-txt leading-relaxed whitespace-pre-wrap">
            {agent.response}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Collaboration Flow Visualization ─────────────────────────────

function CollaborationFlow({
  agents,
  primaryAgent,
}: {
  agents: AgentContribution[];
  primaryAgent?: string;
}) {
  const primary = agents.find(
    (a) => a.id === primaryAgent || a.id === 'hilman'
  );
  const others = agents.filter(
    (a) => a.id !== primaryAgent && a.id !== 'hilman'
  );

  return (
    <div className="flex items-center gap-2 py-2 px-3 bg-bg4/50 rounded-lg border border-border-custom overflow-x-auto">
      {/* Primary agent */}
      {primary && (
        <AgentBadge name={primary.name} color={primary.color} />
      )}

      {/* Arrow */}
      <svg viewBox="0 0 24 8" className="w-6 h-2 stroke-txt3 flex-shrink-0">
        <line x1="0" y1="4" x2="20" y2="4" strokeWidth="1.5" />
        <polyline points="16 1 20 4 16 7" fill="none" strokeWidth="1.5" />
      </svg>

      {/* Other agents */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {others.map((agent) => (
          <AgentBadge key={agent.id} name={agent.name} color={agent.color} />
        ))}
      </div>

      {/* Arrow to QA */}
      {agents.some((a) => a.id === 'budi') && (
        <>
          <svg
            viewBox="0 0 24 8"
            className="w-6 h-2 stroke-txt3 flex-shrink-0"
          >
            <line x1="0" y1="4" x2="20" y2="4" strokeWidth="1.5" />
            <polyline
              points="16 1 20 4 16 7"
              fill="none"
              strokeWidth="1.5"
            />
          </svg>
          <AgentBadge name="BUDI" color="#22C55E" />
        </>
      )}
    </div>
  );
}

// ─── Main CollaborationCard Component ─────────────────────────────

export default function CollaborationCard({
  agents,
  primaryAgent,
}: CollaborationCardProps) {
  return (
    <div className="space-y-3">
      {/* Collaboration Header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-custom/10 border border-cyan-custom/30">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="1.8"
            className="w-3.5 h-3.5 stroke-cyan-custom"
          >
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
          <span className="text-[10px] font-mono font-bold text-cyan-custom tracking-wide">
            MULTI-AGENT COLLABORATION
          </span>
        </div>
        <span className="text-[10px] text-txt3">
          {agents.length} agents
        </span>
      </div>

      {/* Flow Visualization */}
      <CollaborationFlow agents={agents} primaryAgent={primaryAgent} />

      {/* Agent Sections */}
      <div className="space-y-2">
        {agents.map((agent) => (
          <AgentSection key={agent.id} agent={agent} />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 pt-1 border-t border-border-custom/50">
        <span className="text-[9px] text-txt3">
          Coordinated by{' '}
          <span className="font-mono font-bold text-[#00D4AA]">HILMAN</span>{' '}
          (Project Manager)
        </span>
      </div>
    </div>
  );
}
