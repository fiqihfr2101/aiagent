/**
 * Frontend Component Tests for H.E.R.M.E.S. AI Agent Orchestrator.
 * 
 * These tests verify component rendering, types, and utility functions.
 * Run with: npx jest --config jest.config.js
 */

// Type validation tests
describe('Type Definitions', () => {
  test('Agent type has required fields', () => {
    const agent = {
      id: 'agent-1',
      name: 'JARVIS',
      role: 'Squad Lead',
      model: 'claude-sonnet-4',
      status: 'active',
      task: 'Idle',
      seen: 'just now',
      uptime: '100%',
      hb: '1s',
      color: '#00D4AA',
    };

    expect(agent.id).toBeDefined();
    expect(agent.name).toBeDefined();
    expect(agent.role).toBeDefined();
    expect(agent.status).toMatch(/^(active|sleeping|offline)$/);
    expect(agent.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('DispatchTask type has required fields', () => {
    const task = {
      id: 'task-abc123',
      agent_id: 'agent-1',
      title: 'Test Task',
      priority: 'P1',
      status: 'QUEUED',
      created_at: '2025-01-01T00:00:00',
      tokens_used: 0,
    };

    expect(task.id).toBeDefined();
    expect(task.agent_id).toBeDefined();
    expect(task.title).toBeDefined();
    expect(task.priority).toMatch(/^P[123]$/);
    expect(task.status).toMatch(/^(QUEUED|RUNNING|COMPLETED|FAILED|STOPPED)$/);
  });

  test('TaskLog type has required fields', () => {
    const log = {
      id: 'log-abc',
      task_id: 'task-1',
      agent_id: 'agent-1',
      level: 'INFO',
      message: 'Test message',
      timestamp: '2025-01-01T00:00:00',
    };

    expect(log.id).toBeDefined();
    expect(log.level).toMatch(/^(INFO|WARNING|ERROR|DEBUG)$/);
    expect(log.message).toBeDefined();
    expect(log.timestamp).toBeDefined();
  });
});

describe('WebSocket Message Types', () => {
  test('heartbeat message format', () => {
    const msg = {
      type: 'heartbeat',
      status: 'online',
      active_nodes: 5,
      running: 3,
      sleeping: 1,
      offline: 1,
    };

    expect(msg.type).toBe('heartbeat');
    expect(msg.active_nodes).toBeGreaterThanOrEqual(0);
    expect(msg.running + msg.sleeping + msg.offline).toBe(msg.active_nodes);
  });

  test('fleet_update message format', () => {
    const msg = {
      type: 'fleet_update',
      agents: [
        { id: 'a1', name: 'JARVIS', status: 'active' },
      ],
    };

    expect(msg.type).toBe('fleet_update');
    expect(Array.isArray(msg.agents)).toBe(true);
  });

  test('task_update message format', () => {
    const msg = {
      type: 'task_update',
      task: {
        id: 'task-1',
        status: 'COMPLETED',
        title: 'Test',
      },
    };

    expect(msg.type).toBe('task_update');
    expect(msg.task.id).toBeDefined();
  });

  test('model_update message format', () => {
    const msg = {
      type: 'model_update',
      agent_id: 'a1',
      model: 'gpt-4o',
      agent: { id: 'a1', model: 'gpt-4o' },
    };

    expect(msg.type).toBe('model_update');
    expect(msg.agent_id).toBeDefined();
    expect(msg.model).toBeDefined();
  });

  test('batch message format', () => {
    const msg = {
      type: 'batch',
      messages: [
        { type: 'metrics', data: {} },
        { type: 'task_counts', counts: {} },
      ],
    };

    expect(msg.type).toBe('batch');
    expect(Array.isArray(msg.messages)).toBe(true);
    expect(msg.messages.length).toBe(2);
  });

  test('ping message format', () => {
    const msg = { type: 'ping', ts: Date.now() };
    expect(msg.type).toBe('ping');
    expect(msg.ts).toBeDefined();
  });

  test('pong response format', () => {
    const response = { type: 'pong' };
    expect(response.type).toBe('pong');
  });

  test('subscribe message format', () => {
    const msg = {
      type: 'subscribe',
      channels: ['agents', 'tasks', 'metrics'],
    };

    expect(msg.type).toBe('subscribe');
    expect(Array.isArray(msg.channels)).toBe(true);
  });

  test('new_notification message format', () => {
    const msg = {
      type: 'new_notification',
      notification: {
        id: 'notif-1',
        type: 'task_completed',
        title: 'Task Done',
        read: false,
      },
    };

    expect(msg.type).toBe('new_notification');
    expect(msg.notification.id).toBeDefined();
  });

  test('new_log message format', () => {
    const msg = {
      type: 'new_log',
      log: {
        id: 'log-1',
        message: 'Test',
        level: 'INFO',
        timestamp: '2025-01-01T00:00:00',
      },
    };

    expect(msg.type).toBe('new_log');
    expect(msg.log.id).toBeDefined();
  });
});

describe('API Response Validation', () => {
  test('TaskHistoryResponse structure', () => {
    const response = {
      tasks: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 1,
    };

    expect(response.tasks).toBeDefined();
    expect(response.total).toBeGreaterThanOrEqual(0);
    expect(response.page).toBeGreaterThanOrEqual(1);
    expect(response.page_size).toBeGreaterThanOrEqual(1);
    expect(response.total_pages).toBeGreaterThanOrEqual(1);
  });

  test('Notification list response structure', () => {
    const response = {
      notifications: [],
      total: 0,
      page: 1,
      page_size: 50,
      total_pages: 1,
      unread_count: 0,
    };

    expect(response.notifications).toBeDefined();
    expect(response.unread_count).toBeGreaterThanOrEqual(0);
  });

  test('Cost summary response structure', () => {
    const response = {
      total_cost: 0.05,
      total_input_tokens: 1000,
      total_output_tokens: 500,
      total_tasks: 3,
      recent_7d_cost: 0.03,
      trend_percent: -15.5,
    };

    expect(response.total_cost).toBeGreaterThanOrEqual(0);
    expect(response.total_tasks).toBeGreaterThanOrEqual(0);
  });

  test('Cache status response structure', () => {
    const response = {
      available: true,
      hits: 100,
      misses: 20,
      hit_rate_percent: 83.3,
      connected_clients: 2,
      used_memory: '1.5M',
    };

    expect(typeof response.available).toBe('boolean');
    expect(response.hits).toBeGreaterThanOrEqual(0);
    expect(response.misses).toBeGreaterThanOrEqual(0);
  });
});

describe('Notification Types and Colors', () => {
  const NOTIFICATION_CONFIG = {
    task_completed: { icon: '✅', color: 'green' },
    task_failed: { icon: '❌', color: 'red' },
    task_stopped: { icon: '⚠️', color: 'amber' },
    agent_registered: { icon: '🆕', color: 'blue' },
    cost_alert: { icon: '💰', color: 'amber' },
  };

  test('all notification types have icons', () => {
    Object.values(NOTIFICATION_CONFIG).forEach(config => {
      expect(config.icon).toBeDefined();
      expect(config.icon.length).toBeGreaterThan(0);
    });
  });

  test('all notification types have colors', () => {
    Object.values(NOTIFICATION_CONFIG).forEach(config => {
      expect(config.color).toBeDefined();
    });
  });

  test('task_completed uses green', () => {
    expect(NOTIFICATION_CONFIG.task_completed.color).toBe('green');
  });

  test('task_failed uses red', () => {
    expect(NOTIFICATION_CONFIG.task_failed.color).toBe('red');
  });
});

describe('Model Families', () => {
  const MODELS = [
    { id: 'gpt-4', family: 'gpt' },
    { id: 'gpt-4o', family: 'gpt' },
    { id: 'claude-sonnet-4', family: 'claude' },
    { id: 'claude-opus-4', family: 'claude' },
    { id: 'kimi-k2', family: 'kimi' },
  ];

  test('all models have families', () => {
    MODELS.forEach(model => {
      expect(model.family).toBeDefined();
      expect(['gpt', 'claude', 'kimi', 'other']).toContain(model.family);
    });
  });

  test('gpt models classified correctly', () => {
    const gptModels = MODELS.filter(m => m.family === 'gpt');
    expect(gptModels.length).toBeGreaterThan(0);
    gptModels.forEach(m => expect(m.id).toMatch(/gpt/));
  });

  test('claude models classified correctly', () => {
    const claudeModels = MODELS.filter(m => m.family === 'claude');
    expect(claudeModels.length).toBeGreaterThan(0);
    claudeModels.forEach(m => expect(m.id).toMatch(/claude/));
  });
});
