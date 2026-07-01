'use client';

import React, { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Agent, AgentStatus } from '@/types';

// ─── Role-based color mapping ───────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  'project manager': '#00D4AA',
  'pm': '#00D4AA',
  'backend': '#6366F1',
  'frontend': '#F59E0B',
  'qa': '#22C55E',
  'devops': '#8B5CF6',
  'designer': '#EC4899',
  'analyst': '#3B82F6',
  'tester': '#22C55E',
};

const STATUS_COLORS: Record<AgentStatus, string> = {
  active: '#00D4AA',
  sleeping: '#F59E0B',
  offline: '#64748B',
};

// ─── Hierarchy tier assignment ──────────────────────────────────────────────
function getTier(role: string): number {
  const r = role.toLowerCase();
  if (r.includes('project manager') || r.includes('pm') || r.includes('lead') || r.includes('coordinator')) return 0;
  if (r.includes('backend') || r.includes('frontend') || r.includes('engineer') || r.includes('developer')) return 1;
  if (r.includes('qa') || r.includes('tester') || r.includes('test')) return 2;
  if (r.includes('devops') || r.includes('infra')) return 1;
  return 2; // default to bottom tier
}

function getRoleColor(role: string, agentColor?: string): string {
  if (agentColor) return agentColor;
  const r = role.toLowerCase();
  for (const [key, color] of Object.entries(ROLE_COLORS)) {
    if (r.includes(key)) return color;
  }
  return '#6366F1'; // fallback indigo
}

// ─── Legend items ────────────────────────────────────────────────────────────
const LEGEND_ITEMS = [
  { label: 'Project Manager', color: '#00D4AA' },
  { label: 'Backend Engineer', color: '#6366F1' },
  { label: 'Frontend Engineer', color: '#F59E0B' },
  { label: 'QA / Testing', color: '#22C55E' },
];

// ─── Types ──────────────────────────────────────────────────────────────────
interface LayoutNode {
  id: string;
  x: number;
  y: number;
  tier: number;
  agent: Agent;
  color: string;
}

interface Edge {
  from: string;
  to: string;
  type: 'hierarchy' | 'peer';
}

interface NodeGraphProps {
  agents: Agent[];
  onAgentClick: (id: string) => void;
}

// ─── Layout computation ─────────────────────────────────────────────────────
const NODE_W = 160;
const NODE_H = 72;
const TIER_GAP_Y = 150;
const NODE_GAP_X = 40;
const START_Y = 50;

function computeLayout(agents: Agent[]): { nodes: LayoutNode[]; edges: Edge[] } {
  if (agents.length === 0) return { nodes: [], edges: [] };

  // Group agents by tier
  const tierMap = new Map<number, Agent[]>();
  agents.forEach(agent => {
    const tier = getTier(agent.role);
    if (!tierMap.has(tier)) tierMap.set(tier, []);
    tierMap.get(tier)!.push(agent);
  });

  const sortedTiers = Array.from(tierMap.keys()).sort((a, b) => a - b);
  const maxAgentsInTier = Math.max(...sortedTiers.map(t => tierMap.get(t)!.length));
  const totalWidth = maxAgentsInTier * (NODE_W + NODE_GAP_X) - NODE_GAP_X;

  const nodes: LayoutNode[] = [];
  const tierNodes: Map<number, LayoutNode[]> = new Map();

  sortedTiers.forEach(tier => {
    const agentsInTier = tierMap.get(tier)!;
    const tierWidth = agentsInTier.length * (NODE_W + NODE_GAP_X) - NODE_GAP_X;
    const offsetX = (totalWidth - tierWidth) / 2;
    const y = START_Y + tier * TIER_GAP_Y;

    const tierLayout: LayoutNode[] = [];
    agentsInTier.forEach((agent, i) => {
      const node: LayoutNode = {
        id: agent.id,
        x: offsetX + i * (NODE_W + NODE_GAP_X),
        y,
        tier,
        agent,
        color: getRoleColor(agent.role, agent.color),
      };
      nodes.push(node);
      tierLayout.push(node);
    });
    tierNodes.set(tier, tierLayout);
  });

  // Build edges: PM connects to all below, same-tier peers connect
  const edges: Edge[] = [];

  // Hierarchy edges: each tier connects to the next tier
  for (let i = 0; i < sortedTiers.length - 1; i++) {
    const currentTier = tierNodes.get(sortedTiers[i]) || [];
    const nextTier = tierNodes.get(sortedTiers[i + 1]) || [];

    if (i === 0 && currentTier.length === 1) {
      // PM connects to all in next tier
      nextTier.forEach(child => {
        edges.push({ from: currentTier[0].id, to: child.id, type: 'hierarchy' });
      });
    } else {
      // Connect each parent to corresponding children (rough matching)
      nextTier.forEach((child, ci) => {
        const parentIdx = Math.min(Math.floor(ci * currentTier.length / nextTier.length), currentTier.length - 1);
        edges.push({ from: currentTier[parentIdx].id, to: child.id, type: 'hierarchy' });
      });
    }

    // Peer connections within same tier
    for (let j = 0; j < currentTier.length - 1; j++) {
      edges.push({ from: currentTier[j].id, to: currentTier[j + 1].id, type: 'peer' });
    }
  }

  // Peer connections in last tier
  const lastTier = tierNodes.get(sortedTiers[sortedTiers.length - 1]) || [];
  for (let j = 0; j < lastTier.length - 1; j++) {
    edges.push({ from: lastTier[j].id, to: lastTier[j + 1].id, type: 'peer' });
  }

  return { nodes, edges };
}

