// ─── H.E.R.M.E.S. Load Test Configuration ─────────────────────────
// Shared configuration for k6 load tests

export const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
export const WS_URL = __ENV.WS_URL || "ws://localhost:8000/ws";

// ─── Thresholds ────────────────────────────────────────────────────
// Performance requirements for H.E.R.M.E.S. API
export const THRESHOLDS = {
  // Response time thresholds
  http_req_duration: [
    "p(95)<200",   // 95% of requests under 200ms
    "p(99)<500",   // 99% of requests under 500ms
    "avg<100",     // Average under 100ms
  ],
  // Error rate threshold
  http_req_failed: ["rate<0.01"], // Less than 1% error rate
  // Request throughput
  http_reqs: ["rate>50"], // At least 50 req/s
  // WebSocket thresholds
  ws_connecting: ["p(95)<1000"], // WebSocket connect under 1s
  ws_msgs_received: ["count>0"], // Must receive messages
};

// ─── Load Stages ───────────────────────────────────────────────────
// Normal load: ramp to 100 users, sustain, ramp down
export const NORMAL_LOAD_STAGES = [
  { duration: "30s", target: 50 },   // Ramp up to 50 users
  { duration: "1m", target: 100 },   // Ramp to 100 users
  { duration: "2m", target: 100 },   // Sustain 100 users
  { duration: "30s", target: 0 },    // Ramp down
];

// Peak load: ramp to 500 users
export const PEAK_LOAD_STAGES = [
  { duration: "30s", target: 100 },  // Ramp to 100
  { duration: "1m", target: 300 },   // Ramp to 300
  { duration: "1m", target: 500 },   // Ramp to 500
  { duration: "2m", target: 500 },   // Sustain 500
  { duration: "30s", target: 0 },    // Ramp down
];

// Stress test: push to 1000+ users
export const STRESS_TEST_STAGES = [
  { duration: "30s", target: 200 },  // Ramp to 200
  { duration: "1m", target: 500 },   // Ramp to 500
  { duration: "1m", target: 1000 },  // Ramp to 1000
  { duration: "2m", target: 1000 },  // Sustain 1000
  { duration: "1m", target: 1500 },  // Spike to 1500
  { duration: "30s", target: 0 },    // Ramp down
];

// ─── Endpoint Definitions ──────────────────────────────────────────
export const ENDPOINTS = {
  // Health & Info
  health: "/health",
  
  // Agents
  listAgents: "/agents",
  createAgent: "/agents",
  getAgent: "/agents/{agent_id}",
  updateAgent: "/agents/{agent_id}",
  deleteAgent: "/agents/{agent_id}",
  updateAgentModel: "/agents/{agent_id}/model",
  
  // Tasks
  listTasks: "/tasks",
  createTask: "/tasks",
  getTask: "/tasks/{task_id}",
  stopTask: "/tasks/{task_id}/stop",
  taskHistory: "/tasks/history",
  taskCounts: "/tasks/counts",
  taskLogs: "/tasks/{task_id}/logs",
  updateTaskStatus: "/tasks/{task_id}/status",
  
  // Metrics
  getMetrics: "/metrics",
  agentMetrics: "/metrics/agents",
  systemMetrics: "/metrics/system",
  collectMetrics: "/metrics/collect",
  costMetrics: "/metrics/costs",
  agentCosts: "/metrics/costs/agents",
  modelCosts: "/metrics/costs/models",
  dailyCosts: "/metrics/costs/daily",
  costRates: "/metrics/costs/rates",
  
  // Notifications
  listNotifications: "/notifications",
  markRead: "/notifications/read",
  markAllRead: "/notifications/read-all",
  deleteNotification: "/notifications/{notification_id}",
  
  // Logs
  listLogs: "/logs",
  createLog: "/log",
  
  // Cache
  cacheStatus: "/cache/status",
  
  // Models
  listModels: "/models",
  
  // WebSocket
  websocket: "/ws",
};

// ─── Test Data ─────────────────────────────────────────────────────
export const TEST_AGENTS = [
  { name: "LoadTestAgent-Alpha", role: "researcher", model: "gpt-4" },
  { name: "LoadTestAgent-Beta", role: "coder", model: "claude-3-opus" },
  { name: "LoadTestAgent-Gamma", role: "reviewer", model: "gpt-4-turbo" },
];

export const TEST_TASKS = [
  { description: "Load test task: analyze data", agent_id: "test", priority: "high" },
  { description: "Load test task: write code", agent_id: "test", priority: "medium" },
  { description: "Load test task: review PR", agent_id: "test", priority: "low" },
];

// ─── Options ───────────────────────────────────────────────────────
export const DEFAULT_OPTIONS = {
  noConnectionReuse: false,
  userAgent: "HermesLoadTest/1.0",
  insecureSkipTLSVerify: true,
};
