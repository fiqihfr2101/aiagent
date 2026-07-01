# Agent Orchestrator Knowledge Extract
## Untuk Pengembangan AFILABS AI Agent

---

## 📋 Ringkasan

Dokumen ini berisi knowledge/pattern dari project **Agent Orchestrator** (AO) yang bisa diaplikasikan ke project **AFILABS AI Agent**.

---

## 🏗️ Architecture Patterns

### **1. Mental Model: OBSERVE → UPDATE → DERIVE**

```
OBSERVE external facts → UPDATE durable facts → DERIVE display status / ACT
```

**Key Insight:**
- Display status **tidak pernah disimpan**
- Status **diderivasi** dari durable facts saat dibaca
- Contoh: `working`, `needs_input`, `ci_failed` = computed, bukan stored

**Aplikasi ke AFILABS:**
- Agent status (active, idle, working) = derived dari task status
- Dashboard metrics = computed dari database records
- Tidak perlu kolom status yang redundan

---

### **2. Port-Based Design (Hexagonal Architecture)**

```
Core Services → Port Interfaces → Adapters → External Systems
```

**Key Insight:**
- Core code **tidak pernah** depend pada concrete implementation
- Semua external systems diakses melalui **port interfaces**
- Adapters mengimplementasikan port interfaces

**Aplikasi ke AFILABS:**
```python
# Port interface
class AgentPort(ABC):
    @abstractmethod
    async def execute_task(self, task: Task) -> Result:
        pass

# Adapter implementation
class OpenCodeAdapter(AgentPort):
    async def execute_task(self, task: Task) -> Result:
        # Call OpenCode API
        pass

class OpenAIAdapter(AgentPort):
    async def execute_task(self, task: Task) -> Result:
        # Call OpenAI API
        pass
```

---

### **3. Durable Facts, Derived Status**

**Durable Facts (disimpan):**
- `activity_state` — What agent last reported (`active`, `idle`, `waiting_input`, `exited`)
- `is_terminated` — Whether session is over
- PR facts — `pr`, `pr_checks`, `pr_comment` tables

**Derived Status (computed at read time):**
- `working` — Computed dari `activity_state` + task status
- `needs_input` — Computed dari `activity_state`
- `ci_failed` — Computed dari `pr_checks`
- `mergeable` — Computed dari PR status

**Aplikasi ke AFILABS:**
```python
# Durable facts (stored in DB)
agent.activity_state = "active"
agent.is_terminated = False
agent.current_task_id = "task_123"

# Derived status (computed at read time)
def get_agent_status(agent):
    if agent.is_terminated:
        return "offline"
    if agent.activity_state == "active":
        return "running"
    if agent.activity_state == "idle":
        return "idle"
    return "unknown"
```

---

### **4. Observer Pattern**

**Separation of concerns:**
- **Observe layer** — Poll external state (SCM, Runtime)
- **Lifecycle layer** — Reduce observations into durable facts
- **Service layer** — Compute display status from facts

**Aplikasi ke AFILABS:**
```python
# Observer: Poll external state
class TaskObserver:
    async def poll_tasks(self):
        # Check task status from OpenCode
        pass

# Lifecycle: Reduce observations
class TaskLifecycle:
    async def apply_observation(self, observation):
        # Update durable facts in DB
        pass

# Service: Compute display status
class TaskService:
    async def get_task_status(self, task_id):
        # Derive status from durable facts
        pass
```

---

### **5. Change Data Capture (CDC)**

**Flow:**
```
DB → Triggers → change_log → Poller → Broadcaster → SSE → Clients
```

**Key Insight:**
- Semua perubahan data mengalir melalui CDC pipeline
- Real-time updates ke dashboard via SSE
- Tidak perlu polling dari frontend

**Aplikasi ke AFILABS:**
```python
# Database trigger
CREATE TRIGGER agents_after_update
AFTER UPDATE ON agents
BEGIN
    INSERT INTO change_log (table_name, row_id, operation, old_data, new_data)
    VALUES ('agents', NEW.id, 'UPDATE', OLD.*, NEW.*);
END;

# CDC Poller
class CDCPoller:
    async def poll_changes(self):
        # Poll change_log table
        # Broadcast to SSE subscribers
        pass

# SSE Endpoint
@app.get("/events")
async def events():
    # Stream changes to frontend
    pass
```

---

## 🤖 Agent Adapter Pattern

### **Agent Contract Interface**

```go
type Agent interface {
    // Discovery & Configuration
    GetConfigSpec() ConfigSpec
    
    // Launch
    GetLaunchCommand(ctx, cfg LaunchConfig) ([]string, error)
    GetPromptDeliveryStrategy() PromptDeliveryStrategy
    
    // Hooks
    GetAgentHooks(ctx, cfg WorkspaceHookConfig) error
    UninstallHooks(ctx, workspacePath string) error
    
    // Restore
    GetRestoreCommand(ctx, cfg RestoreConfig) ([]string, bool, error)
    
    // Metadata
    SessionInfo(ctx, session SessionRef) (SessionInfo, bool, error)
}
```

