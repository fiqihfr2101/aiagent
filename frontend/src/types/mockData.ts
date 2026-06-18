
import { Agent, FeedItem, Tasks, LogEntry, Memory } from './index';

export const MOCK_AGENTS: Agent[] = [
  { id: 'jarvis', name: 'JARVIS', role: 'Squad Lead', status: 'active', task: 'Coordinating agent fleet tasks', seen: 'just now', uptime: '99.8%', hb: '2s', color: '#00D4AA' },
  { id: 'architect', name: 'ARCHITECT', role: 'Strategist', status: 'active', task: 'Architect fleet check started', seen: 'just now', uptime: '99.4%', hb: '3s', color: '#6366F1' },
  { id: 'forge', name: 'FORGE', role: 'Builder', status: 'active', task: 'Building AI agent reconciler', seen: 'just now', uptime: '98.9%', hb: '1s', color: '#F97316' },
  { id: 'scout', name: 'SCOUT', role: 'Researcher', status: 'active', task: 'Researching competitor landscape', seen: 'just now', uptime: '97.2%', hb: '4s', color: '#22C55E' },
  { id: 'ghost', name: 'GHOST', role: 'Content & SEO Writer', status: 'active', task: 'Writing SEO content for blog', seen: 'just now', uptime: '96.1%', hb: '3s', color: '#EC4899' },
  { id: 'hype', name: 'HYPE', role: 'Social Media Manager', status: 'active', task: 'Preparing Twitter/X thread', seen: 'just now', uptime: '95.4%', hb: '5s', color: '#8B5CF6' },
  { id: 'closer', name: 'CLOSER', role: 'Outreach Specialist', status: 'active', task: 'Awaiting Steven follow-up', seen: '2m ago', uptime: '93.1%', hb: '25s', color: '#F59E0B' },
  { id: 'reviewer', name: 'REVIEWER', role: 'Principal Engineer', status: 'sleeping', task: 'Reviewing open PRs', seen: '6m ago', uptime: '94.3%', hb: '1m', color: '#06B6D4' },
  { id: 'analyst', name: 'ANALYST', role: 'Data Intelligence', status: 'sleeping', task: 'Aggregating settlement metrics', seen: '12s ago', uptime: '99.1%', hb: '12s', color: '#A78BFA' },
  { id: 'keeper', name: 'KEEPER', role: 'Inventory Lead', status: 'sleeping', task: 'Sync inventory ledger', seen: 'just now', uptime: '98.0%', hb: '5s', color: '#34D399' },
  { id: 'anvil', name: 'ANVIL', role: 'Infrastructure', status: 'sleeping', task: 'Health check · all nodes nominal', seen: '8s ago', uptime: '99.9%', hb: '8s', color: '#60A5FA' },
  { id: 'steel', name: 'STEEL', role: 'Backend', status: 'offline', task: 'No heartbeat', seen: '34m ago', uptime: '71.2%', hb: '34m', color: '#94A3B8' },
];

export const MOCK_FEED: FeedItem[] = [
  { ts: '22:31:38', agent: 'HYPE', color: '#8B5CF6', msg: 'Generated thumbnail for AI Agent Squad video' },
  { ts: '22:31:35', agent: 'SCOUT', color: '#22C55E', msg: 'Analyzed pricing of competing AI courses' },
  { ts: '22:31:30', agent: 'GHOST', color: '#EC4899', msg: 'Drafted product descriptions for client blog' },
  { ts: '22:31:18', agent: 'FORGE', color: '#F97316', msg: 'Created PR #3 for agent-squad reconciler page' },
  { ts: '22:31:14', agent: 'JARVIS', color: '#00D4AA', msg: 'Started YouTube demo coordination flow' },
];

export const MOCK_TASKS: Tasks = {
  queue: [
    { title: 'Set up email outreach pipeline', agent: 'closer', prio: 'p1' },
    { title: 'Write 5 SEO blog posts', agent: 'ghost', prio: 'p1' },
    { title: 'Research competitor pricing', agent: 'scout', prio: 'p2' },
  ],
  inprogress: [
    { title: 'Build Moltza.com MVP', agent: 'forge', prio: 'p1' },
    { title: 'Mission Control+ Upgrade', agent: 'jarvis', prio: 'p1' },
  ],
  review: [
    { title: 'Vydra ClawHub Skill Draft', agent: 'ghost', prio: 'p1' },
  ],
  done: [
    { title: 'Build Mission Control Dashboard', agent: 'forge', prio: 'p1' },
  ]
};

export const MOCK_LOGS: LogEntry[] = [
  ['22:31:38', 'JARVIS', 'INFO', 'Heartbeat sent. Fleet status: 7/12 active'],
  ['22:31:37', 'FORGE', 'INFO', 'Task assigned: reconcile-transactions #4421'],
  ['22:31:36', 'SCOUT', 'INFO', 'Polling intelligence feed — 3 sources active'],
  ['22:31:35', 'ARCHITECT', 'WARN', 'Queue depth elevated: 14 pending tasks'],
];

export const MOCK_MEMORIES: Record<string, Memory[]> = {
  jarvis: [
    { type: 'fact', title: 'QRIS MPM flow SOP', body: 'Generate QR → poll status setiap 3s → max 15 retry → trigger webhook on success. Timeout 45s.', ts: '2h ago', src: 'gbrain' },
    { type: 'proc', title: 'Fleet coordination protocol', body: 'Prioritize tasks by P1>P2>P3. Assign to agent with lowest active task count. Re-queue if no response in 30s.', ts: '4h ago', src: 'gbrain' },
  ]
};
