'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import NotificationItemComponent, { NotificationItem } from './NotificationItem';

interface NotificationBellProps {
  newNotification: NotificationItem | null;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ newNotification }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:8000/notifications?page_size=20');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err) {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Add new notification when prop changes
  useEffect(() => {
    if (newNotification) {
      setNotifications(prev => [newNotification, ...prev].slice(0, 20));
      setUnreadCount(prev => prev + 1);
    }
  }, [newNotification]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await fetch('http://localhost:8000/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch('http://localhost:8000/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      // silent
    }
  };

  const handleClearAll = async () => {
    try {
      // Delete all visible notifications
      await Promise.all(
        notifications.map(n =>
          fetch(`http://localhost:8000/notifications/${n.id}`, { method: 'DELETE' })
        )
      );
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      // silent
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) fetchNotifications(); }}
        className="relative w-7 h-7 rounded-md border border-border-custom bg-transparent flex items-center justify-center cursor-pointer text-txt3 hover:text-txt hover:border-border2 transition-all duration-150"
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-[14px] h-[14px] stroke-current">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-red-custom text-white text-[8px] font-bold flex items-center justify-center px-1 shadow-[0_0_6px_rgba(255,80,80,0.5)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-[340px] bg-bg2 border border-border-custom rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.5)] z-[90] overflow-hidden animate-fadein">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-custom">
            <div className="text-[11px] font-bold tracking-[0.08em] text-txt uppercase">Notifications</div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[9px] text-cyan-custom hover:text-cyan-custom/80 font-mono transition-colors"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-[9px] text-txt3 hover:text-red-custom font-mono transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-txt3 text-[10px] font-mono">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-txt3">
                <span className="text-xl mb-1">🔔</span>
                <span className="text-[10px] font-mono">No notifications</span>
              </div>
            ) : (
              notifications.map(n => (
                <NotificationItemComponent
                  key={n.id}
                  notification={n}
                  onMarkRead={handleMarkRead}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border-custom px-3 py-1.5 text-center">
              <button
                onClick={() => { fetchNotifications(); }}
                className="text-[9px] text-txt3 hover:text-cyan-custom font-mono transition-colors"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
