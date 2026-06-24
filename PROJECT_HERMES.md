# H.E.R.M.E.S. — AI Agent Orchestrator (Mission Control)

Project H.E.R.M.E.S. adalah dashboard orkestrasi AI agent real-time berskala enterprise.

## 🏗️ Enterprise Architecture
- **Frontend:** Next.js 14+ (TypeScript, Tailwind, WebSocket)
- **Backend:** FastAPI (Python)
- **Workflow Engine:** **Temporal.io** (Ensures task reliability & state persistence)
- **Design Pattern:** **Clean Architecture / DDD** (Domain-Driven Design)
- **Memory Database:** ChromaDB
- **Infrastructure:** Docker Compose (Multiple Services)

---

## 📂 New Clean Architecture Structure (Backend)
```
backend/
├── app/
│   ├── domain/         # Pure logic & entities (Agent, Task, Memory)
│   ├── application/    # Use Cases (OrchestrateTask, RegisterAgent)
│   ├── infrastructure/ # External implementations (ChromaDB, Temporal Client)
│   └── interfaces/     # Entry points (FastAPI routes, WebSockets)
├── workflows/          # Temporal Workflow definitions
├── activities/         # Temporal Activity definitions (Hermes tool calls)
├── worker.py           # Temporal Worker process
└── main.py             # FastAPI Server
```

---

## 🗺️ Updated Roadmap

### Phase 1 & 2: Base UI & API (Done)
- [x] Next.js Refactoring.
- [x] Basic WebSocket & API connection.

### Phase 3.6: Enterprise Refactoring 🛡️
- [x] Implement Clean Architecture layers in `/backend`.
- [x] Setup Temporal.io local cluster (via Docker Compose).
- [x] Define `AgentTaskWorkflow` to handle long-running agent operations.
- [x] Implement Temporal Worker to process Hermes tasks.

### Phase 4 & 5: AI & Memory 🧠
- [x] Integrate official Hermes Agent library into Infrastructure.
- [x] Implement `HermesAdapter` for autonomous agent execution.
- [x] Integrate Hermes tasks into Temporal Workflows & Activities.
- [x] Setup persistence for agent memories via ChromaDB.
- [x] Implement Task Routing from Dashboard UI to Temporal.
- [x] Real-time log streaming from Hermes to Next.js.
- [ ] Advanced diagnostics & cost tracking.
