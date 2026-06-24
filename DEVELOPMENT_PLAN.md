# H.E.R.M.E.S. — Comprehensive Development Plan

> **AI Agent Orchestrator · Mission Control Dashboard**
> Generated: 2026-06-24 | Last Updated: 2026-06-24

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Technical Debt & Gap Analysis](#2-technical-debt--gap-analysis)
3. [Phase 6: Advanced Diagnostics & Cost Tracking](#3-phase-6-advanced-diagnostics--cost-tracking)
4. [Phase 7: Performance Optimization & Scaling](#4-phase-7-performance-optimization--scaling)
5. [Phase 8: Security Hardening & Production Readiness](#5-phase-8-security-hardening--production-readiness)
6. [Phase 9: Additional Features & Enhancements](#6-phase-9-additional-features--enhancements)
7. [Timeline & Milestones](#7-timeline--milestones)
8. [Risk Matrix](#8-risk-matrix)

---

## 1. Current State Assessment

### Architecture

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | Next.js 14+ (TypeScript, Tailwind CSS) | ✅ Operational |
| Backend | FastAPI (Python 3.10) | ✅ Operational |
| Workflow Engine | Temporal.io (Docker) | ✅ Operational |
| Memory | ChromaDB (PersistentClient, local disk) | ✅ Operational |
| Infrastructure | Docker Compose (6 services) | ✅ Operational |
| Communication | WebSocket (real-time) | ✅ Operational |

### Completed Phases (1–5)

- **Phase 1–2**: Next.js base UI, WebSocket & API connection
- **Phase 3**: Enterprise refactoring — Clean Architecture / DDD layers, Temporal.io cluster setup, `AgentTaskWorkflow`, Temporal Worker
- **Phase 4–5**: Hermes AI agent integration (`HermesAdapter`), ChromaDB memory persistence, task routing from dashboard to Temporal, real-time log streaming

### Project Structure

```
AIAgent/
├── PROJECT_HERMES.md          # Project overview & roadmap
├── DEVELOPMENT_PLAN.md        # This document
├── docker-compose.yml         # 6-service stack
├── install.cmd                # Windows quick-start
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                # FastAPI entrypoint (routes, WS, heartbeat)
│   ├── hermes_engine.py       # In-memory agent fleet manager
│   ├── worker.py              # Temporal Worker process
│   ├── app/
│   │   ├── domain/
│   │   │   └── entities.py    # Agent, AgentTask, MemoryEntry dataclasses
│   │   ├── application/       # Use cases (placeholder, empty __init__)
│   │   ├── infrastructure/
│   │   │   ├── hermes_adapter.py   # Hermes AIAgent wrapper
│   │   │   └── memory_manager.py   # ChromaDB CRUD
│   │   └── interfaces/        # FastAPI routes (placeholder, empty __init__)
│   ├── workflows/
│   │   └── agent_workflow.py  # AgentTaskWorkflow (process → save memory)
│   └── activities/
│       └── agent_activities.py # process_hermes_task, save_task_to_memory
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx       # Mission Control main page
│       │   └── globals.css
│       ├── components/
│       │   ├── NavBar.tsx
│       │   ├── Sidebar.tsx
│       │   ├── AgentCard.tsx
│       │   ├── NodeGraph.tsx  # SVG org-graph with drag/zoom
│       │   ├── Console.tsx    # Log viewer
│       │   ├── MemoryView.tsx # ChromaDB memory browser
│       │   └── AnalyticsView.tsx # Diagnostics (mock data)
│       ├── hooks/
│       │   └── useWebSocket.ts # WS connection with auto-reconnect
│       └── types/
│           ├── index.ts       # TypeScript interfaces
│           └── mockData.ts    # Mock data definitions
```

---

## 2. Technical Debt & Gap Analysis

### Critical Issues (Must Fix Before Production)

| # | Issue | Location | Impact | Priority |
|---|-------|----------|--------|----------|
| 1 | **CORS allows all origins** — `allow_origins=["*"]` | `backend/main.py:21` | Security vulnerability; any domain can call the API | P0 |
| 2 | **No authentication/authorization** — All endpoints are public | `backend/main.py` | Unauthorized access to agent control, task dispatch, memory | P0 |
| 3 | **No input validation** — Raw `request.json()` without Pydantic models | `backend/main.py:79-100` | Injection attacks, malformed data crashes | P0 |
| 4 | **In-memory agent state** — `HermesEngine.agents` list is not persisted | `backend/hermes_engine.py:8-11` | Fleet state lost on restart | P1 |
| 5 | **No ChromaDB in Docker Compose** — Uses local filesystem mount only | `docker-compose.yml` | No dedicated ChromaDB service; single-node only | P1 |
| 6 | **No test suite** — Zero tests across frontend and backend | Entire project | No regression safety net | P1 |

### Moderate Issues (Technical Debt)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 7 | **Deprecated `@app.on_event("startup")`** | `backend/main.py:53` | Should use FastAPI lifespan context manager |
| 8 | **Hardcoded mock data in AnalyticsView** — `Math.sin()`-based charts | `frontend/src/components/AnalyticsView.tsx:10-18` | No real metrics displayed |
| 9 | **Hardcoded tree structure in NodeGraph** — Not derived from agent data | `frontend/src/components/NodeGraph.tsx:10-21` | Adding agents requires code change |
| 10 | **No logging framework** — Using `print()` statements | `backend/` throughout | No structured logs, no log levels, no aggregation |
| 11 | **No error boundaries in frontend** | `frontend/src/` | Unhandled React errors crash entire UI |
| 12 | **WebSocket reconnect has fixed 3s delay** — No exponential backoff | `frontend/src/hooks/useWebSocket.ts:40` | Potential connection storm on backend restart |
| 13 | **Bare `except:` clause** — Catches all exceptions silently | `backend/main.py:46` | Hides bugs in WebSocket broadcast |
| 14 | **No API rate limiting** | `backend/main.py` | Vulnerable to DoS |
| 15 | **Docker images have no health checks** | `docker-compose.yml` | Unhealthy containers not restarted |
| 16 | **No `.env.example`** — Environment variables undocumented | Project root | Onboarding friction |
| 17 | **No database migration strategy** for ChromaDB schema changes | `backend/app/infrastructure/` | Schema evolution risky |
| 18 | **Worker has no graceful shutdown** | `backend/worker.py` | Tasks may be interrupted mid-execution |
| 19 | **No Pydantic response models** — API returns raw dicts | `backend/main.py` | No OpenAPI docs, no contract enforcement |
| 20 | **`application/` and `interfaces/` layers are empty** — Architecture incomplete | `backend/app/` | DDD pattern not fully realized |

### Missing Capabilities (Gaps for Future Phases)

- No cost tracking (LLM token usage, API costs)
- No real performance metrics collection
- No agent-to-agent communication
- No workflow visualization / status tracking in UI
- No task history / audit trail
- No multi-user support
- No deployment pipeline (CI/CD)
- No observability stack (Prometheus, Grafana, etc.)

---

## 3. Phase 6: Advanced Diagnostics & Cost Tracking

> **Goal**: Replace mock analytics with real metrics, implement LLM cost tracking, and add workflow observability.
>
> **Duration**: 3–4 weeks | **Effort**: ~120–160 hours

### 6.1 Objectives

1. Replace all mock/simulated data in `AnalyticsView` with real metrics from backend
2. Track LLM token usage and cost per agent/task
3. Add Temporal workflow status visibility in the dashboard
4. Implement structured logging pipeline
5. Add task history and audit trail

### 6.2 Technical Implementation

#### 6.2.1 Metrics Collection Service (Backend)

**New file**: `backend/app/infrastructure/metrics_collector.py`

```python
# Collect and store time-series metrics:
# - Task completion rate (tasks/hour)
# - Agent latency (response time per task)
# - Error rate (failed tasks / total tasks)
# - Token usage per task (input_tokens, output_tokens)
# - Cost per task (based on model pricing)
# - Fleet uptime percentage

# Storage: SQLite time-series table or Prometheus client
# Interface: MetricsCollector with record_task_metrics(), get_aggregate()
```

- Create `MetricsCollector` class using SQLite for time-series storage
- Hook into `AgentActivities.process_hermes_task` to capture:
  - Start/end timestamps → latency
  - Token counts from Hermes response metadata → usage
  - Success/failure status → error rate
  - Model used → cost calculation
- Expose via new endpoints:
  - `GET /metrics/summary` — Aggregated KPIs (24h, 7d, 30d)
  - `GET /metrics/timeseries?metric=tasks_per_hour&range=24h` — Chart data
  - `GET /metrics/costs` — Cost breakdown by agent/model/timeframe

#### 6.2.2 Cost Tracking Engine

**New file**: `backend/app/domain/cost_tracker.py`

```python
# Model pricing registry (configurable):
PRICING = {
    "anthropic/claude-3-5-sonnet": {"input": 3.00, "output": 15.00},  # per 1M tokens
    "openai/gpt-4o": {"input": 2.50, "output": 10.00},
    # ... extensible
}

# Cost = (input_tokens * input_price + output_tokens * output_price) / 1_000_000
```

- Parse token usage from Hermes agent responses
- Calculate cost per task execution
- Store in `task_costs` table: `(task_id, agent_id, model, input_tokens, output_tokens, cost_usd, timestamp)`
- API endpoints:
  - `GET /costs/summary` — Total spend, by agent, by model
  - `GET /costs/breakdown?period=daily` — Daily cost chart data
  - `GET /costs/budget` — Budget alerts and remaining allocation

#### 6.2.3 Temporal Workflow Status Tracking

**Modify**: `backend/workflows/agent_workflow.py` — Add status signals

- Add Temporal signals for progress reporting: `QUEUED → RUNNING → COMPLETED/FAILED`
- New API endpoint: `GET /workflows` — List all workflows with status
- New API endpoint: `GET /workflows/{id}` — Workflow detail with execution history
- Frontend: Add workflow status column in agent drawer "Tasks" tab

#### 6.2.4 Frontend: Real Analytics Dashboard

**Modify**: `frontend/src/components/AnalyticsView.tsx`

- Replace hardcoded KPIs with API-fetched data from `/metrics/summary`
- Add time-range selector (24h, 7d, 30d)
- Implement real charts using lightweight chart library (e.g., Recharts or Chart.js):
  - Task throughput over time (line chart)
  - Latency distribution (histogram)
  - Error rate trend (line chart)
  - Cost per day (bar chart)
- Add cost dashboard section:
  - Total spend card with trend indicator
  - Cost by agent (pie chart)
  - Cost by model (bar chart)
  - Token usage breakdown table

#### 6.2.5 Task History & Audit Trail

**New file**: `backend/app/infrastructure/task_repository.py`

- SQLite-backed task execution log: `(id, agent_id, title, priority, status, started_at, completed_at, tokens_used, cost_usd, output_preview)`
- New API endpoints:
  - `GET /tasks/history?agent_id=X&page=1` — Paginated task history
  - `GET /tasks/{id}` — Full task detail with output
- Frontend: New "History" tab in agent drawer showing past executions

#### 6.2.6 Structured Logging

**Modify**: `backend/main.py`, `backend/hermes_engine.py`

- Replace `print()` with Python `logging` module + structured JSON formatter
- Add request ID middleware for traceability
- Log levels: DEBUG, INFO, WARNING, ERROR with configurable threshold
- Add log aggregation endpoint: `GET /logs?level=ERROR&limit=50`

### 6.3 Dependencies

| Dependency | Reason | Risk |
|-----------|--------|------|
| Recharts (frontend) | Real chart rendering | Low — well-maintained, small bundle |
| SQLite (backend) | Time-series metrics storage | Low — already available in Python stdlib |
| Hermes response metadata | Token usage extraction | Medium — depends on Hermes Agent library exposing token counts |

### 6.4 Effort Breakdown

| Task | Hours | Story Points |
|------|-------|-------------|
| Metrics collection service | 16 | 8 |
| Cost tracking engine | 12 | 5 |
| Temporal workflow status API | 10 | 5 |
| Frontend analytics rewrite (real data) | 24 | 13 |
| Cost dashboard UI | 16 | 8 |
| Task history backend + API | 12 | 5 |
| Task history frontend | 10 | 5 |
| Structured logging migration | 8 | 3 |
| Integration testing | 12 | 5 |
| **Total** | **120** | **57** |

### 6.5 Success Criteria

- [ ] AnalyticsView shows real data (zero hardcoded values)
- [ ] Cost tracking accuracy within 5% of actual LLM API billing
- [ ] Task history viewable per agent with pagination
- [ ] All backend modules use structured logging (zero `print()` calls)
- [ ] Workflow status visible in real-time on dashboard
- [ ] Time-range filtering works for all metrics (24h, 7d, 30d)

---

## 4. Phase 7: Performance Optimization & Scaling

> **Goal**: Eliminate bottlenecks, add caching, optimize WebSocket throughput, and prepare for multi-agent scale.
>
> **Duration**: 2–3 weeks | **Effort**: ~80–100 hours

### 7.1 Objectives

1. Optimize WebSocket message throughput and reduce bandwidth
2. Add caching layer for frequently accessed data
3. Implement connection pooling and resource management
4. Prepare for horizontal scaling (multiple workers, load balancing)
5. Add frontend performance optimizations

### 7.2 Technical Implementation

#### 7.2.1 WebSocket Optimization

**Modify**: `backend/main.py` (ConnectionManager), `frontend/src/hooks/useWebSocket.ts`

- **Message batching**: Combine multiple small WS messages into single frames (e.g., batch log entries every 200ms)
- **Delta updates**: Send only changed agent fields instead of full fleet state on `fleet_update`
- **Binary protocol**: Use MessagePack or CBOR instead of JSON for WS payloads (30-50% size reduction)
- **Subscription model**: Allow clients to subscribe to specific agents/events to reduce irrelevant traffic
- **Frontend**: Implement exponential backoff with jitter for reconnection (replace fixed 3s delay)
- **Frontend**: Add message deduplication (skip duplicate log entries)

#### 7.2.2 Caching Layer

**New file**: `backend/app/infrastructure/cache.py`

- Implement Redis or in-memory LRU cache for:
  - Agent fleet state (TTL: 5s)
  - Memory queries (TTL: 30s)
  - Metrics summaries (TTL: 60s)
  - Task history pages (TTL: 10s)
- Cache invalidation on write operations
- Add `Cache-Control` headers to REST endpoints

#### 7.2.3 Database Optimization

**Modify**: `backend/app/infrastructure/memory_manager.py`, new `task_repository.py`

- Add ChromaDB collection indexing for faster queries
- Implement connection pooling for SQLite (metrics, task history)
- Add database WAL mode for concurrent read/write
- Implement batch inserts for bulk memory operations
- Add pagination to all list endpoints (currently returns all records)

#### 7.2.4 Horizontal Scaling Preparation

**Modify**: `docker-compose.yml`

- Add Redis service for shared state across backend instances
- Replace in-memory `ConnectionManager` with Redis Pub/Sub for multi-instance WebSocket broadcast
- Add Nginx reverse proxy with load balancing
- Configure Temporal worker auto-scaling (multiple worker instances)
- Add Docker Compose profiles for dev/staging/production

```yaml
# docker-compose.yml additions
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
```

#### 7.2.5 Frontend Performance

**Modify**: Multiple frontend components

- Add React.memo() to prevent unnecessary re-renders (AgentCard, log entries)
- Implement virtual scrolling for Console log list (react-window or react-virtuoso)
- Lazy-load AnalyticsView and MemoryView (dynamic imports)
- Add service worker for static asset caching
- Optimize Tailwind CSS bundle (purge unused styles)
- Add loading skeletons for async data

#### 7.2.6 Temporal Worker Optimization

**Modify**: `backend/worker.py`, `backend/activities/agent_activities.py`

- Implement activity retry policies with exponential backoff
- Add workflow continue-as-new for long-running tasks
- Implement activity heartbeats for progress tracking
- Configure worker tuning parameters (max concurrent activities, task pollers)

### 7.3 Dependencies

| Dependency | Reason | Risk |
|-----------|--------|------|
| Redis | Shared state, pub/sub, caching | Low — standard infrastructure |
| Nginx | Load balancing, reverse proxy | Low — well-understood |
| react-window | Virtual scrolling | Low — lightweight, stable |

### 7.4 Effort Breakdown

| Task | Hours | Story Points |
|------|-------|-------------|
| WebSocket message batching & delta updates | 16 | 8 |
| Caching layer implementation | 12 | 5 |
| Database optimization (indexing, pooling) | 10 | 5 |
| Redis integration for shared state | 16 | 8 |
| Nginx load balancer setup | 8 | 3 |
| Frontend performance optimizations | 16 | 8 |
| Temporal worker tuning | 8 | 3 |
| Load testing & benchmarking | 12 | 5 |
| **Total** | **98** | **45** |

### 7.5 Success Criteria

- [ ] WebSocket handles 1000+ concurrent connections without degradation
- [ ] API response time p95 < 200ms for all endpoints
- [ ] Fleet update messages reduced by 60%+ with delta updates
- [ ] Frontend Time-to-Interactive < 2 seconds
- [ ] Memory queries return in < 500ms for collections with 10K+ entries
- [ ] System handles 100 concurrent task dispatches without errors

---

## 5. Phase 8: Security Hardening & Production Readiness

> **Goal**: Lock down the system for production deployment with authentication, authorization, input validation, and compliance features.
>
> **Duration**: 3–4 weeks | **Effort**: ~120–140 hours

### 8.1 Objectives

1. Implement authentication and authorization
2. Add comprehensive input validation
3. Secure all API endpoints and WebSocket connections
4. Add HTTPS/TLS everywhere
5. Implement audit logging and compliance features
6. Add CI/CD pipeline
7. Create production deployment configuration

### 8.2 Technical Implementation

#### 8.2.1 Authentication & Authorization

**New files**: `backend/app/interfaces/auth.py`, `backend/app/domain/user.py`

- **Authentication**: JWT-based auth with refresh tokens
  - `POST /auth/login` → Returns access token (15min) + refresh token (7d)
  - `POST /auth/refresh` → Refresh expired access token
  - `POST /auth/logout` → Invalidate refresh token
  - Store refresh tokens in Redis with expiry
- **Authorization**: Role-Based Access Control (RBAC)
  - Roles: `admin`, `operator`, `viewer`
  - Permissions matrix:
    | Action | admin | operator | viewer |
    |--------|-------|----------|--------|
    | View dashboard | ✅ | ✅ | ✅ |
    | Register agents | ✅ | ✅ | ❌ |
    | Dispatch tasks | ✅ | ✅ | ❌ |
    | View memories | ✅ | ✅ | ✅ |
    | Manage users | ✅ | ❌ | ❌ |
    | View costs | ✅ | ✅ | ❌ |
- **Middleware**: `AuthMiddleware` that validates JWT on all `/api/*` routes and WS connections
- **Frontend**: Login page, auth context, protected routes, token refresh logic

#### 8.2.2 Input Validation & API Contracts

**Modify**: `backend/main.py`, new `backend/app/interfaces/schemas.py`

- Define Pydantic models for all request/response bodies:
  ```python
  class RegisterAgentRequest(BaseModel):
      name: str = Field(..., min_length=1, max_length=50, pattern=r'^[a-zA-Z0-9_-]+$')
      role: str = Field(..., min_length=1, max_length=100)
      model: str = Field(..., pattern=r'^[a-z]+/[a-z0-9-]+$')

  class TaskRequest(BaseModel):
      agent_id: str
      title: str = Field(..., min_length=1, max_length=2000)
      priority: Literal['p1', 'p2', 'p3']

  class TaskResponse(BaseModel):
      workflow_id: str
      status: str
  ```
- Add request size limits (max 10KB for task descriptions)
- Add rate limiting: 60 requests/minute per user, 10 task dispatches/minute
- Generate OpenAPI docs with examples

#### 8.2.3 CORS & Transport Security

**Modify**: `backend/main.py`, `docker-compose.yml`

- Restrict CORS to specific frontend origin(s)
- Add HTTPS via Nginx with Let's Encrypt (certbot) or self-signed certs for dev
- Add HSTS headers
- Add security headers middleware: `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`
- Secure WebSocket with WSS (TLS)

#### 8.2.4 Secrets Management

**New file**: `.env.example`, modify `docker-compose.yml`

- Document all environment variables in `.env.example`
- Use Docker secrets or environment variable injection (not hardcoded)
- Add secret rotation mechanism for JWT signing keys
- Never log sensitive data (API keys, tokens)

#### 8.2.5 Audit Logging

**New file**: `backend/app/infrastructure/audit_logger.py`

- Log all security-relevant events:
  - Login/logout attempts (success and failure)
  - Agent registration/deletion
  - Task dispatches
  - Memory access
  - Configuration changes
- Store in dedicated SQLite table: `(timestamp, user_id, action, resource, ip_address, user_agent, result)`
- New endpoint: `GET /audit?user=X&action=Y&page=1` (admin only)

#### 8.2.6 CI/CD Pipeline

**New files**: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

- **CI Pipeline** (on every push/PR):
  - Backend: `pytest` with coverage ≥ 80%
  - Frontend: `next build` + `eslint` + type checking
  - Docker: Build and smoke test all images
  - Security: `trivy` scan for container vulnerabilities
- **CD Pipeline** (on merge to main):
  - Build and push Docker images
  - Deploy to staging environment
  - Run integration tests
  - Manual approval gate → deploy to production

#### 8.2.7 Production Docker Configuration

**Modify**: `docker-compose.yml`, new `docker-compose.prod.yml`

- Production compose file with:
  - Resource limits (CPU, memory) per service
  - Health checks for all services
  - Restart policies (`unless-stopped`)
  - Named volumes for data persistence
  - Log rotation configuration
  - ChromaDB as dedicated service with persistent volume
- Add `Dockerfile.frontend` for Next.js production build (standalone mode)
- Non-root user in all containers

### 8.3 Dependencies

| Dependency | Reason | Risk |
|-----------|--------|------|
| PyJWT / python-jose | JWT token handling | Low |
| passlib + bcrypt | Password hashing | Low |
| slowapi | Rate limiting for FastAPI | Low |
| certbot | Let's Encrypt TLS certificates | Low |
| Trivy | Container security scanning | Low |
| pytest + httpx | Backend testing | Low |

### 8.4 Effort Breakdown

| Task | Hours | Story Points |
|------|-------|-------------|
| JWT authentication system | 16 | 8 |
| RBAC implementation | 12 | 5 |
| Pydantic request/response schemas | 10 | 5 |
| CORS + security headers hardening | 6 | 3 |
| Rate limiting | 8 | 3 |
| Audit logging system | 12 | 5 |
| Frontend auth flow (login, protected routes) | 16 | 8 |
| CI/CD pipeline setup | 16 | 8 |
| Production Docker configuration | 12 | 5 |
| TLS/HTTPS setup | 8 | 3 |
| Security testing (penetration, OWASP) | 12 | 5 |
| **Total** | **128** | **58** |

### 8.5 Success Criteria

- [ ] All API endpoints require valid JWT (except `/health` and `/auth/login`)
- [ ] RBAC enforced — viewer cannot dispatch tasks or register agents
- [ ] All inputs validated with Pydantic (zero raw `request.json()` calls)
- [ ] CORS restricted to configured origins only
- [ ] HTTPS enforced on all connections
- [ ] Rate limiting active (returns 429 on excess)
- [ ] Audit trail captures all security events
- [ ] CI pipeline runs on every PR with green tests
- [ ] Container images pass Trivy security scan with no critical/high vulnerabilities
- [ ] OWASP Top 10 checklist addressed

---

## 6. Phase 9: Additional Features & Enhancements

> **Goal**: Expand H.E.R.M.E.S. into a full-featured multi-agent orchestration platform with advanced capabilities.
>
> **Duration**: 4–6 weeks | **Effort**: ~160–200 hours

### 9.1 Objectives

1. Enable agent-to-agent communication and collaboration
2. Add workflow builder / visual pipeline editor
3. Implement advanced memory features (semantic search, memory lifecycle)
4. Add notification system (alerts, webhooks)
5. Implement agent configuration management
6. Add plugin/tool marketplace

### 9.2 Technical Implementation

#### 9.2.1 Agent-to-Agent Communication

**New files**: `backend/workflows/collaboration_workflow.py`, `backend/app/infrastructure/message_bus.py`

- Implement message bus for inter-agent communication (Redis Streams or Temporal signals)
- Support patterns:
  - **Direct messaging**: Agent A sends message to Agent B
  - **Broadcast**: Agent sends to all agents in a group
  - **Request-response**: Agent A requests information, Agent B responds
  - **Delegation**: Agent A delegates sub-task to Agent B
- New Temporal workflow: `CollaborationWorkflow` — orchestrates multi-agent task decomposition
- Frontend: Add "Conversations" view showing agent-to-agent message threads
- Frontend: Add "Collaboration Graph" showing which agents are communicating

#### 9.2.2 Visual Workflow Builder

**New file**: `frontend/src/components/WorkflowBuilder.tsx`

- Drag-and-drop node-based workflow editor (using React Flow / xyflow)
- Node types:
  - **Trigger**: Manual, schedule, webhook, event
  - **Agent**: Select agent + prompt template
  - **Condition**: Branch based on output
  - **Transform**: Parse/modify data between steps
  - **Output**: Webhook, notification, memory store
- Workflow persistence in SQLite
- Execute custom workflows via Temporal
- Import/export workflow definitions as JSON
- Pre-built workflow templates (e.g., "Research → Analyze → Report")

#### 9.2.3 Advanced Memory System

**Modify**: `backend/app/infrastructure/memory_manager.py`

- **Semantic search**: Leverage ChromaDB's vector search for natural language memory queries
  - `POST /memories/search` — `{ agent_id, query: "what did we learn about X?" }`
- **Memory lifecycle management**:
  - Auto-archive memories older than configurable TTL
  - Memory consolidation (merge similar memories)
  - Importance scoring based on access frequency
- **Cross-agent memory sharing**:
  - Shared knowledge pool accessible by all agents
  - Per-agent private memories
  - Memory access permissions
- **Memory visualization**:
  - Knowledge graph showing memory connections
  - Memory timeline view
  - Memory usage statistics per agent

#### 9.2.4 Notification System

**New files**: `backend/app/infrastructure/notification_service.py`, `frontend/src/components/NotificationBell.tsx`

- **In-app notifications**: Toast notifications for task completions, agent errors, budget alerts
- **Webhook support**: Configurable webhooks for external integrations
  - `POST /webhooks` — Register webhook URL with event filters
  - Events: `task.completed`, `task.failed`, `agent.error`, `budget.threshold`
- **Email notifications** (optional): Via SMTP for critical alerts
- **Notification preferences**: Per-user configuration of which events trigger notifications
- Frontend: Notification bell icon with dropdown showing recent alerts

#### 9.2.5 Agent Configuration Management

**New files**: `backend/app/domain/agent_config.py`, `frontend/src/components/AgentConfig.tsx`

- **Agent profiles**: Save and load agent configurations
  - Model selection
  - System prompt / persona
  - Enabled toolsets
  - Temperature and other parameters
  - Memory settings (private vs shared, TTL)
- **Environment variables per agent**: Inject custom env vars into agent execution
- **Agent templates**: Pre-configured agent types (e.g., "Researcher", "Coder", "Analyst")
- **Bulk operations**: Register multiple agents from template, update all agent configs
- Frontend: Agent configuration panel in drawer with save/load/clone

#### 9.2.6 Plugin / Tool Marketplace

**New files**: `backend/app/infrastructure/plugin_manager.py`, `frontend/src/components/Marketplace.tsx`

- **Plugin system**: Allow registering custom tools/skills for agents
  - Plugin manifest: `{ name, version, description, tools: [...], config_schema: {...} }`
  - Plugin lifecycle: install → configure → enable → disable → uninstall
- **Built-in plugins**:
  - Web search (already available via Hermes)
  - File system operations
  - Database query (SQL)
  - API caller (REST/GraphQL)
  - Code execution sandbox
- **Marketplace UI**: Browse, install, configure plugins from dashboard
- **Plugin API**: REST endpoints for programmatic plugin management

#### 9.2.7 Dashboard Enhancements

**Modify**: Multiple frontend components

- **Dark/Light theme toggle**: Persist preference in localStorage
- **Keyboard shortcuts**: Power-user navigation (Ctrl+K for command palette)
- **Command palette**: Quick actions (dispatch task, search memory, switch agent)
- **Responsive design**: Mobile-friendly layout for monitoring on the go
- **Drag-and-drop layout**: Customizable dashboard widget arrangement
- **Export features**: Export analytics as PDF/CSV, export task history

### 9.3 Dependencies

| Dependency | Reason | Risk |
|-----------|--------|------|
| @xyflow/react (React Flow) | Visual workflow builder | Medium — complex integration |
| Redis Streams | Inter-agent messaging | Low — already using Redis from Phase 7 |
| nodemailer (frontend) or Python smtplib | Email notifications | Low |

### 9.4 Effort Breakdown

| Task | Hours | Story Points |
|------|-------|-------------|
| Agent-to-agent message bus | 20 | 13 |
| Collaboration workflow (Temporal) | 16 | 8 |
| Visual workflow builder UI | 32 | 21 |
| Workflow persistence & execution | 16 | 8 |
| Advanced memory features | 16 | 8 |
| Notification system (in-app + webhooks) | 16 | 8 |
| Agent configuration management | 12 | 5 |
| Plugin system architecture | 16 | 8 |
| Plugin marketplace UI | 12 | 5 |
| Dashboard enhancements (themes, keyboard, export) | 16 | 8 |
| Integration testing | 16 | 8 |
| **Total** | **188** | **100** |

### 9.5 Success Criteria

- [ ] Agents can communicate via message bus (direct, broadcast, delegation)
- [ ] Visual workflow builder can create and execute multi-step agent pipelines
- [ ] Semantic memory search returns relevant results (precision > 80%)
- [ ] Webhook notifications fire correctly for configured events
- [ ] Agent configurations persist and can be cloned/templated
- [ ] Plugin system supports install/enable/disable lifecycle
- [ ] Dashboard responsive on mobile viewport (≥375px width)
- [ ] Keyboard shortcuts functional for core actions

---

## 7. Timeline & Milestones

### Quarter Overview

```
Week:  1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16
       ├────────────────┤
       │   Phase 6      │
       │  Diagnostics   │
       │  & Cost Track  │
                    ├───────────────┤
                    │   Phase 7     │
                    │  Performance  │
                    │  & Scaling    │
                              ├───────────────────────┤
                              │      Phase 8          │
                              │  Security & Prod Ready│
                                                ├───────────────────────────────┤
                                                │         Phase 9               │
                                                │  Features & Enhancements      │
```

### Detailed Milestones

| Milestone | Target Date | Phase | Deliverables |
|-----------|------------|-------|-------------|
| **M6.1** | Week 2 | Phase 6 | Metrics collection service + Cost tracker backend |
| **M6.2** | Week 3 | Phase 6 | Real analytics dashboard + Cost dashboard UI |
| **M6.3** | Week 4 | Phase 6 | Task history + Structured logging + Workflow status |
| **M7.1** | Week 6 | Phase 7 | WebSocket optimization + Caching layer |
| **M7.2** | Week 7 | Phase 7 | Redis integration + Horizontal scaling prep |
| **M7.3** | Week 8 | Phase 7 | Frontend performance + Load testing complete |
| **M8.1** | Week 10 | Phase 8 | JWT auth + RBAC + Input validation |
| **M8.2** | Week 12 | Phase 8 | Audit logging + TLS + Security hardening |
| **M8.3** | Week 13 | Phase 8 | CI/CD pipeline + Production Docker config |
| **M9.1** | Week 15 | Phase 9 | Agent-to-agent communication + Advanced memory |
| **M9.2** | Week 17 | Phase 9 | Visual workflow builder + Notification system |
| **M9.3** | Week 19 | Phase 9 | Plugin system + Dashboard enhancements |
| **GA** | Week 20 | All | Production launch readiness review |

### Critical Path

```
Phase 6 (Metrics) → Phase 7 (Scaling depends on metrics for benchmarking)
Phase 6 (Cost) → Phase 8 (Budget alerts need cost data)
Phase 7 (Redis) → Phase 8 (Auth needs Redis for token storage)
Phase 7 (Redis) → Phase 9 (Message bus built on Redis Streams)
Phase 8 (Auth) → Phase 9 (Plugin marketplace needs auth)
```

---

## 8. Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Hermes Agent library doesn't expose token counts | Medium | High | Implement token estimation using tiktoken; fallback to approximate counting |
| Temporal.io upgrade breaks workflow compatibility | Low | High | Pin Temporal SDK version; test upgrades in staging first |
| ChromaDB performance degrades at scale (>100K memories) | Medium | Medium | Benchmark early; consider pgvector as alternative if needed |
| React Flow integration complexity for workflow builder | Medium | Medium | Start with simple linear workflows; add branching later |
| WebSocket scaling beyond 10K connections | Low | Medium | Redis Pub/Sub decouples broadcast from connection count |
| Third-party dependency vulnerabilities | Medium | Medium | Automated Trivy scanning in CI; pin dependency versions |
| Scope creep in Phase 9 (too many features) | High | Medium | Strict prioritization; defer plugin marketplace to post-GA if needed |
| Team bandwidth for 4 full phases | Medium | High | Phase 9 features can be released incrementally; core features first |

---

## Appendix A: Recommended Tech Stack Additions

| Purpose | Technology | Justification |
|---------|-----------|---------------|
| Charts | Recharts | Lightweight, React-native, good TypeScript support |
| Workflow Builder | @xyflow/react | Industry standard for node-based editors |
| Rate Limiting | slowapi | FastAPI-native, Redis-backed |
| JWT | python-jose | JWT + JWE support, well-maintained |
| Testing (backend) | pytest + httpx | Standard Python testing stack |
| Testing (frontend) | Vitest + React Testing Library | Fast, Vite-native |
| Caching | Redis 7 | Multi-purpose: cache, pub/sub, rate limit store |
| Monitoring | Prometheus + Grafana | Industry standard, Docker-friendly |
| CI/CD | GitHub Actions | Native to GitHub, free for public repos |
| Load Testing | k6 or Locust | Scriptable, good reporting |

## Appendix B: Environment Variables Reference

```bash
# Backend
TEMPORAL_ADDRESS=localhost:7233          # Temporal server address
CHROMA_PERSIST_DIR=./data/chroma         # ChromaDB storage path
BACKEND_INTERNAL_URL=http://localhost:8000  # Internal API URL (for worker)
JWT_SECRET_KEY=<generated-secret>         # JWT signing key
JWT_ALGORITHM=HS256                       # JWT algorithm
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15        # Access token TTL
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7           # Refresh token TTL
REDIS_URL=redis://localhost:6379          # Redis connection string
CORS_ORIGINS=http://localhost:3000        # Allowed CORS origins
LOG_LEVEL=INFO                            # Logging threshold
RATE_LIMIT_PER_MINUTE=60                  # API rate limit

# Frontend
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws # WebSocket endpoint
NEXT_PUBLIC_API_URL=http://localhost:8000 # REST API endpoint

# Infrastructure
POSTGRES_USER=temporal                    # Temporal DB user
POSTGRES_PWD=<password>                   # Temporal DB password
```

---

*This document should be reviewed and updated at the end of each phase. Adjust timelines based on team velocity and changing priorities.*
