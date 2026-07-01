CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'claude-sonnet-4',
    status TEXT NOT NULL DEFAULT 'active',
    task TEXT DEFAULT 'Idle',
    color TEXT DEFAULT '#00D4AA',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    title TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'P2',
    status TEXT NOT NULL DEFAULT 'QUEUED',
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    result TEXT,
    tokens_used INTEGER DEFAULT 0,
    workflow_id TEXT
);
CREATE TABLE IF NOT EXISTS task_logs (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    agent_id TEXT,
    level TEXT NOT NULL DEFAULT 'INFO',
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    request_id TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    read INTEGER NOT NULL DEFAULT 0,
    data TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT,
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    metadata TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_configs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    model TEXT DEFAULT 'claude-sonnet-4',
    system_prompt TEXT DEFAULT '',
    temperature REAL DEFAULT 0.5,
    max_tokens INTEGER DEFAULT 4096,
    tools TEXT DEFAULT '[]',
    toolsets TEXT DEFAULT '[]',
    env_vars TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS config_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    model TEXT DEFAULT 'claude-sonnet-4',
    system_prompt TEXT DEFAULT '',
    temperature REAL DEFAULT 0.5,
    max_tokens INTEGER DEFAULT 4096,
    tools TEXT DEFAULT '[]',
    toolsets TEXT DEFAULT '[]',
    env_vars TEXT DEFAULT '{}',
    is_default INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    nodes TEXT NOT NULL,
    edges TEXT NOT NULL,
    viewport TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS workflow_versions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    nodes TEXT NOT NULL,
    edges TEXT NOT NULL,
    viewport TEXT,
    saved_at TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS chat_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    agent_name TEXT,
    agent_role TEXT,
    files TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id);
