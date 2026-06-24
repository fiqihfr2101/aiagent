
import React, { memo, useMemo } from 'react';
import { LogEntry, Agent } from '../types';

interface ConsoleProps {
  logs: LogEntry[];
  agents: Agent[];
}

const Console: React.FC<ConsoleProps> = memo(({ logs, agents }) => {
  // Memoize rendered logs to avoid re-rendering on every parent update
  const renderedLogs = useMemo(() => {
    return logs.map((log, i) => (
      <div key={i} className="flex gap-[10px]">
        <span className="text-txt3 whitespace-nowrap">[{log[0]}]</span>
        <span className="text-[#818CF8] w-20 flex-shrink-0">{log[1]}</span>
        <span className={`w-12 flex-shrink-0 font-semibold ${
          log[2] === 'INFO' ? 'text-cyan-custom' : 
          log[2] === 'WARN' ? 'text-amb-custom' : 
          log[2] === 'ERROR' ? 'text-red-custom' : 'text-txt3'
        }`}>{log[2]}</span>
        <span className="text-txt whitespace-pre-wrap">{log[3]}</span>
      </div>
    ));
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-[18px] py-[10px] flex items-center gap-2 border-b border-border-custom bg-bg2">
        <select className="bg-bg3 border border-border-custom rounded-md text-txt px-[9px] py-[5px] text-[10px] font-sans outline-none">
          <option>All agents</option>
          {agents.map(a => <option key={a.id}>{a.name}</option>)}
        </select>
        <select className="bg-bg3 border border-border-custom rounded-md text-txt px-[9px] py-[5px] text-[10px] font-sans outline-none">
          <option>All levels</option>
          <option>INFO</option>
          <option>WARN</option>
          <option>ERROR</option>
        </select>
        <input className="flex-1 bg-bg3 border border-border-custom rounded-md text-txt px-[10px] py-[5px] text-[10px] outline-none placeholder:text-txt3" placeholder="Search log stream..." />
        <button className="bg-[rgba(0,212,170,0.08)] border border-[rgba(0,212,170,0.28)] text-cyan-custom px-[9px] py-1 rounded-md text-[10px]">Auto-scroll ON</button>
        <button className="bg-bg3 border border-border-custom text-txt px-[9px] py-1 rounded-md text-[10px]">Clear</button>
      </div>
      <div className="flex-1 bg-bg5 overflow-y-auto px-5 py-[13px] font-mono text-[11px] leading-[1.9]">
        {renderedLogs}
        <div className="flex gap-[10px]">
          <span className="text-txt3 whitespace-nowrap">[{new Date().toLocaleTimeString('en-GB')}]</span>
          <span className="text-[#818CF8] w-20 flex-shrink-0">SYSTEM</span>
          <span className="w-12 flex-shrink-0 font-semibold text-cyan-custom">INFO</span>
          <span className="text-txt whitespace-pre-wrap">Awaiting stream<span className="inline-block w-1.5 h-[11px] bg-cyan-custom animate-blink vertical-middle ml-1"></span></span>
        </div>
      </div>
    </div>
  );
});

Console.displayName = 'Console';

export default Console;
