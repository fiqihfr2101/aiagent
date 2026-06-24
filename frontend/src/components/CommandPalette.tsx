'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  actions: CommandAction[];
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, actions }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter actions based on query
  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions;
    const lowerQuery = query.toLowerCase();
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(lowerQuery) ||
        a.description?.toLowerCase().includes(lowerQuery) ||
        a.category.toLowerCase().includes(lowerQuery)
    );
  }, [actions, query]);

  // Group by category
  const groupedActions = useMemo(() => {
    const groups: Record<string, CommandAction[]> = {};
    filteredActions.forEach((action) => {
      if (!groups[action.category]) groups[action.category] = [];
      groups[action.category].push(action);
    });
    return groups;
  }, [filteredActions]);

  // Flatten for keyboard navigation
  const flatActions = useMemo(() => {
    return Object.values(groupedActions).flat();
  }, [groupedActions]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keep selected item in view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, flatActions.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatActions[selectedIndex]) {
            flatActions[selectedIndex].action();
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatActions, selectedIndex, onClose]
  );

  if (!isOpen) return null;

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] animate-fadein">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Palette */}
      <div className="relative w-full max-w-[520px] mx-4 bg-bg2 border border-border-custom rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-custom">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="w-4 h-4 stroke-cyan-custom flex-shrink-0">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-[13px] text-txt placeholder:text-txt3 outline-none"
          />
          <kbd className="text-[9px] font-mono text-txt3 bg-bg3 border border-border-custom rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[340px] overflow-y-auto py-1.5">
          {flatActions.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="text-txt3 text-[11px] font-mono">No results found</div>
              <div className="text-txt3/60 text-[10px] mt-1">Try a different search term</div>
            </div>
          ) : (
            Object.entries(groupedActions).map(([category, categoryActions]) => (
              <div key={category}>
                <div className="px-4 py-1.5 text-[9px] text-txt3 uppercase tracking-[0.14em] font-semibold">
                  {category}
                </div>
                {categoryActions.map((action) => {
                  flatIndex++;
                  const index = flatIndex;
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={action.id}
                      data-index={index}
                      onClick={() => {
                        action.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                        isSelected ? 'bg-cyan-custom/10 text-txt' : 'text-txt2 hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className="text-[14px] w-6 text-center flex-shrink-0">{action.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate">{action.label}</div>
                        {action.description && (
                          <div className="text-[10px] text-txt3 truncate mt-0.5">{action.description}</div>
                        )}
                      </div>
                      {action.shortcut && (
                        <kbd className="text-[9px] font-mono text-txt3 bg-bg3 border border-border-custom rounded px-1.5 py-0.5 flex-shrink-0">
                          {action.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border-custom bg-bg3/50">
          <div className="flex items-center gap-1.5 text-[9px] text-txt3">
            <kbd className="font-mono bg-bg3 border border-border-custom rounded px-1 py-0.5">↑↓</kbd>
            <span>navigate</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-txt3">
            <kbd className="font-mono bg-bg3 border border-border-custom rounded px-1 py-0.5">↵</kbd>
            <span>select</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-txt3">
            <kbd className="font-mono bg-bg3 border border-border-custom rounded px-1 py-0.5">esc</kbd>
            <span>close</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
