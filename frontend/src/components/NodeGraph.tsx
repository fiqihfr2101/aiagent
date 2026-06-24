
import React, { memo, useState, useRef, useEffect, useMemo } from 'react';
import { Agent } from '../types';

interface NodeGraphProps {
  agents: Agent[];
  onAgentClick: (id: string) => void;
}

const TREE: Record<string, { x: number, y: number, ch: string[] }> = {
  jarvis: { x: 430, y: 28, ch: ['architect', 'scout', 'closer'] },
  architect: { x: 100, y: 148, ch: ['forge', 'reviewer'] },
  scout: { x: 420, y: 148, ch: ['ghost', 'analyst'] },
  closer: { x: 740, y: 148, ch: ['hype', 'keeper'] },
  forge: { x: 20, y: 268, ch: [] },
  reviewer: { x: 178, y: 268, ch: [] },
  ghost: { x: 340, y: 268, ch: [] },
  analyst: { x: 498, y: 268, ch: [] },
  hype: { x: 658, y: 268, ch: [] },
  keeper: { x: 816, y: 268, ch: [] },
};

const NW = 138, NH = 54;

const NodeGraph: React.FC<NodeGraphProps> = memo(({ agents, onAgentClick }) => {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('g[onClick]')) return;
    isDragging.current = true;
    startPos.current = { x: e.clientX - translate.x, y: e.clientY - translate.y };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    setTranslate({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.max(0.4, Math.min(2.5, s + (e.deltaY < 0 ? 0.08 : -0.08))));
  };

  const reset = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };

  const perimeter = (NW + NH) * 2;

  // Memoize agent map for faster lookups
  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    agents.forEach(a => map.set(a.id, a));
    return map;
  }, [agents]);

  return (
    <div className="flex flex-col h-full bg-bg dotgrid relative overflow-hidden" onMouseDown={handleMouseDown} onWheel={handleWheel}>
      <div className="absolute top-3 right-3 flex flex-col gap-[5px] z-50">
        <button className="w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2" onClick={() => setScale(s => Math.min(2.5, s + 0.1))}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="w-[14px] h-[14px] stroke-current"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button className="w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2" onClick={() => setScale(s => Math.max(0.4, s - 0.1))}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="w-[14px] h-[14px] stroke-current"><path d="M5 12h14" /></svg>
        </button>
        <button className="w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2" onClick={reset}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[14px] h-[14px] stroke-current"><path d="M4 9V4h5M20 15v5h-5M20 4h-5v5" /></svg>
        </button>
      </div>
      <div className="absolute bottom-[10px] left-3.5 font-mono text-[9px] text-txt3 z-50">drag · scroll to zoom · click for detail</div>
      
      <svg width="100%" height="100%" viewBox="0 0 980 360" className="block select-none">
        <defs>
          <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="#00D4AA" strokeWidth="1.5" />
          </marker>
        </defs>
        <g transform={`translate(${translate.x}, ${translate.y}) scale(${scale})`}>
          {Object.entries(TREE).map(([id, n]) => (
            <React.Fragment key={`edges-${id}`}>
              {n.ch.map(cid => {
                const c = TREE[cid];
                const x1 = n.x + NW / 2;
                const y1 = n.y + NH;
                const x2 = c.x + NW / 2;
                const y2 = c.y;
                const my = (y1 + y2) / 2;
                return (
                  <path
                    key={`edge-${id}-${cid}`}
                    d={`M${x1} ${y1} C${x1} ${my},${x2} ${my},${x2} ${y2}`}
                    fill="none"
                    stroke="#00D4AA"
                    strokeWidth="1"
                    opacity="0.3"
                    markerEnd="url(#ah)"
                  />
                );
              })}
            </React.Fragment>
          ))}

          {Object.entries(TREE).map(([id, n]) => {
            const agent = agentMap.get(id);
            if (!agent) return null;
            const nodeColor = agent.status === 'active' ? '#00D4AA' : agent.status === 'sleeping' ? 'rgba(0,180,140,0.45)' : 'rgba(100,116,139,0.4)';
            const dur = agent.status === 'active' ? '2.5s' : '7s';
            
            return (
              <g key={`node-${id}`} transform={`translate(${n.x},${n.y})`} className="cursor-pointer" onClick={() => onAgentClick(id)}>
                <rect width={NW} height={NH} rx="8" fill="#0B0F1A" stroke={nodeColor} strokeWidth={agent.status === 'active' ? 1.4 : 0.6} opacity={agent.status === 'offline' ? 0.4 : 1} />
                {agent.status !== 'offline' && (
                  <rect 
                    x={1} y={1} width={NW-2} height={NH-2} rx={8}
                    fill="none" stroke={nodeColor} strokeWidth={agent.status === 'active' ? 2 : 1.2}
                    strokeDasharray={`${perimeter * 0.25} ${perimeter * 0.75}`}
                    className="opacity-60"
                  >
                    <animate attributeName="stroke-dashoffset" from="0" to={`-${perimeter}`} dur={dur} repeatCount="indefinite" />
                  </rect>
                )}
                <circle cx="17" cy="17" r="7" fill="rgba(0,212,170,0.12)" stroke="rgba(0,212,170,0.5)" strokeWidth="0.8" />
                <text x="17" y="21" textAnchor="middle" className="font-mono text-[9px] font-bold fill-cyan-custom">{agent.name[0]}</text>
                <text x="30" y="15" className="font-sans text-[11px] font-semibold fill-txt">{agent.name}</text>
                <text x="30" y="27" className="font-sans text-[8px] fill-txt2">{agent.role}</text>
                <circle cx="13" cy="41" r="3" fill={nodeColor} />
                <text x="21" y="44" className="font-mono text-[7.5px] tracking-[0.3em]" fill={nodeColor}>{agent.status.toUpperCase()}</text>
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
