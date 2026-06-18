
import React from 'react';
import { Agent } from '../types';

interface AgentCardProps {
  agent: Agent;
  onClick: (id: string) => void;
  taskCount?: number;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick, taskCount = 0 }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'var(--cyan)';
      case 'sleeping': return 'var(--amb)';
      default: return 'var(--red)';
    }
  };

  const getHbClass = (hb: string) => {
    if (hb.includes('m')) return 'text-red-custom';
    return parseInt(hb) > 30 ? 'text-amb-custom' : 'text-cyan-custom';
  };

  const stColor = getStatusColor(agent.status);
  const hbColorClass = getHbClass(agent.hb);

  return (
    <div 
      className={`acard flex-shrink-0 p-[14px] rounded-[12px] bg-bg3 cursor-pointer transition-all duration-200 relative border-none overflow-hidden isolate ${
        agent.status === 'active' ? 'acard-active bg-[#0B1820] hover:-translate-y-[2px]' : 
        agent.status === 'sleeping' ? 'acard-sleeping bg-[#0B1820] opacity-[0.78] hover:-translate-y-[1px]' : 
        'opacity-[0.35] grayscale-[0.8]'
      }`}
      onClick={() => onClick(agent.id)}
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-[10px]">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[13px] font-mono flex-shrink-0 bg-[rgba(0,212,170,0.15)] text-cyan-custom border border-[rgba(0,212,170,0.3)]">
            {agent.name[0]}
          </div>
          <div className="flex items-center gap-1 text-[8px] font-semibold font-mono tracking-[0.06em]" style={{ color: stColor }}>
            <span className={`w-1 h-1 rounded-full inline-block ${agent.status === 'active' ? 'animate-pulse' : ''}`} style={{ background: stColor, boxShadow: agent.status === 'active' ? `0 0 5px ${stColor}` : 'none' }}></span>
            {agent.status.toUpperCase()}
          </div>
        </div>
        <div className="font-bold text-sm tracking-[0.05em] leading-none">
          {agent.status === 'sleeping' ? '🌙 ' : ''}{agent.name}
        </div>
        <div className="text-[9px] text-txt2 uppercase tracking-[0.08em] mt-[3px]">{agent.role}</div>
        <div className="text-[9px] text-txt2 mt-[9px] whitespace-nowrap overflow-hidden text-ellipsis font-mono py-[5px] px-2 bg-[rgba(0,0,0,0.35)] rounded-[5px] border border-[rgba(0,212,170,0.1)]">
          {agent.task}
        </div>
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[rgba(0,212,170,0.08)]">
          <div className="text-[8px] text-txt3 font-mono flex flex-col gap-[2px]">
            <span className="text-txt3">UPTIME</span>
            <span className="text-[11px] font-semibold text-grn-custom font-mono">{agent.uptime}</span>
          </div>
          <div className="text-[8px] text-txt3 font-mono flex flex-col gap-[2px]">
            <span className="text-txt3">HB</span>
            <span className={`text-[11px] font-semibold font-mono ${hbColorClass}`}>{agent.hb}</span>
          </div>
          <div className="text-[8px] text-txt3 font-mono flex flex-col gap-[2px]">
            <span className="text-txt3">TASKS</span>
            <span className="text-[11px] font-semibold text-cyan-custom font-mono">{taskCount}</span>
          </div>
        </div>
        <div className="text-[8px] text-txt3 mt-[7px] font-mono flex items-center justify-between">
          <span>last seen {agent.seen}</span>
        </div>
      </div>
    </div>
  );
};

export default AgentCard;
