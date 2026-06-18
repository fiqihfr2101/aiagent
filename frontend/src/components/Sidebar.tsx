
import React from 'react';

interface SidebarProps {
  activeL2: string;
  setActiveL2: (l2: string) => void;
  stats: { running: number; sleeping: number; offline: number };
}

const Sidebar: React.FC<SidebarProps> = ({ activeL2, setActiveL2, stats }) => {
  const tabs = [
    { id: 'overview', label: 'Overview', icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    )},
    { id: 'graph', label: 'Node Graph', icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="12" r="3"/><circle cx="6" cy="18" r="3"/><path d="M9 6h6a3 3 0 0 1 3 3M9 18h3"/></svg>
    )},
    { id: 'taskboard', label: 'Task Board', icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
    )},
    { id: 'console', label: 'Console', icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>
    )},
    { id: 'analytics', label: 'Diagnostics', icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8"><path d="M3 3v18h18M7 14l3-4 3 3 4-6"/></svg>
    )},
  ];

  return (
    <nav className="flex-shrink-0 h-[34px] bg-[rgba(11,15,26,0.9)] border-b border-[rgba(22,35,58,0.8)] flex items-center px-4 gap-0">
      <div className="flex items-center gap-[1px]">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveL2(tab.id)}
            className={`flex items-center gap-[5px] px-[11px] py-1 rounded-[4px] text-[10px] font-medium cursor-pointer transition-all duration-150 tracking-[0.04em] ${
              activeL2 === tab.id ? 'text-cyan-custom bg-[rgba(0,212,170,0.08)]' : 'text-txt3 hover:text-txt2 hover:bg-[rgba(255,255,255,0.03)]'
            }`}
          >
            <div className="w-3 h-3 stroke-current flex-shrink-0">{tab.icon}</div>
            {tab.label}
          </div>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-[10px]">
        <div className="font-mono text-[9px] text-txt3 flex items-center gap-[5px]">
          <span className="w-[5px] h-[5px] rounded-full bg-cyan-custom shadow-[0_0_5px_var(--cyan)] animate-pulse"></span>
          {stats.running} running
        </div>
        <div className="font-mono text-[9px] text-txt3 flex items-center gap-[5px]">
          <span className="w-[5px] h-[5px] rounded-full bg-amb-custom"></span>
          {stats.sleeping} sleeping
        </div>
        <div className="font-mono text-[9px] text-txt3 flex items-center gap-[5px]">
          <span className="w-[5px] h-[5px] rounded-full bg-red-custom"></span>
          {stats.offline} offline
        </div>
      </div>
    </nav>
  );
};

export default Sidebar;
