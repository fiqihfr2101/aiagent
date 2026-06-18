
export type AgentStatus = 'active' | 'sleeping' | 'offline';

export interface Agent {
  id: string;
  name: string;
  role: string;
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
