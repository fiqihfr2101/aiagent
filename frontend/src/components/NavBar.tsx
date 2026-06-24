
import React from 'react';

import CacheStatusIndicator from './CacheStatusIndicator';

interface NavBarProps {
  activeL1: string;
  setActiveL1: (l1: string) => void;
  systemStatus: string;
  activeCount: string;
  children?: React.ReactNode;
}

const NavBar: React.FC<NavBarProps> = ({ activeL1, setActiveL1, systemStatus, activeCount, children }) => {
  return (
    <nav className="flex-shrink-0 h-[44px] bg-[rgba(7,9,15,0.95)] border-b border-border-custom flex items-center px-4 gap-0 backdrop-blur-xl z-50">
      <div className="flex items-center gap-[9px] mr-6 cursor-pointer" onClick={() => setActiveL1('overview')}>
        <div className="w-7 h-7 rounded-[7px] bg-[#0A1628] border border-[rgba(0,212,170,0.5)] flex items-center justify-center shadow-[0_0_10px_rgba(0,212,170,0.25)]">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 stroke-cyan-custom stroke-[1.6]">
            <rect x="4" y="8" width="16" height="12" rx="2" />
            <path d="M12 8V5M9 2h6M9 13h.01M15 13h.01M9 17h6" />
          </svg>
        </div>
        <div>
          <div className="text-[12px] font-bold tracking-[0.14em] text-txt leading-none">FIQIH&apos;S TEAM</div>
          <div className="text-[9px] text-txt3 tracking-[0.18em] uppercase mt-[2px]">Mission Control</div>
        </div>
      </div>
      <div className="flex items-center gap-[1px] flex-1">
        {[
          { id: 'overview', label: 'Dashboard' },
          { id: 'memory', label: 'Memory' },
          { id: 'analytics-main', label: 'Analytics' },
          { id: 'costs', label: 'Costs' },
        ].map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveL1(tab.id)}
            className={`px-[13px] py-[5px] rounded-[5px] text-[11px] font-medium cursor-pointer transition-all duration-150 tracking-[0.06em] uppercase ${
              activeL1 === tab.id ? 'text-cyan-custom bg-[rgba(0,212,170,0.1)] border border-[rgba(0,212,170,0.2)]' : 'text-txt3 hover:text-txt2 hover:bg-[rgba(255,255,255,0.03)]'
            }`}
          >
            {tab.label}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <CacheStatusIndicator />
        <div className={`flex items-center gap-[5px] px-[9px] py-1 rounded-[10px] text-[9px] font-semibold font-mono tracking-[0.06em] ${
          systemStatus === 'ONLINE' ? 'bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.2)] text-grn-custom' : 'bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] text-red-custom'
        }`}>
          <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 animate-pulse ${systemStatus === 'ONLINE' ? 'bg-grn-custom shadow-[0_0_5px_var(--grn)]' : 'bg-red-custom shadow-[0_0_5px_var(--red)]'}`}></span>
          SYSTEM {systemStatus}
        </div>
        <div className="font-mono text-[10px] text-txt2">{activeCount}</div>
        {children || (
          <div className="w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2 transition-all duration-150">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[14px] h-[14px] stroke-current">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
          </div>
        )}
        <div className="w-[26px] h-[26px] rounded-full bg-linear-to-br from-ind-custom to-[#4338CA] flex items-center justify-center text-[10px] font-bold text-white">FQ</div>
      </div>
    </nav>
  );
};

export default NavBar;
