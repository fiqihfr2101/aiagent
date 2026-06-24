'use client';

import { useEffect, useCallback, useRef } from 'react';

interface ShortcutHandlers {
  onCommandPalette?: () => void;
  onNewAgent?: () => void;
  onNewTask?: () => void;
  onShortcutsHelp?: () => void;
  onEscape?: () => void;
}

interface ShortcutDef {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  category: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { key: 'k', ctrl: true, description: 'Open command palette', category: 'Navigation' },
  { key: 'n', ctrl: true, description: 'New agent', category: 'Actions' },
  { key: 't', ctrl: true, description: 'Dispatch new task', category: 'Actions' },
  { key: '/', ctrl: true, description: 'Show keyboard shortcuts', category: 'Help' },
  { key: 'Escape', description: 'Close modal / dismiss', category: 'Navigation' },
];

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      // Only allow Escape in inputs
      if (e.key === 'Escape') {
        handlersRef.current.onEscape?.();
      }
      return;
    }

    // Ctrl+K — Command palette
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      handlersRef.current.onCommandPalette?.();
      return;
    }

    // Ctrl+N — New agent
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      handlersRef.current.onNewAgent?.();
      return;
    }

    // Ctrl+T — New task
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      handlersRef.current.onNewTask?.();
      return;
    }

    // Ctrl+/ — Shortcuts help
    if (e.ctrlKey && e.key === '/') {
      e.preventDefault();
      handlersRef.current.onShortcutsHelp?.();
      return;
    }

    // Escape — Close modals
    if (e.key === 'Escape') {
      handlersRef.current.onEscape?.();
      return;
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Utility to format shortcut for display
export function formatShortcut(shortcut: ShortcutDef): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.alt) parts.push('Alt');
  parts.push(shortcut.key === 'Escape' ? 'Esc' : shortcut.key.toUpperCase());
  return parts.join('+');
}
