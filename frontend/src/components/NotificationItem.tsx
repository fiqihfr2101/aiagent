'use client';

import React, { memo } from 'react';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  description: string;
  read: boolean;
  data: Record<string, any> | null;
  created_at: string;
  icon: string;
  color: string;
}

interface NotificationItemProps {
  notification: NotificationItem;
  onMarkRead: (id: string) => void;
}

function timeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const colorMap: Record<string, string> = {
  green: 'text-grn-custom',
  red: 'text-red-custom',
  amber: 'text-amber-400',
  blue: 'text-cyan-custom',
};

const bgColorMap: Record<string, string> = {
  green: 'bg-grn-custom/10 border-grn-custom/20',
  red: 'bg-red-custom/10 border-red-custom/20',
  amber: 'bg-amber-400/10 border-amber-400/20',
  blue: 'bg-cyan-custom/10 border-cyan-custom/20',
};

const NotificationItemComponent: React.FC<NotificationItemProps> = memo(({ notification, onMarkRead }) => {
  const { id, icon, title, description, read, created_at, color } = notification;

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-all duration-150 border-b border-border-custom/30 ${
        read ? 'opacity-60' : 'bg-cyan-custom/[0.03]'
      } hover:bg-white/[0.03]`}
      onClick={() => !read && onMarkRead(id)}
    >
      <div className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-sm border ${bgColorMap[color] || bgColorMap.blue}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[11px] font-semibold leading-tight truncate ${read ? 'text-txt3' : 'text-txt'}`}>
          {title}
        </div>
        {description && (
          <div className="text-[10px] text-txt3 mt-0.5 leading-snug line-clamp-2">{description}</div>
        )}
        <div className="text-[9px] text-txt2 mt-1 font-mono">{timeAgo(created_at)}</div>
      </div>
      {!read && (
        <div className="flex-shrink-0 mt-1.5">
          <div className={`w-[6px] h-[6px] rounded-full ${colorMap[color] || 'bg-cyan-custom'}`} style={{ backgroundColor: 'var(--cyan)' }} />
        </div>
      )}
    </div>
  );
});

NotificationItemComponent.displayName = 'NotificationItemComponent';

export default NotificationItemComponent;
