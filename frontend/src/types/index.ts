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