**Aplikasi ke AFILABS:**
```python
class AgentAdapter(ABC):
    @abstractmethod
    def get_config_spec(self) -> AgentConfig:
        """Return agent configuration spec."""
        pass
    
    @abstractmethod
    async def execute_task(self, task: Task, context: Context) -> Result:
        """Execute a task."""
        pass
    
    @abstractmethod
    def get_supported_models(self) -> List[str]:
        """Return list of supported models."""
        pass
    
    @abstractmethod
    async def get_session_info(self, session_id: str) -> SessionInfo:
        """Return session metadata."""
        pass
```

---

### **Hook System**

**Purpose:** Receive activity signals from running agents

**Flow:**
```
Agent triggers event → Hook callback → POST /api/v1/sessions/{id}/activity → Update activity_state
```

**Hook Events:**
| Event | Purpose | Activity State |
|-------|---------|----------------|
| `pre_tool_call` | Before tool execution | `active` |
| `post_tool_call` | After tool execution | `active` |
| `pre_message` | Before message send | `active` |
| `post_message` | After message received | `active` |
| `session_start` | Session started | `active` |
| `session_end` | Session ended | `exited` |

**Aplikasi ke AFILABS:**
```python
# Hook configuration
HOOK_CONFIG = {
    "pre_tool_call": "/api/v1/agents/{id}/activity",
    "post_tool_call": "/api/v1/agents/{id}/activity",
    "session_start": "/api/v1/agents/{id}/activity",
    "session_end": "/api/v1/agents/{id}/activity",
}

# Hook handler
@app.post("/api/v1/agents/{agent_id}/activity")
async def handle_activity(agent_id: str, activity: ActivityEvent):
    # Update agent activity_state
    agent = await get_agent(agent_id)
    agent.activity_state = activity.state
    await save_agent(agent)
    
    # Trigger CDC
    await trigger_cdc("agents", agent_id, "UPDATE")
```

---

## 📊 Database Schema Patterns

### **Durable Facts Tables**

```sql
-- Agents table
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    model TEXT NOT NULL,
    activity_state TEXT DEFAULT 'idle',
    is_terminated BOOLEAN DEFAULT FALSE,
    current_task_id TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tasks table
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'queued',
    priority TEXT DEFAULT 'P2',
    result TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Change log for CDC
CREATE TABLE change_log (
    seq BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 Lifecycle Management

### **Session Lifecycle**

```
CREATED → SPAWNING → RUNNING → COMPLETED/FAILED/TERMINATED
```

**State Transitions:**
| From | To | Trigger |
|------|-----|---------|
| CREATED | SPAWNING | User spawns session |
| SPAWNING | RUNNING | Agent launched successfully |
| RUNNING | COMPLETED | Agent finishes task |
| RUNNING | FAILED | Agent encounters error |
| RUNNING | TERMINATED | User terminates session |

**Aplikasi ke AFILABS:**
```python
class TaskLifecycle:
    STATES = ["queued", "running", "completed", "failed", "stopped"]
    
    async def transition(self, task_id: str, new_state: str):
        task = await get_task(task_id)
        
        # Validate transition
        if not self.is_valid_transition(task.status, new_state):
            raise InvalidTransition(f"{task.status} → {new_state}")
        
        # Update durable facts
        task.status = new_state
        if new_state == "running":
            task.started_at = datetime.now()
        elif new_state in ("completed", "failed"):
            task.completed_at = datetime.now()
        
        await save_task(task)
        
        # Trigger CDC
        await trigger_cdc("tasks", task_id, "UPDATE")
```

---

## 🎯 Key Takeaways untuk AFILABS

### **1. Architecture**
- ✅ Gunakan **Port-Based Design** (Hexagonal Architecture)
- ✅ **Durable Facts** + **Derived Status** (jangan simpan status redundan)
- ✅ **Observer Pattern** untuk poll external state
- ✅ **CDC Pipeline** untuk real-time updates

### **2. Agent Management**
- ✅ **Agent Adapter Pattern** untuk support multiple LLM providers
- ✅ **Hook System** untuk activity tracking
- ✅ **Lifecycle Management** dengan state transitions

### **3. Data Management**
- ✅ **SQLite/PostgreSQL** dengan proper schema
- ✅ **Change Data Capture** untuk real-time updates
- ✅ **SSE** untuk dashboard updates

### **4. Best Practices**
- ✅ **Code-first API** (generate OpenAPI spec dari code)
- ✅ **Loopback-only daemon** (security)
- ✅ **Environment-based configuration**
- ✅ **Proper error handling** dengan error envelopes

---

## 🚀 Implementation Plan untuk AFILABS

### **Phase 1: Core Architecture**
1. Implementasi Port-Based Design
2. Buat Agent Adapter interface
3. Implementasi CDC pipeline

### **Phase 2: Agent Management**
1. Buat adapter untuk OpenCode, OpenAI, Anthropic
2. Implementasi Hook System
3. Implementasi Lifecycle Management

### **Phase 3: Real-time Features**
1. Implementasi SSE untuk dashboard updates
2. Implementasi Observer Pattern
3. Implementasi Derived Status

### **Phase 4: Integration**
1. Integrate dengan existing AFILABS codebase
2. Test semua patterns
3. Documentasi

---

## 📚 Referensi

- **Architecture:** `docs/architecture.md`
- **Agent Contract:** `docs/agent/README.md`
- **Backend Structure:** `docs/backend-code-structure.md`
- **CLI:** `docs/cli/README.md`

---

**Dokumen ini akan diupdate seiring pengembangan AFILABS.**
