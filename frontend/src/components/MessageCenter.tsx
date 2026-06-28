'use client';
import { API_BASE } from '../utils/api';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Agent } from '@/types';

interface Message {
  id: string;
  type: 'direct' | 'broadcast' | 'delegation';
  from_agent_id: string;
  to_agent_id: string | null;
  subject: string;
  body: string;
  metadata: any;
  read: boolean;
  created_at: string;
}

interface Conversation {
  agent_id: string;
  last_message_at: string;
  message_count: number;
}

interface MessageCenterProps {
  agents: Agent[];
  lastAgentMessage?: any;
}


export default function MessageCenter({ agents, lastAgentMessage }: MessageCenterProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'inbox' | 'send'>('inbox');
  const [filterType, setFilterType] = useState<string>('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // Send form state
  const [sendTo, setSendTo] = useState('');
  const [sendType, setSendType] = useState<'direct' | 'broadcast' | 'delegation'>('direct');
  const [sendSubject, setSendSubject] = useState('');
  const [sendBody, setSendBody] = useState('');
  const [sending, setSending] = useState(false);

  // Thread view
  const [threadWith, setThreadWith] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);

  // Select first agent by default
  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  // Fetch messages when agent changes
  useEffect(() => {
    if (!selectedAgentId) return;
    fetchMessages();
    fetchConversations();
  }, [selectedAgentId, filterType]);

  // Refresh on new real-time message
  useEffect(() => {
    if (lastAgentMessage && selectedAgentId) {
      const msg = lastAgentMessage;
      if (
        msg.to_agent_id === selectedAgentId ||
        msg.from_agent_id === selectedAgentId ||
        msg.type === 'broadcast'
      ) {
        setMessages(prev => [msg, ...prev].slice(0, 200));
      }
      fetchConversations();
    }
  }, [lastAgentMessage]);

  const fetchMessages = useCallback(async () => {
    if (!selectedAgentId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filterType) params.set('msg_type', filterType);
      const res = await fetch(`${API_BASE}/messages/${selectedAgentId}?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedAgentId, filterType]);

  const fetchConversations = useCallback(async () => {
    if (!selectedAgentId) return;
    try {
      const res = await fetch(`${API_BASE}/messages/${selectedAgentId}/conversations`);
      if (res.ok) {
        setConversations(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  }, [selectedAgentId]);

  const fetchThread = useCallback(async (otherAgentId: string) => {
    if (!selectedAgentId) return;
    setThreadWith(otherAgentId);
    try {
      const res = await fetch(`${API_BASE}/messages/${selectedAgentId}/thread/${otherAgentId}`);
      if (res.ok) {
        setThreadMessages(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch thread:', err);
    }
  }, [selectedAgentId]);

  const handleSend = useCallback(async () => {
    if (!selectedAgentId || !sendSubject.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_agent_id: selectedAgentId,
          to_agent_id: sendType === 'broadcast' ? null : sendTo || null,
          type: sendType,
          subject: sendSubject,
          body: sendBody,
        }),
      });
      if (res.ok) {
        setSendSubject('');
        setSendBody('');
        setSendTo('');
        setActiveTab('inbox');
        fetchMessages();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }, [selectedAgentId, sendTo, sendType, sendSubject, sendBody]);

  const handleMarkRead = useCallback(async (msgId: string) => {
    try {
      await fetch(`${API_BASE}/messages/${msgId}/read`, { method: 'POST' });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, read: true } : m));
    } catch (err) {
      console.error('Failed to mark message read:', err);
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    if (!selectedAgentId) return;
    try {
      await fetch(`${API_BASE}/messages/${selectedAgentId}/read-all`, { method: 'POST' });
      setMessages(prev => prev.map(m => ({ ...m, read: true })));
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  }, [selectedAgentId]);

  const getAgentName = (id: string) => agents.find(a => a.id === id)?.name || id;
  const getAgentColor = (id: string) => agents.find(a => a.id === id)?.color || '#6366F1';

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'direct': return { label: 'DIRECT', color: 'cyan' };
      case 'broadcast': return { label: 'BROADCAST', color: 'amber' };
      case 'delegation': return { label: 'DELEGATION', color: 'purple' };
      default: return { label: type.toUpperCase(), color: 'gray' };
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="view on h-full animate-fadein flex">
      {/* Left Panel - Agent/Conversation List */}
      <div className="w-[260px] flex-shrink-0 border-r border-border-custom flex flex-col bg-bg2">
        <div className="p-3 border-b border-border-custom">
          <div className="text-[9px] text-txt3 tracking-[0.18em] uppercase mb-2">
            Agent Messages
          </div>
          <select
            value={selectedAgentId || ''}
            onChange={(e) => { setSelectedAgentId(e.target.value); setThreadWith(null); }}
            className="w-full bg-bg3 border border-border-custom rounded px-2 py-1.5 text-[11px] text-txt font-mono focus:border-cyan-custom/50 focus:outline-none"
          >
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="p-4 text-center text-[10px] text-txt3">No conversations yet</div>
          )}
          {conversations.map(conv => (
            <div
              key={conv.agent_id}
              onClick={() => fetchThread(conv.agent_id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer border-b border-border-custom/30 transition-colors ${
                threadWith === conv.agent_id ? 'bg-cyan-custom/10' : 'hover:bg-white/[0.02]'
              }`}
            >
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{
                  backgroundColor: `${getAgentColor(conv.agent_id)}22`,
                  color: getAgentColor(conv.agent_id),
                  border: `1px solid ${getAgentColor(conv.agent_id)}44`,
                }}
              >
                {getAgentName(conv.agent_id)[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-txt truncate">{getAgentName(conv.agent_id)}</div>
                <div className="text-[9px] text-txt3">{conv.message_count} messages</div>
              </div>
              <div className="text-[8px] text-txt3 font-mono">{formatDate(conv.last_message_at)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Center Panel - Messages */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex-shrink-0 border-b border-border-custom bg-bg2 px-3 py-2 flex items-center gap-2">
          <div
            onClick={() => setActiveTab('inbox')}
            className={`px-2.5 py-1 rounded text-[9px] font-mono font-bold cursor-pointer tracking-wider ${
              activeTab === 'inbox' ? 'bg-cyan-custom/15 text-cyan-custom border border-cyan-custom/30' : 'text-txt3 hover:text-txt2'
            }`}
          >
            INBOX
          </div>
          <div
            onClick={() => setActiveTab('send')}
            className={`px-2.5 py-1 rounded text-[9px] font-mono font-bold cursor-pointer tracking-wider ${
              activeTab === 'send' ? 'bg-grn-custom/15 text-grn-custom border border-grn-custom/30' : 'text-txt3 hover:text-txt2'
            }`}
          >
            COMPOSE
          </div>
          <div className="flex-1" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-bg3 border border-border-custom rounded px-2 py-1 text-[9px] text-txt2 font-mono focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="direct">Direct</option>
            <option value="broadcast">Broadcast</option>
            <option value="delegation">Delegation</option>
          </select>
          <button
            onClick={handleMarkAllRead}
            className="px-2 py-1 text-[9px] font-mono text-txt3 hover:text-cyan-custom transition-colors"
          >
            Mark All Read
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'inbox' && (
            <>
              {loading && (
                <div className="flex items-center justify-center h-32">
                  <div className="w-5 h-5 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
                </div>
              )}
              {!loading && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-txt3">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.2" className="w-10 h-10 stroke-current mb-2 opacity-30">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <div className="text-[11px]">No messages yet</div>
                </div>
              )}

              {/* Thread view */}
              {threadWith && (
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => { setThreadWith(null); setThreadMessages([]); }}
                      className="text-[9px] text-txt3 hover:text-cyan-custom font-mono"
                    >
                      ← BACK TO INBOX
                    </button>
                    <div className="text-[11px] font-medium text-txt">
                      Thread with {getAgentName(threadWith)}
                    </div>
                  </div>
                  {threadMessages.map(msg => (
                    <div
                      key={msg.id}
                      className={`mb-2 p-2.5 rounded-lg border ${
                        msg.from_agent_id === selectedAgentId
                          ? 'bg-cyan-custom/5 border-cyan-custom/20 ml-8'
                          : 'bg-bg3 border-border-custom mr-8'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold font-mono" style={{ color: getAgentColor(msg.from_agent_id) }}>
                          {getAgentName(msg.from_agent_id)}
                        </span>
                        <span className="text-[8px] text-txt3 font-mono">{formatTime(msg.created_at)}</span>
                        <TypeBadge type={msg.type} />
                      </div>
                      {msg.subject && <div className="text-[11px] font-medium text-txt mb-0.5">{msg.subject}</div>}
                      {msg.body && <div className="text-[10px] text-txt2 whitespace-pre-wrap">{msg.body}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Message list */}
              {!threadWith && messages.map(msg => {
                const badge = getTypeBadge(msg.type);
                return (
                  <div
                    key={msg.id}
                    onClick={() => !msg.read && handleMarkRead(msg.id)}
                    className={`px-3 py-2.5 border-b border-border-custom/30 cursor-pointer transition-colors ${
                      !msg.read ? 'bg-cyan-custom/[0.04] hover:bg-cyan-custom/[0.08]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {!msg.read && <span className="w-[5px] h-[5px] rounded-full bg-cyan-custom flex-shrink-0" />}
                      <span
                        className="text-[10px] font-bold font-mono"
                        style={{ color: getAgentColor(msg.from_agent_id) }}
                      >
                        {getAgentName(msg.from_agent_id)}
                      </span>
                      {msg.to_agent_id && (
                        <>
                          <span className="text-txt3 text-[9px]">→</span>
                          <span
                            className="text-[10px] font-mono"
                            style={{ color: getAgentColor(msg.to_agent_id) }}
                          >
                            {getAgentName(msg.to_agent_id)}
                          </span>
                        </>
                      )}
                      {!msg.to_agent_id && msg.type === 'broadcast' && (
                        <>
                          <span className="text-txt3 text-[9px]">→</span>
                          <span className="text-[10px] font-mono text-amber-400">ALL</span>
                        </>
                      )}
                      <TypeBadge type={msg.type} />
                      <span className="flex-1" />
                      <span className="text-[8px] text-txt3 font-mono">{formatTime(msg.created_at)}</span>
                    </div>
                    {msg.subject && (
                      <div className={`text-[11px] mb-0.5 ${!msg.read ? 'font-semibold text-txt' : 'text-txt2'}`}>
                        {msg.subject}
                      </div>
                    )}
                    {msg.body && (
                      <div className="text-[10px] text-txt3 truncate max-w-md">{msg.body}</div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {activeTab === 'send' && (
            <div className="p-4 max-w-lg">
              <div className="text-[9px] text-txt3 tracking-[0.18em] uppercase mb-4 flex items-center gap-2">
                Compose Message
                <div className="flex-1 h-px bg-border-custom" />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[9px] text-txt3 uppercase tracking-wider mb-1">Type</label>
                  <div className="flex gap-1.5">
                    {(['direct', 'broadcast', 'delegation'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setSendType(t)}
                        className={`px-3 py-1.5 rounded text-[9px] font-mono font-bold tracking-wider transition-colors ${
                          sendType === t
                            ? t === 'direct' ? 'bg-cyan-custom/15 text-cyan-custom border border-cyan-custom/30'
                              : t === 'broadcast' ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30'
                              : 'bg-purple-400/15 text-purple-400 border border-purple-400/30'
                            : 'bg-bg3 border border-border-custom text-txt3 hover:text-txt2'
                        }`}
                      >
                        {t.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {sendType !== 'broadcast' && (
                  <div>
                    <label className="block text-[9px] text-txt3 uppercase tracking-wider mb-1">To Agent</label>
                    <select
                      value={sendTo}
                      onChange={(e) => setSendTo(e.target.value)}
                      className="w-full bg-bg3 border border-border-custom rounded px-2.5 py-1.5 text-[11px] text-txt font-mono focus:border-cyan-custom/50 focus:outline-none"
                    >
                      <option value="">Select agent...</option>
                      {agents.filter(a => a.id !== selectedAgentId).map(a => (
                        <option key={a.id} value={a.id}>{a.name} — {a.role}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[9px] text-txt3 uppercase tracking-wider mb-1">Subject</label>
                  <input
                    type="text"
                    value={sendSubject}
                    onChange={(e) => setSendSubject(e.target.value)}
                    placeholder="Message subject..."
                    className="w-full bg-bg3 border border-border-custom rounded px-2.5 py-1.5 text-[11px] text-txt font-mono focus:border-cyan-custom/50 focus:outline-none placeholder:text-txt3"
                  />
                </div>

                <div>
                  <label className="block text-[9px] text-txt3 uppercase tracking-wider mb-1">Body</label>
                  <textarea
                    value={sendBody}
                    onChange={(e) => setSendBody(e.target.value)}
                    placeholder="Message content..."
                    rows={5}
                    className="w-full bg-bg3 border border-border-custom rounded px-2.5 py-1.5 text-[11px] text-txt font-mono focus:border-cyan-custom/50 focus:outline-none resize-none placeholder:text-txt3"
                  />
                </div>

                <button
                  onClick={handleSend}
                  disabled={sending || !sendSubject.trim()}
                  className="w-full py-2 rounded-lg text-[10px] font-bold font-mono bg-grn-custom/15 border border-grn-custom/30 text-grn-custom hover:bg-grn-custom/25 transition-colors tracking-[0.06em] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? 'SENDING...' : sendType === 'broadcast' ? '📡 BROADCAST TO ALL' : sendType === 'delegation' ? '📋 DELEGATE TASK' : '📨 SEND MESSAGE'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const config: Record<string, { bg: string; text: string; border: string }> = {
    direct: { bg: 'bg-cyan-custom/10', text: 'text-cyan-custom', border: 'border-cyan-custom/25' },
    broadcast: { bg: 'bg-amber-400/10', text: 'text-amber-400', border: 'border-amber-400/25' },
    delegation: { bg: 'bg-purple-400/10', text: 'text-purple-400', border: 'border-purple-400/25' },
  };
  const c = config[type] || config.direct;
  return (
    <span className={`px-1.5 py-[1px] rounded text-[7px] font-bold font-mono uppercase border ${c.bg} ${c.text} ${c.border}`}>
      {type}
    </span>
  );
}
