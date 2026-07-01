'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '@/utils/api';
import { formatFileSize, MAX_FILE_SIZE, isImageType } from '@/utils/formatFileSize';
import CollaborationCard from './CollaborationCard';
import CodeExecutionCard from './CodeExecutionCard';

// ─── Types ───────────────────────────────────────────────────────

interface ChatFile {
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
}

interface AgentContribution {
  id: string;
  name: string;
  role?: string;
  color: string;
  subtask: string;
  response: string;
  success: boolean;
}

interface ExecutionResult {
  success: boolean;
  language: string;
  code: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

interface CodeExecution {
  language: string;
  code: string;
  auto_executed: boolean;
  result: ExecutionResult | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  files?: ChatFile[];
  agent?: {
    id: string;
    name: string;
    role: string;
    color: string;
  };
  timestamp: string;
  isLoading?: boolean;
  isStreaming?: boolean;
  knowledgeUsed?: boolean;
  collaboration?: boolean;
  collaborationAgents?: AgentContribution[];
  primaryAgent?: string;
  executions?: CodeExecution[];
}

interface ChatResponse {
  agent: string;
  agent_name: string;
  agent_role: string;
  agent_color: string;
  response: string;
  files_processed: string[];
  conversation_id: string;
  collaboration?: boolean;
  agents?: AgentContribution[];
  primary_agent?: string;
}

// ─── Helper: Generate unique ID ──────────────────────────────────

let _msgId = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++_msgId}`;
}

// ─── File Icon Helpers ───────────────────────────────────────────

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return '🖼️';
  if (type.includes('pdf')) return '📄';
  if (type.includes('word') || type.includes('doc')) return '📝';
  if (type.includes('json')) return '📋';
  if (type.includes('yaml') || type.includes('yml')) return '⚙️';
  if (type.includes('javascript') || type.includes('typescript')) return '📜';
  if (type.includes('python')) return '🐍';
  if (type.includes('text')) return '📃';
  return '📎';
}

// ─── Agent Avatar Component ──────────────────────────────────────

function AgentAvatar({ name, color }: { name: string; color: string }) {
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs flex-shrink-0"
      style={{
        backgroundColor: `${color}22`,
        color: color,
        border: `1px solid ${color}55`,
      }}
    >
      {name[0]}
    </div>
  );
}

// ─── Typing Indicator ────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1">
      <div className="w-1.5 h-1.5 rounded-full bg-cyan-custom animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-1.5 h-1.5 rounded-full bg-cyan-custom animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-1.5 h-1.5 rounded-full bg-cyan-custom animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

// ─── Streaming Cursor ────────────────────────────────────────────

function StreamingCursor() {
  return (
    <span className="inline-block w-2 h-4 ml-0.5 bg-cyan-custom/70 animate-pulse align-text-bottom" />
  );
}

// ─── Copy Icon SVG ───────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-3.5 h-3.5 stroke-current">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

// ─── Regenerate Icon SVG ─────────────────────────────────────────

function RegenerateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-3.5 h-3.5 stroke-current">
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </svg>
  );
}

// ─── File Preview Component ──────────────────────────────────────

function FilePreview({ file, compact }: { file: ChatFile; compact?: boolean }) {
  const isImage = isImageType(file.type);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-bg3 border border-border-custom rounded-md text-[10px] text-txt2">
        <span>{getFileIcon(file.type)}</span>
        <span className="truncate max-w-[120px]">{file.name}</span>
        <span className="text-txt3">{formatFileSize(file.size)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-bg3 border border-border-custom rounded-lg">
      {isImage && file.previewUrl ? (
        <img
          src={file.previewUrl}
          alt={file.name}
          className="w-12 h-12 object-cover rounded-md border border-border-custom"
        />
      ) : (
        <div className="w-12 h-12 rounded-md bg-bg4 border border-border-custom flex items-center justify-center text-xl">
          {getFileIcon(file.type)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-txt truncate">{file.name}</div>
        <div className="text-[10px] text-txt3">{formatFileSize(file.size)}</div>
      </div>
    </div>
  );
}

// ─── Attached File Chip (with preview, remove button) ────────────

function AttachedFileChip({
  file,
  onRemove,
}: {
  file: ChatFile;
  onRemove: () => void;
}) {
  const isImage = isImageType(file.type);

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-bg3 border border-border-custom rounded-lg group relative">
      {/* Thumbnail or icon */}
      {isImage && file.previewUrl ? (
        <img
          src={file.previewUrl}
          alt={file.name}
          className="w-10 h-10 object-cover rounded-md border border-border-custom flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-md bg-bg4 border border-border-custom flex items-center justify-center text-lg flex-shrink-0">
          {getFileIcon(file.type)}
        </div>
      )}
      {/* Name + size */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-txt truncate max-w-[140px]">{file.name}</div>
        <div className="text-[9px] text-txt3">{formatFileSize(file.size)}</div>
      </div>
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 w-5 h-5 rounded-full bg-bg4 border border-border-custom flex items-center justify-center text-txt3 hover:text-red-custom hover:border-red-custom/40 transition-all text-xs"
        title="Remove file"
      >
        ×
      </button>
    </div>
  );
}

// ─── Message Actions (copy, regenerate) ──────────────────────────

function MessageActions({
  content,
  onRegenerate,
  isAgent,
}: {
  content: string;
  onRegenerate?: () => void;
  isAgent: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [content]);

  return (
    <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1 px-1.5 py-1 rounded-md text-txt3 hover:text-cyan-custom hover:bg-cyan-custom/10 transition-colors"
        title={copied ? 'Copied!' : 'Copy message'}
      >
        <CopyIcon />
        <span className="text-[9px]">{copied ? 'Copied!' : 'Copy'}</span>
      </button>
      {isAgent && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="flex items-center gap-1 px-1.5 py-1 rounded-md text-txt3 hover:text-cyan-custom hover:bg-cyan-custom/10 transition-colors"
          title="Regenerate response"
        >
          <RegenerateIcon />
          <span className="text-[9px]">Regenerate</span>
        </button>
      )}
    </div>
  );
}

// ─── Markdown-lite Renderer ──────────────────────────────────────

function renderContent(content: string): React.ReactNode {
  // Simple markdown rendering: code blocks, bold, inline code
  const parts: React.ReactNode[] = [];
  const lines = content.split('\n');
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        parts.push(
          <pre key={`code-${i}`} className="bg-bg5 border border-border-custom rounded-lg p-3 my-2 overflow-x-auto">
            <code className="text-[11px] font-mono text-cyan-custom/80">{codeBuffer.join('\n')}</code>
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Inline formatting
    let formatted: React.ReactNode = line;
    // Bold
    formatted = (formatted as string).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Inline code
    formatted = (formatted as string).replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-bg4 border border-border-custom rounded text-[11px] font-mono text-cyan-custom/80">$1</code>');

    if (line === '') {
      parts.push(<br key={`br-${i}`} />);
    } else {
      parts.push(
        <div
          key={`line-${i}`}
          className="leading-relaxed"
          dangerouslySetInnerHTML={{ __html: formatted as string }}
        />
      );
    }
  }

  // Close unclosed code block
  if (inCodeBlock && codeBuffer.length > 0) {
    parts.push(
      <pre key="code-unclosed" className="bg-bg5 border border-border-custom rounded-lg p-3 my-2 overflow-x-auto">
        <code className="text-[11px] font-mono text-cyan-custom/80">{codeBuffer.join('\n')}</code>
      </pre>
    );
  }

  return <>{parts}</>;
}

// ─── Main ChatInterface Component ────────────────────────────────

interface ChatInterfaceProps {
  agents?: Array<{ id: string; name: string; role: string; color: string }>;
  conversationId?: string | null;
}

export default function ChatInterface({ agents, conversationId: propConversationId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<ChatFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(propConversationId || null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const realFilesRef = useRef<File[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserPromptRef = useRef<string>('');
  const lastUserFilesRef = useRef<File[]>([]);
  const router = useRouter();

  // Sync conversationId from props
  useEffect(() => {
    if (propConversationId !== undefined) {
      setConversationId(propConversationId);
    }
  }, [propConversationId]);

  // Load conversation from backend when conversationId prop changes
  useEffect(() => {
    if (!propConversationId) {
      // New conversation - show welcome message
      setMessages([{
        id: nextId(),
        role: 'system',
        content: 'Welcome to the AFILABS Chat. Type a prompt and I\'ll route it to the best agent for the job. You can also attach files or drag & drop them.',
        timestamp: new Date().toISOString(),
      }]);
      setConversationId(null);
      return;
    }

    // Load existing conversation from backend
    setIsLoadingConversation(true);
    const token = localStorage.getItem('access_token');
    const hdrs: Record<string, string> = {};
    if (token) hdrs['Authorization'] = `Bearer ${token}`;

    fetch(`${API_BASE}/chat/conversations/${propConversationId}`, { headers: hdrs })
      .then(res => {
        if (!res.ok) throw new Error('Conversation not found');
        return res.json();
      })
      .then(data => {
        const loadedMessages: ChatMessage[] = (data.messages || []).map((msg: any) => ({
          id: msg.id,
          role: msg.role as 'user' | 'agent' | 'system',
          content: msg.content,
          files: (msg.files || []).map((name: string) => ({ name, type: 'text/plain', size: 0 })),
          agent: msg.agent_name ? {
            id: msg.agent_name.toLowerCase(),
            name: msg.agent_name,
            role: msg.agent_role || '',
            color: '#00D4AA',
          } : undefined,
          timestamp: msg.created_at,
        }));
        if (loadedMessages.length === 0) {
          loadedMessages.push({
            id: nextId(),
            role: 'system',
            content: 'This conversation is empty. Start typing to begin.',
            timestamp: new Date().toISOString(),
          });
        }
        setMessages(loadedMessages);
        setConversationId(propConversationId);
      })
      .catch(() => {
        setMessages([{
          id: nextId(),
          role: 'system',
          content: 'Failed to load conversation. It may have been deleted.',
          timestamp: new Date().toISOString(),
        }]);
      })
      .finally(() => {
        setIsLoadingConversation(false);
      });
  }, [propConversationId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + 'px';
    }
  }, [inputValue]);

  // ─── File Handling ─────────────────────────────────────────────

  const addFiles = useCallback((files: File[]) => {
    const validFiles: File[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`File "${file.name}" exceeds the 10 MB limit (${formatFileSize(file.size)}).`);
        continue;
      }
      validFiles.push(file);
    }

    realFilesRef.current = [...realFilesRef.current, ...validFiles];
    const newFiles: ChatFile[] = validFiles.map(file => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      previewUrl: isImageType(file.type) ? URL.createObjectURL(file) : undefined,
    }));
    setAttachedFiles(prev => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => {
      const file = prev[index];
      if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    realFilesRef.current = realFilesRef.current.filter((_, i) => i !== index);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) addFiles(files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [addFiles]
  );

  // ─── Drag & Drop ───────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container (not entering a child)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) addFiles(files);
    },
    [addFiles]
  );

  // ─── Streaming Send ────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    if (isProcessing) return;

    // Store for regenerate
    lastUserPromptRef.current = trimmed;
    lastUserFilesRef.current = [...realFilesRef.current];

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: trimmed,
      files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
      timestamp: new Date().toISOString(),
    };

    const loadingMsg: ChatMessage = {
      id: nextId(),
      role: 'agent',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInputValue('');
    setAttachedFiles([]);
    setIsProcessing(true);

    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const formData = new FormData();
    formData.append('prompt', trimmed);
    if (conversationId) formData.append('conversation_id', conversationId);
    realFilesRef.current.forEach(f => formData.append('files', f));
    realFilesRef.current = [];

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers,
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let agentData: {
        agent?: string;
        agent_name?: string;
        agent_role?: string;
        agent_color?: string;
      } | null = null;
      let collabAgents: AgentContribution[] = [];
      let isCollaboration = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data: ')) continue;

          const dataStr = trimmedLine.slice(6);
          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          // Track agent metadata
          if (data.agent_name) {
            agentData = data;
          }

          // Track collaboration events
          if (data.event === 'collaboration_start' || data.event === 'agent_completed') {
            isCollaboration = true;
          }
          if (data.event === 'agent_completed' && data.agent_id) {
            collabAgents.push({
              id: data.agent_id,
              name: data.agent_name || data.agent_id,
              color: data.agent_color || '#6B7280',
              subtask: data.subtask || '',
              response: data.response || '',
              success: data.success !== false,
            });
          }
          if (data.collaboration) {
            isCollaboration = true;
          }
          if (data.agents && Array.isArray(data.agents)) {
            collabAgents = data.agents.map((a: any) => ({
              id: a.id || a.agent_id || '',
              name: a.name || a.agent_name || '',
              role: a.role || a.agent_role || '',
              color: a.color || a.agent_color || '#6B7280',
              subtask: a.subtask || '',
              response: a.response || '',
              success: a.success !== false,
            }));
          }

          // Conversation ID from server
          if (data.conversation_id) {
            setConversationId(data.conversation_id);
            if (!conversationId) {
              router.replace('/chat/' + data.conversation_id, { scroll: false });
            }
          }

          // Chunk of response
          if (data.chunk) {
            fullContent += data.chunk;
            const currentContent = fullContent;
            setMessages(prev =>
              prev.map(msg =>
                msg.id === loadingMsg.id
                  ? { ...msg, content: currentContent, isStreaming: true }
                  : msg
              )
            );
          }

          // Done signal
          if (data.done) {
            const finalContent = fullContent;
            const doneCollabAgents = data.agents ? data.agents.map((a: any) => ({
              id: a.id || a.agent_id || '',
              name: a.name || a.agent_name || '',
              role: a.role || a.agent_role || '',
              color: a.color || a.agent_color || '#6B7280',
              subtask: a.subtask || '',
              response: a.response || '',
              success: a.success !== false,
            })) : collabAgents;

            setMessages(prev =>
              prev.map(msg =>
                msg.id === loadingMsg.id
                  ? {
                      ...msg,
                      content: finalContent || 'No response received.',
                      isStreaming: false,
                      agent: agentData
                        ? {
                            id: agentData.agent || '',
                            name: agentData.agent_name || '',
                            role: agentData.agent_role || '',
                            color: agentData.agent_color || '#6B7280',
                          }
                        : msg.agent,
                      collaboration: data.collaboration || isCollaboration || doneCollabAgents.length > 0,
                      collaborationAgents: doneCollabAgents.length > 0 ? doneCollabAgents : undefined,
                      primaryAgent: data.primary_agent || 'hilman',
                      knowledgeUsed: data.knowledge_used || false,
                    }
                  : msg
              )
            );
          }

          // Execution results from code blocks
          if (data.executions && Array.isArray(data.executions)) {
            setMessages(prev =>
              prev.map(msg =>
                msg.id === loadingMsg.id
                  ? { ...msg, executions: data.executions }
                  : msg
              )
            );
          }
        }
      }

      // Final cleanup — mark as not streaming
      setMessages(prev =>
        prev.map(msg =>
          msg.id === loadingMsg.id && msg.isStreaming
            ? {
                ...msg,
                isStreaming: false,
                agent: agentData
                  ? {
                      id: agentData.agent || '',
                      name: agentData.agent_name || '',
                      role: agentData.agent_role || '',
                      color: agentData.agent_color || '#6B7280',
                    }
                  : msg.agent,
                collaboration: isCollaboration || collabAgents.length > 0,
                collaborationAgents: collabAgents.length > 0 ? collabAgents : undefined,
                primaryAgent: 'hilman',
              }
            : msg
        )
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // User cancelled — mark message as cancelled
        setMessages(prev =>
          prev.map(msg =>
            msg.id === loadingMsg.id
              ? { ...msg, content: msg.content || 'Response cancelled.', isStreaming: false }
              : msg
          )
        );
      } else {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === loadingMsg.id
              ? {
                  ...msg,
                  content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
                  isLoading: false,
                  isStreaming: false,
                  role: 'system',
                }
              : msg
          )
        );
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [inputValue, attachedFiles, isProcessing, conversationId]);

  // ─── Explicit Collaboration ────────────────────────────────────

  const handleCollaborate = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    if (isProcessing) return;

    lastUserPromptRef.current = trimmed;
    lastUserFilesRef.current = [...realFilesRef.current];

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: trimmed,
      files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
      timestamp: new Date().toISOString(),
    };

    const loadingMsg: ChatMessage = {
      id: nextId(),
      role: 'agent',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInputValue('');
    setAttachedFiles([]);
    setIsProcessing(true);

    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const formData = new FormData();
    formData.append('prompt', trimmed);
    if (conversationId) formData.append('conversation_id', conversationId);
    realFilesRef.current.forEach(f => formData.append('files', f));
    realFilesRef.current = [];

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(API_BASE + '/chat/collaborate', {
        method: 'POST',
        headers,
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Server error: ' + response.status);
      }

      const data = await response.json();
      const collabAgents: AgentContribution[] = (data.agents || []).map((a: any) => ({
        id: a.id || '',
        name: a.name || '',
        role: a.role || '',
        color: a.color || '#6B7280',
        subtask: a.subtask || '',
        response: a.response || '',
        success: a.success !== false,
      }));

      setMessages(prev =>
        prev.map(msg =>
          msg.id === loadingMsg.id
            ? {
                ...msg,
                content: data.response || 'No response received.',
                isStreaming: false,
                agent: {
                  id: 'hilman',
                  name: 'COLLABORATION',
                  role: 'Multi-Agent Collaboration',
                  color: '#00D4AA',
                },
                collaboration: true,
                collaborationAgents: collabAgents,
                primaryAgent: data.primary_agent || 'hilman',
              }
            : msg
        )
      );

      if (data.conversation_id) {
        setConversationId(data.conversation_id);
        if (!conversationId) {
          router.replace('/chat/' + data.conversation_id, { scroll: false });
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === loadingMsg.id
              ? { ...msg, content: msg.content || 'Response cancelled.', isStreaming: false }
              : msg
          )
        );
      } else {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === loadingMsg.id
              ? {
                  ...msg,
                  content: 'Error: ' + (error instanceof Error ? error.message : 'Unknown error') + '. Please try again.',
                  isLoading: false,
                  isStreaming: false,
                  role: 'system',
                }
              : msg
          )
        );
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [inputValue, attachedFiles, isProcessing, conversationId]);

  // ─── Regenerate ────────────────────────────────────────────────

  const handleRegenerate = useCallback(
    (msgId: string) => {
      if (isProcessing) return;

      // Find the last user message before this agent message
      const msgIndex = messages.findIndex(m => m.id === msgId);
      if (msgIndex < 1) return;

      // Find the preceding user message
      let userPrompt = '';
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          userPrompt = messages[i].content;
          break;
        }
      }
      if (!userPrompt) return;

      // Set the input and trigger send
      setInputValue(userPrompt);
      // Use a small timeout so the state update takes effect
      setTimeout(() => {
        // We need to trigger the send manually since setInputValue is async
        _regenerateWithPrompt(userPrompt);
      }, 50);
    },
    [messages, isProcessing]
  );

  const _regenerateWithPrompt = useCallback(
    async (prompt: string) => {
      if (isProcessing) return;

      const loadingMsg: ChatMessage = {
        id: nextId(),
        role: 'agent',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };

      setMessages(prev => [...prev, loadingMsg]);
      setInputValue('');
      setIsProcessing(true);

      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const formData = new FormData();
      formData.append('prompt', prompt);
      if (conversationId) formData.append('conversation_id', conversationId);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch(`${API_BASE}/chat/stream`, {
          method: 'POST',
          headers,
          body: formData,
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `Server error: ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let agentData: any = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('data: ')) continue;
            const dataStr = trimmedLine.slice(6);
            let data: any;
            try {
              data = JSON.parse(dataStr);
            } catch {
              continue;
            }

            if (data.agent_name) agentData = data;
            if (data.conversation_id) setConversationId(data.conversation_id);
            if (data.chunk) {
              fullContent += data.chunk;
              const currentContent = fullContent;
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === loadingMsg.id ? { ...msg, content: currentContent, isStreaming: true } : msg
                )
              );
            }
            if (data.done) {
              const finalContent = fullContent;
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === loadingMsg.id
                    ? {
                        ...msg,
                        content: finalContent || 'No response received.',
                        isStreaming: false,
                        agent: agentData
                          ? {
                              id: agentData.agent || '',
                              name: agentData.agent_name || '',
                              role: agentData.agent_role || '',
                              color: agentData.agent_color || '#6B7280',
                            }
                          : msg.agent,
                      }
                    : msg
                )
              );
            }
          }
        }

        setMessages(prev =>
          prev.map(msg =>
            msg.id === loadingMsg.id && msg.isStreaming
              ? { ...msg, isStreaming: false }
              : msg
          )
        );
      } catch (error) {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === loadingMsg.id
              ? {
                  ...msg,
                  content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
                  isLoading: false,
                  isStreaming: false,
                  role: 'system',
                }
              : msg
          )
        );
      } finally {
        setIsProcessing(false);
        abortControllerRef.current = null;
      }
    },
    [isProcessing, conversationId]
  );

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  if (isLoadingConversation) {
    return (
      <div className="flex flex-col h-full bg-bg flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
          <span className="text-[11px] text-txt3 font-mono">Loading conversation...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-bg relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* ─── Drop Zone Overlay ─────────────────────────────────── */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-bg/90 border-2 border-dashed border-cyan-custom/60 rounded-lg flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-cyan-custom/10 border border-cyan-custom/30 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" className="w-8 h-8 stroke-cyan-custom">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="text-sm text-cyan-custom font-medium">Drop files here to attach</div>
            <div className="text-xs text-txt3">Max 10 MB per file</div>
          </div>
        </div>
      )}

      {/* ─── Header ────────────────────────────────────────────── */}
      <div className="flex-shrink-0 h-[52px] bg-bg2 border-b border-border-custom flex items-center px-5 gap-3">
        <div className="w-8 h-8 rounded-lg bg-[rgba(0,212,170,0.1)] border border-[rgba(0,212,170,0.3)] flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 stroke-cyan-custom stroke-[1.6]">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div>
          <div className="text-[13px] font-semibold tracking-[0.04em] text-txt">Orchestrator Chat</div>
          <div className="text-[10px] text-txt3">Prompts are routed to the best agent automatically</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {conversationId && (
            <span className="px-2 py-0.5 rounded-md text-[9px] font-mono bg-cyan-custom/10 border border-cyan-custom/30 text-cyan-custom">
              CONV #{conversationId.slice(-6)}
            </span>
          )}
        </div>
      </div>

      {/* ─── Messages ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex gap-3 animate-fadein group ${
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            {/* Avatar */}
            {msg.role === 'agent' && msg.agent ? (
              <AgentAvatar name={msg.agent.name} color={msg.agent.color} />
            ) : msg.role === 'user' ? (
              <div className="w-8 h-8 rounded-lg bg-ind-custom/20 border border-ind-custom/40 flex items-center justify-center text-ind-custom text-xs font-bold flex-shrink-0">
                U
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-bg4 border border-border-custom flex items-center justify-center text-txt3 text-xs flex-shrink-0">
                ⚡
              </div>
            )}

            {/* Message Bubble */}
            <div
              className={`max-w-[75%] min-w-[80px] ${
                msg.role === 'user'
                  ? 'bg-ind-custom/15 border border-ind-custom/25 rounded-2xl rounded-br-md'
                  : msg.role === 'system'
                  ? 'bg-bg3 border border-border-custom rounded-2xl'
                  : 'bg-bg3 border border-border-custom rounded-2xl rounded-bl-md'
              } px-4 py-3`}
            >
              {/* Agent label */}
              {msg.role === 'agent' && msg.agent && !msg.collaboration && (
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[10px] font-bold font-mono tracking-wider"
                    style={{ color: msg.agent.color }}
                  >
                    {msg.agent.name}
                  </span>
                  <span className="text-[9px] text-txt3">·</span>
                  <span className="text-[9px] text-txt3">{msg.agent.role}</span>
                </div>
              )}
              {msg.role === 'agent' && msg.collaboration && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold font-mono tracking-wider text-cyan-custom">
                    COLLABORATION
                  </span>
                  <span className="text-[9px] text-txt3">·</span>
                  <span className="text-[9px] text-txt3">Multi-Agent</span>
                  {msg.collaborationAgents && (
                    <span className="text-[9px] text-purple-400">
                      ({msg.collaborationAgents.length} agents)
                    </span>
                  )}
                </div>
              )}

              {/* Files */}
              {msg.files && msg.files.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {msg.files.map((file, fi) => (
                    <FilePreview key={fi} file={file} compact />
                  ))}
                </div>
              )}

              {/* Content */}
              {msg.isLoading && !msg.isStreaming && !msg.content ? (
                <TypingIndicator />
              ) : msg.collaboration && msg.collaborationAgents && msg.collaborationAgents.length > 0 ? (
                <CollaborationCard
                  agents={msg.collaborationAgents}
                  primaryAgent={msg.primaryAgent}
                  combinedResponse={msg.content}
                />
              ) : (
                <div className="text-[12.5px] text-txt leading-relaxed">
                  {renderContent(msg.content)}
                  {msg.isStreaming && <StreamingCursor />}
                </div>
              )}

              {/* Code Execution Results */}
              {msg.executions && msg.executions.length > 0 && (
                <div className="mt-3 space-y-2">
                  {msg.executions.map((exec, idx) => (
                    <CodeExecutionCard
                      key={idx}
                      execution={exec}
                      agentColor={msg.agent?.color}
                    />
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <div className="mt-1.5 text-[9px] text-txt3/60">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>

              {/* Message Actions (visible on hover) */}
              {!msg.isLoading && !msg.isStreaming && msg.content && (
                <MessageActions
                  content={msg.content}
                  isAgent={msg.role === 'agent'}
                  onRegenerate={
                    msg.role === 'agent'
                      ? () => handleRegenerate(msg.id)
                      : undefined
                  }
                />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Attached Files Bar ────────────────────────────────── */}
      {attachedFiles.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 bg-bg2 border-t border-border-custom">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-txt3 flex-shrink-0">Attachments:</span>
            {attachedFiles.map((file, i) => (
              <AttachedFileChip key={i} file={file} onRemove={() => removeFile(i)} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Input Area ────────────────────────────────────────── */}
      <div className="flex-shrink-0 p-4 bg-bg2 border-t border-border-custom">
        <div className="flex items-end gap-2 bg-bg3 border border-border-custom rounded-xl px-3 py-2 focus-within:border-cyan-custom/40 transition-colors">
          {/* File Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-bg4 border border-border-custom flex items-center justify-center text-txt3 hover:text-cyan-custom hover:border-cyan-custom/30 transition-all"
            title="Attach file (images, documents, code) — Max 10 MB"
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-4 h-4 stroke-current">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.txt,.py,.js,.ts,.tsx,.jsx,.json,.yaml,.yml,.md"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Text Input */}
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything — I'll route to the right agent... (drag & drop files)"
            rows={1}
            className="flex-1 bg-transparent text-[13px] text-txt placeholder-txt3/50 resize-none outline-none min-h-[32px] max-h-[160px]"
            disabled={isProcessing}
          />

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={(!inputValue.trim() && attachedFiles.length === 0) || isProcessing}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-cyan-custom/20 border border-cyan-custom/40 flex items-center justify-center text-cyan-custom hover:bg-cyan-custom/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Send to best-fit agent"
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-cyan-custom/30 border-t-cyan-custom rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="w-4 h-4 stroke-current">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            )}
          </button>

          {/* Collaborate Button */}
          <button
            onClick={handleCollaborate}
            disabled={(!inputValue.trim() && attachedFiles.length === 0) || isProcessing}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 hover:bg-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Multi-agent collaboration (all agents work together)"
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="w-4 h-4 stroke-current">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          </button>
        </div>

        {/* Quick Agent Hints */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-[9px] text-txt3">Route to:</span>
          {[
            { name: 'HILMAN', color: '#00D4AA', hint: 'PM tasks' },
            { name: 'BAHLUL', color: '#6366F1', hint: 'Backend' },
            { name: 'DEDEN', color: '#F59E0B', hint: 'Frontend' },
            { name: 'TEDDY', color: '#EC4899', hint: 'UI Design' },
            { name: 'BUDI', color: '#22C55E', hint: 'QA/Test' },
          ].map(agent => (
            <button
              key={agent.name}
              onClick={() => {
                setInputValue(prev =>
                  prev ? prev : `@${agent.name.toLowerCase()} `
                );
                inputRef.current?.focus();
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono border transition-colors hover:bg-white/5"
              style={{
                borderColor: `${agent.color}33`,
                color: agent.color,
                backgroundColor: `${agent.color}08`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: agent.color }}
              />
              {agent.name}
              <span className="text-txt3 ml-0.5">({agent.hint})</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
