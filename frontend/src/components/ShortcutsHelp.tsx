'use client';

import React from 'react';
import { SHORTCUTS, formatShortcut } from '@/hooks/useKeyboardShortcuts';

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShortcutsHelp: React.FC<ShortcutsHelpProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // Group shortcuts by category
  const grouped = SHORTCUTS.reduce<Record<string, typeof SHORTCUTS>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center animate-fadein">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[400px] mx-4 bg-bg2 border border-border-custom rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-custom">
          <div className="flex items-center gap-2">
            <span className="text-[14px]">⌨️</span>
            <span className="text-[12px] font-semibold text-txt tracking-[0.06em]">Keyboard Shortcuts</span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md border border-border-custom text-txt3 hover:text-txt hover:border-border2 transition-colors flex items-center justify-center text-[10px]"
          >
            ✕
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
          {Object.entries(grouped).map(([category, shortcuts]) => (
            <div key={category}>
              <div className="text-[9px] text-txt3 uppercase tracking-[0.14em] font-semibold mb-2">
                {category}
              </div>
              <div className="space-y-1.5">
                {shortcuts.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="text-[11px] text-txt2">{shortcut.description}</span>
                    <kbd className="text-[10px] font-mono text-cyan-custom bg-bg3 border border-border-custom rounded px-2 py-0.5">
                      {formatShortcut(shortcut)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border-custom bg-bg3/50">
          <div className="text-[9px] text-txt3 text-center">
            Press <kbd className="font-mono bg-bg3 border border-border-custom rounded px-1 py-0.5 mx-0.5">Ctrl+K</kbd> to open command palette
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsHelp;
