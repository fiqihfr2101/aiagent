export type AgentStatus = 'active' | 'sleeping' | 'offline';

export interface Agent {
  id: string;
  name: string;
  role: string;
  model?: string;
  status: AgentStatus;
  task: string;
  seen: string;
  uptime: string;
  hb: string;
  color: string;
}

export interface FeedItem {
  ts: string;
  agent: string;
  color: string;
  msg: string;
}

export interface Task {
  title: string;
  agent: string;
  prio: 'p1' | 'p2' | 'p3';
}

export interface Tasks {
  queue: Task[];
  inprogress: Task[];
  review: Task[];
  done: Task[];
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export type LogEntry = [string, string, LogLevel, string]; // [timestamp, agent, level, message]

export interface Memory {
  id?: string;
  type: 'fact' | 'proc' | 'ctx' | 'ref';
  title: string;
  body: string;
  ts: string;
  src: string;
  importance?: number;
  shared?: boolean;
  archived?: boolean;
  expires_at?: string;
}

// ─── Task Dispatch Types ─────────────────────────────────────────

export type TaskStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED';
export type TaskPriority = 'P1' | 'P2' | 'P3';

export interface DispatchTask {
  id: string;
  agent_id: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  duration?: number;
  result?: string;
  tokens_used: number;
  workflow_id?: string;
}

export interface TaskHistoryResponse {
  tasks: DispatchTask[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface TaskCounts {
  [agent_id: string]: number;
}

// ─── Structured Log Types ───────────────────────────────────────
export interface TaskLog {
  id: string;
  task_id: string | null;
  agent_id: string | null;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG';
  message: string;
  timestamp: string;
  request_id?: string | null;
}

export interface TaskLogsResponse {
  logs: TaskLog[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Message Bus Types ──────────────────────────────────────────
export type MessageType = 'direct' | 'broadcast' | 'delegation';

export interface AgentMessage {
  id: string;
  type: MessageType;
  from_agent_id: string;
  to_agent_id: string | null;
  subject: string;
  body: string;
  metadata: Record<string, any> | null;
  read: boolean;
  created_at: string;
}

export interface MessagesResponse {
  messages: AgentMessage[];
  total: number;
  limit: number;
  offset: number;
}

export interface Conversation {
  agent_id: string;
  last_message_at: string;
  message_count: number;
}

// ─── Advanced Memory Types ──────────────────────────────────────

export interface MemorySearchResult {
  id: string;
  agent_id: string;
  type: 'fact' | 'proc' | 'ctx' | 'ref';
  title: string;
  body: string;
  ts: string;
  src: string;
  importance: number;
  relevance: number;
  shared: boolean;
}

export interface MemoryStats {
  agent_id: string;
  total: number;
  active: number;
  archived: number;
  shared: number;
  shared_pool: number;
  by_type: Record<string, number>;
  avg_importance: number;
  total_accesses: number;
}
