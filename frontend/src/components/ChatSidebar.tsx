'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { API_BASE, getAuthHeaders } from '@/utils/api';

// ─── Types ────────────────────────────────────────────────────────

interface ConversationSummary {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  first_message: string | null;
  message_count: number;
}

interface ChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

// ─── Date Grouping Helper ─────────────────────────────────────────

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo) return 'Last 7 days';
  return 'Older';
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function truncate(str: string, len: number): string {
  if (!str) return 'New conversation';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// ─── ChatSidebar Component ────────────────────────────────────────

export default function ChatSidebar({ isOpen, onToggle }: ChatSidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Extract active conversation ID from pathname
  const activeConversationId = useMemo(() => {
    const match = pathname.match(/^\/chat\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/chat/conversations`, { headers });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Refetch when active conversation changes (new messages added)
  useEffect(() => {
    if (activeConversationId) {
      // Slight delay to let the backend persist
      const timer = setTimeout(fetchConversations, 2000);
      return () => clearTimeout(timer);
    }
  }, [activeConversationId, fetchConversations]);

  // Delete conversation
  const handleDelete = useCallback(async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;

    setDeletingId(convId);
    try {
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/chat/conversations/${convId}`, {
        method: 'DELETE',
        headers,
      });

      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== convId));
        // If we deleted the active conversation, navigate to /chat
        if (activeConversationId === convId) {
          router.push('/chat');
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    } finally {
      setDeletingId(null);
    }
  }, [activeConversationId, router]);

  // New chat
  const handleNewChat = useCallback(() => {
    router.push('/chat');
  }, [router]);

  // Group conversations by date
  const grouped = useMemo(() => {
    const groups: Record<string, ConversationSummary[]> = {};
    for (const conv of conversations) {
      const group = getDateGroup(conv.updated_at);
      if (!groups[group]) groups[group] = [];
      groups[group].push(conv);
    }
    return groups;
  }, [conversations]);

  const groupOrder = ['Today', 'Yesterday', 'Last 7 days', 'Older'];

  if (!isOpen) {
    return (
      <div className="flex-shrink-0 w-10 bg-bg2 border-r border-border-custom flex flex-col items-center py-3">
        <button
          onClick={onToggle}
          className="w-7 h-7 rounded-md border border-border-custom bg-bg3 flex items-center justify-center text-txt3 hover:text-cyan-custom hover:border-cyan-custom/30 transition-all mb-3"
          title="Open conversation history"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-3.5 h-3.5 stroke-current">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <button
          onClick={handleNewChat}
          className="w-7 h-7 rounded-md bg-cyan-custom/10 border border-cyan-custom/30 flex items-center justify-center text-cyan-custom hover:bg-cyan-custom/20 transition-all"
          title="New Chat"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="w-3.5 h-3.5 stroke-current">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 w-[260px] bg-bg2 border-r border-border-custom flex flex-col h-full animate-fadein">
      {/* Header */}
      <div className="flex-shrink-0 h-[52px] border-b border-border-custom flex items-center px-3 gap-2">
        <button
          onClick={onToggle}
          className="w-7 h-7 rounded-md border border-border-custom bg-bg3 flex items-center justify-center text-txt3 hover:text-cyan-custom hover:border-cyan-custom/30 transition-all"
          title="Close sidebar"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-3.5 h-3.5 stroke-current">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-[11px] font-semibold tracking-[0.06em] text-txt2 uppercase">History</span>
        <button
          onClick={handleNewChat}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono bg-cyan-custom/10 border border-cyan-custom/30 text-cyan-custom hover:bg-cyan-custom/20 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="w-3 h-3 stroke-current">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8 px-4">
            <div className="text-txt3 text-[11px] mb-2">No conversations yet</div>
            <div className="text-txt3/50 text-[10px]">Start a new chat to begin</div>
          </div>
        ) : (
          groupOrder.map(group => {
            const convs = grouped[group];
            if (!convs || convs.length === 0) return null;
            return (
              <div key={group} className="mb-1">
                <div className="px-3 py-1.5 text-[9px] font-bold text-txt3 tracking-[0.14em] uppercase">
                  {group}
                </div>
                {convs.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => router.push(`/chat/${conv.id}`)}
                    className={`group flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-all duration-150 mx-1 rounded-md ${
                      activeConversationId === conv.id
                        ? 'bg-cyan-custom/10 border border-cyan-custom/20'
                        : 'hover:bg-white/[0.03] border border-transparent'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-[11px] font-medium truncate ${
                        activeConversationId === conv.id ? 'text-cyan-custom' : 'text-txt'
                      }`}>
                        {truncate(conv.first_message || '', 35)}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-txt3">
                          {formatTime(conv.updated_at)}
                        </span>
                        <span className="text-[9px] text-txt3/50">
                          {conv.message_count} msg{conv.message_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(conv.id, e)}
                      disabled={deletingId === conv.id}
                      className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-txt3/0 group-hover:text-txt3 hover:text-red-custom hover:bg-red-custom/10 transition-all"
                      title="Delete conversation"
                    >
                      {deletingId === conv.id ? (
                        <div className="w-3 h-3 border border-red-custom/30 border-t-red-custom rounded-full animate-spin" />
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-3 h-3 stroke-current">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