// ─── Component ──────────────────────────────────────────────────────────────
const NodeGraph: React.FC<NodeGraphProps> = memo(({ agents, onAgentClick }) => {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; agent: Agent } | null>(null);
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const { nodes, edges } = useMemo(() => computeLayout(agents), [agents]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [nodes]);

  // ViewBox calculation
  const viewBox = useMemo(() => {
    if (nodes.length === 0) return '0 0 980 400';
    const padding = 80;
    const maxX = Math.max(...nodes.map(n => n.x + NODE_W)) + padding;
    const maxY = Math.max(...nodes.map(n => n.y + NODE_H)) + padding;
    const minX = Math.min(...nodes.map(n => n.x)) - padding;
    const minY = Math.min(...nodes.map(n => n.y)) - padding;
    return minX + ' ' + minY + ' ' + (maxX - minX) + ' ' + (maxY - minY);
  }, [nodes]);

  // ─── Pan/Zoom handlers ────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-clickable]')) return;
    isDragging.current = true;
    startPos.current = { x: e.clientX - translate.x, y: e.clientY - translate.y };
  }, [translate]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    setTranslate({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.max(0.3, Math.min(3, s + (e.deltaY < 0 ? 0.08 : -0.08))));
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const fitView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // ─── Tooltip handling ─────────────────────────────────────────────────────
  const handleNodeHover = useCallback((node: LayoutNode, e: React.MouseEvent) => {
    setHoveredNode(node.id);
    const rect = (e.currentTarget as SVGElement).closest('.nodegraph-container')?.getBoundingClientRect();
    if (rect) {
      setTooltip({
        x: e.clientX - rect.left + 12,
        y: e.clientY - rect.top - 10,
        agent: node.agent,
      });
    }
  }, []);

  const handleNodeLeave = useCallback(() => {
    setHoveredNode(null);
    setTooltip(null);
  }, []);

  // ─── Connected nodes for highlighting ─────────────────────────────────────
  const connectedNodes = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const connected = new Set<string>([hoveredNode]);
    edges.forEach(e => {
      if (e.from === hoveredNode) connected.add(e.to);
      if (e.to === hoveredNode) connected.add(e.from);
    });
    return connected;
  }, [hoveredNode, edges]);

  // ─── Edge path calculation ────────────────────────────────────────────────
  const getEdgePath = useCallback((from: LayoutNode, to: LayoutNode, type: 'hierarchy' | 'peer'): string => {
    if (type === 'peer') {
      // Horizontal line between peers
      const x1 = from.x + NODE_W;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_H / 2;
      return 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2;
    }
    // Curved line from parent to child
    const x1 = from.x + NODE_W / 2;
    const y1 = from.y + NODE_H;
    const x2 = to.x + NODE_W / 2;
    const y2 = to.y;
    const my = (y1 + y2) / 2;
    return 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + my + ',' + x2 + ' ' + my + ',' + x2 + ' ' + y2;
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0B0F1A] text-txt3 text-sm">
        No agents configured
      </div>
    );
  }

  return (
    <div className="nodegraph-container flex flex-col h-full bg-[#0B0F1A] relative overflow-hidden" onMouseDown={handleMouseDown} onWheel={handleWheel}>
      {/* Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-[5px] z-50">
        <button
          className="w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2 transition-colors"
          onClick={() => setScale(s => Math.min(3, s + 0.1))}
          title="Zoom in"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="w-[14px] h-[14px] stroke-current"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button
          className="w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2 transition-colors"
          onClick={() => setScale(s => Math.max(0.3, s - 0.1))}
          title="Zoom out"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="w-[14px] h-[14px] stroke-current"><path d="M5 12h14" /></svg>
        </button>
        <button
          className="w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2 transition-colors"
          onClick={resetView}
          title="Reset view"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[14px] h-[14px] stroke-current"><path d="M4 9V4h5M20 15v5h-5M20 4h-5v5" /></svg>
        </button>
        <button
          className="w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2 transition-colors"
          onClick={fitView}
          title="Fit all nodes"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[14px] h-[14px] stroke-current"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-50 flex flex-wrap gap-3 px-3 py-2 rounded-lg bg-[#0B0F1A]/90 border border-border-custom backdrop-blur-sm">
        {LEGEND_ITEMS.map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-[9px] font-mono text-txt3">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border-custom">
          <div className="w-2 h-2 rounded-full bg-[#00D4AA]" />
          <span className="text-[9px] font-mono text-txt3">Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#F59E0B]" />
          <span className="text-[9px] font-mono text-txt3">Sleeping</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#64748B]" />
          <span className="text-[9px] font-mono text-txt3">Offline</span>
        </div>
      </div>

      {/* Hint */}
      <div className="absolute bottom-3 right-3 font-mono text-[9px] text-txt3 z-50">
        drag · scroll to zoom · click for detail
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-[100] pointer-events-none px-3 py-2 rounded-lg bg-[#141824] border border-border-custom shadow-xl max-w-[200px]"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="text-[11px] font-semibold text-txt mb-1">{tooltip.agent.name}</div>
          <div className="text-[9px] text-txt2 mb-1">{tooltip.agent.role}</div>
          {tooltip.agent.model && (
            <div className="text-[8px] text-txt3 font-mono">{tooltip.agent.model}</div>
          )}
          {tooltip.agent.task && (
            <div className="text-[8px] text-txt3 mt-1 truncate">Task: {tooltip.agent.task}</div>
          )}
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={viewBox}
        className="block select-none"
      >
        <defs>
          {/* Arrow marker for hierarchy edges */}
          <marker id="arrow-hierarchy" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="#00D4AA" strokeWidth="1.5" />
          </marker>
          {/* Animated dash pattern for edges */}
          <style>{`
            @keyframes dash-flow {
              to { stroke-dashoffset: -20; }
            }
            @keyframes pulse-glow {
              0%, 100% { opacity: 0.6; }
              50% { opacity: 1; }
            }
            .edge-animated {
              stroke-dasharray: 8 6;
              animation: dash-flow 1.5s linear infinite;
            }
            .edge-peer {
              stroke-dasharray: 4 4;
              opacity: 0.2;
            }
            .node-pulse {
              animation: pulse-glow 2.5s ease-in-out infinite;
            }
          `}</style>
        </defs>

        <g transform={'translate(' + translate.x + ',' + translate.y + ') scale(' + scale + ')'}>
          {/* Edges */}
          {edges.map((edge, i) => {
            const fromNode = nodeMap.get(edge.from);
            const toNode = nodeMap.get(edge.to);
            if (!fromNode || !toNode) return null;

            const isHighlighted = hoveredNode && (edge.from === hoveredNode || edge.to === hoveredNode);
            const isPeer = edge.type === 'peer';
            const path = getEdgePath(fromNode, toNode, edge.type);
            const edgeColor = isPeer ? '#64748B' : fromNode.color;

            return (
              <path
                key={'edge-' + i}
                d={path}
                fill="none"
                stroke={edgeColor}
                strokeWidth={isHighlighted ? 2 : 1}
                opacity={hoveredNode ? (isHighlighted ? 0.8 : 0.1) : (isPeer ? 0.15 : 0.35)}
                markerEnd={isPeer ? undefined : 'url(#arrow-hierarchy)'}
                className={isPeer ? 'edge-peer' : 'edge-animated'}
                style={{ transition: 'opacity 0.2s ease' }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const { agent, color, x, y } = node;
            const isActive = agent.status === 'active';
            const isSleeping = agent.status === 'sleeping';
            const isOffline = agent.status === 'offline';
            const isHovered = hoveredNode === node.id;
            const isConnected = connectedNodes.has(node.id);
            const dimmed = hoveredNode !== null && !isConnected;

            const strokeColor = isActive ? color : isSleeping ? STATUS_COLORS.sleeping : STATUS_COLORS.offline;
            const strokeOpacity = isOffline ? 0.4 : 1;
            const strokeWidth = isHovered ? 2.5 : isActive ? 1.8 : 1;

            return (
              <g
                key={'node-' + node.id}
                transform={'translate(' + x + ',' + y + ')'}
                className="cursor-pointer"
                data-clickable="true"
                onClick={() => onAgentClick(agent.id)}
                onMouseEnter={(e) => handleNodeHover(node, e)}
                onMouseLeave={handleNodeLeave}
                style={{ transition: 'opacity 0.2s ease', opacity: dimmed ? 0.3 : 1 }}
              >
                {/* Glow effect for active agents */}
                {isActive && (
                  <rect
                    x={-4} y={-4}
                    width={NODE_W + 8} height={NODE_H + 8}
                    rx={12}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.15}
                    className="node-pulse"
                  />
                )}

                {/* Node background */}
                <rect
                  width={NODE_W} height={NODE_H}
                  rx={10}
                  fill="#0B0F1A"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  opacity={strokeOpacity}
                />

                {/* Animated border for active nodes */}
                {isActive && (
                  <rect
                    x={1} y={1}
                    width={NODE_W - 2} height={NODE_H - 2}
                    rx={9}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    opacity={0.4}
                    strokeDasharray="40 120"
                    strokeDashoffset="0"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="0"
                      to="-160"
                      dur="3s"
                      repeatCount="indefinite"
                    />
                  </rect>
                )}

                {/* Role color accent bar */}
                <rect
                  x={0} y={0}
                  width={4} height={NODE_H}
                  rx={2}
                  fill={color}
                  opacity={0.8}
                />

                {/* Avatar circle */}
                <circle
                  cx={24} cy={24}
                  r={14}
                  fill={color + '1A'}
                  stroke={color + '80'}
                  strokeWidth={1}
                />
                <text
                  x={24} y={29}
                  textAnchor="middle"
                  className="font-mono text-[11px] font-bold"
                  fill={color}
                >
                  {agent.name[0].toUpperCase()}
                </text>

                {/* Agent name */}
                <text
                  x={44} y={19}
                  className="font-sans text-[12px] font-semibold"
                  fill="#E2E8F0"
                >
                  {agent.name}
                </text>

                {/* Role */}
                <text
                  x={44} y={33}
                  className="font-sans text-[9px]"
                  fill="#94A3B8"
                >
                  {agent.role}
                </text>

                {/* Model badge */}
                {agent.model && (
                  <text
                    x={44} y={45}
                    className="font-mono text-[7px]"
                    fill="#475569"
                  >
                    {agent.model}
                  </text>
                )}

                {/* Status indicator */}
                <circle
                  cx={14} cy={NODE_H - 14}
                  r={4}
                  fill={STATUS_COLORS[agent.status]}
                />
                {isActive && (
                  <circle
                    cx={14} cy={NODE_H - 14}
                    r={7}
                    fill="none"
                    stroke={STATUS_COLORS[agent.status]}
                    strokeWidth={1}
                    opacity={0.3}
                    className="node-pulse"
                  />
                )}

                {/* Status text */}
                <text
                  x={24} y={NODE_H - 10}
                  className="font-mono text-[8px] tracking-widest uppercase"
                  fill={STATUS_COLORS[agent.status]}
                >
                  {agent.status}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
});

NodeGraph.displayName = 'NodeGraph';

export default NodeGraph;
