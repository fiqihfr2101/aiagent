
import React, { memo, useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import CacheStatusIndicator from './CacheStatusIndicator';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

const NAV_TABS = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { id: 'chat', label: 'Chat', path: '/chat' },
  { id: 'messages', label: 'Messages', path: '/messages' },
  { id: 'memory', label: 'Memory', path: '/memory' },
  { id: 'analytics', label: 'Analytics', path: '/analytics' },
  { id: 'costs', label: 'Costs', path: '/costs' },
  { id: 'workflows', label: 'Workflows', path: '/workflows' },
  { id: 'plugins', label: 'Plugins', path: '/plugins' },
];

interface NavBarProps {
  systemStatus: string;
  activeCount: string;
  children?: React.ReactNode;
}

const NavBar: React.FC<NavBarProps> = memo(({ systemStatus, activeCount, children }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Determine active tab from pathname
  const activeTab = NAV_TABS.find(tab => pathname.startsWith(tab.path))?.id || 'dashboard';

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <nav className="flex-shrink-0 h-[44px] bg-[rgba(7,9,15,0.95)] border-b border-border-custom flex items-center px-4 gap-0 backdrop-blur-xl z-50">
      <div className="flex items-center gap-[9px] mr-6 cursor-pointer" onClick={() => router.push('/dashboard')}>
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
        {NAV_TABS.map((tab) => (
          <div
            key={tab.id}
            onClick={() => router.push(tab.path)}
            className={`px-[13px] py-[5px] rounded-[5px] text-[11px] font-medium cursor-pointer transition-all duration-150 tracking-[0.06em] uppercase ${
              activeTab === tab.id ? 'text-cyan-custom bg-[rgba(0,212,170,0.1)] border border-[rgba(0,212,170,0.2)]' : 'text-txt3 hover:text-txt2 hover:bg-[rgba(255,255,255,0.03)]'
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
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2 transition-all duration-150"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[14px] h-[14px] stroke-current">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[14px] h-[14px] stroke-current">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
        {/* Keyboard shortcuts hint */}
        <button
          className="w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2 transition-all duration-150"
          title="Keyboard shortcuts: Ctrl+K, Ctrl+N, Ctrl+T, Ctrl+/"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[14px] h-[14px] stroke-current">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
          </svg>
        </button>
        {children || (
          <div className="w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2 transition-all duration-150">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[14px] h-[14px] stroke-current">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
          </div>
        )}
        {/* User avatar with dropdown */}
        <div className="relative" ref={menuRef}>
          <div
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-[26px] h-[26px] rounded-full bg-linear-to-br from-ind-custom to-[#4338CA] flex items-center justify-center text-[10px] font-bold text-white cursor-pointer hover:ring-2 hover:ring-cyan-custom/30 transition-all"
          >
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-[#111827] border border-gray-700/50 rounded-xl shadow-2xl py-1 z-[60] animate-fadein">
              <div className="px-4 py-2.5 border-b border-gray-700/50">
                <div className="text-sm text-white font-medium">{user?.username}</div>
                <div className="text-[10px] text-gray-300 font-mono capitalize">{user?.role}</div>
              </div>
              <a
                href="/settings"
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                onClick={() => setShowUserMenu(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Account Settings
              </a>
              <div className="border-t border-gray-700/50 mt-1 pt-1">
                <button
                  onClick={() => { setShowUserMenu(false); logout(); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
});

NavBar.displayName = 'NavBar';

export default NavBar;
