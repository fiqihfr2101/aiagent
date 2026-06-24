from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from temporalio.client import Client
import uvicorn
import json
import asyncio
import os
from dotenv import load_dotenv

from hermes_engine import HermesEngine
from app.infrastructure.memory_manager import MemoryManager
from app.infrastructure.metrics_collector import MetricsCollector
from app.infrastructure.task_repository import TaskRepository
from workflows.agent_workflow import AgentTaskWorkflow

# Load environment variables
load_dotenv()

app = FastAPI()

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

manager = ConnectionManager()
metrics_collector = MetricsCollector()
hermes = HermesEngine(manager.broadcast, metrics_collector)
memory = MemoryManager()
task_repo = TaskRepository()
temporal_client = None
# Track active simulated tasks so they can be cancelled
_active_sim_tasks: dict[str, asyncio.Task] = {}


# ─── Pydantic Models ─────────────────────────────────────────────

class AgentCreate(BaseModel):
    name: str
    role: str
    model: str = "claude-sonnet-4"

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    model: Optional[str] = None
    status: Optional[str] = None

class ModelUpdate(BaseModel):
    model: str

class TaskCreate(BaseModel):
    agent_id: str
    title: str
    priority: str = "P2"

class TaskStatusUpdate(BaseModel):
    status: str
    result: Optional[str] = None
    tokens_used: Optional[int] = None


@app.on_event("startup")
async def startup_event():
    global temporal_client
    # Initialize engine (loads agents from DB)
    await hermes.initialize()

    # Connect to Temporal
    temporal_address = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
    try:
        temporal_client = await Client.connect(temporal_address)
        print(f"Connected to Temporal at {temporal_address}")
    except Exception as e:
        print(f"Warning: Could not connect to Temporal: {e}")

    # Register built-in agents with metrics
    for agent in hermes.agents:
        await metrics_collector.register_agent(agent["id"], agent["name"])

    # Start mock telemetry and metrics broadcast
    asyncio.create_task(system_heartbeat())
    asyncio.create_task(metrics_broadcast_loop())
    asyncio.create_task(hermes.start_mock_activity())

@app.get("/health")
async def health():
    return {"status": "ok", "temporal": temporal_client is not None}

@app.post("/log")
async def receive_log(request: Request):
    data = await request.json()
    await hermes.log(data.get("agent_name", "SYSTEM"), data.get("level", "INFO"), data.get("message", ""))
    return {"status": "ok"}

@app.post("/register")
async def register(request: Request):
    data = await request.json()
    agent = await hermes.register_agent(data["name"], data["role"], data["model"])
    return agent

@app.post("/task")
async def submit_task(request: Request):
    data = await request.json()
    if not temporal_client:
        return {"error": "Temporal client not connected"}, 500

    handle = await temporal_client.start_workflow(
        AgentTaskWorkflow.run,
        data,
        id=f"task-{data.get('agent_id')}-{os.urandom(4).hex()}",
        task_queue="hermes-task-queue",
    )

    await hermes.log("SYSTEM", "INFO", f"Triggered workflow for task: {data.get('title')}")
    return {"workflow_id": handle.id}

@app.get("/memories/{agent_id}")
async def get_memories(agent_id: str):
    return await memory.get_all_for_agent(agent_id)


# ─── Agent CRUD Endpoints ─────────────────────────────────────────

@app.post("/agents")
async def create_agent(agent_data: AgentCreate):
    """Register a new agent."""
    agent = await hermes.register_agent(agent_data.name, agent_data.role, agent_data.model)
    return agent

@app.get("/agents")
async def list_agents():
    """List all agents."""
    return hermes.get_agents()

@app.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    """Get agent detail by ID."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent

@app.put("/agents/{agent_id}")
async def update_agent(agent_id: str, data: AgentUpdate):
    """Update agent config."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    updated = await hermes.update_agent(
        agent_id,
        name=data.name,
        role=data.role,
        model=data.model,
        status=data.status,
    )
    return updated

@app.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """Remove an agent."""
    success = await hermes.delete_agent(agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"status": "deleted", "id": agent_id}

@app.put("/agents/{agent_id}/model")
async def update_agent_model(agent_id: str, data: ModelUpdate):
    """Update agent's model."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    updated = await hermes.update_agent_model(agent_id, data.model)
    return updated


# ─── Task Dispatch Endpoints ──────────────────────────────────────

@app.post("/tasks")
async def dispatch_task(task_data: TaskCreate):
    """Dispatch a new task to an agent."""
    # Verify agent exists
    agent = hermes.get_agent(task_data.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Create task in DB
    workflow_id = None
    task = task_repo.create(task_data.agent_id, task_data.title, task_data.priority)

    # Try to start Temporal workflow
    if temporal_client:
        try:
            wf_id = f"task-{task_data.agent_id}-{os.urandom(4).hex()}"
            wf_data = {
                "agent_id": task_data.agent_id,
                "title": task_data.title,
                "priority": task_data.priority,
                "task_id": task["id"],
            }
            handle = await temporal_client.start_workflow(
                AgentTaskWorkflow.run,
                wf_data,
                id=wf_id,
                task_queue="hermes-task-queue",
            )
            workflow_id = handle.id
            task_repo.update_status(task["id"], "RUNNING")
            task["status"] = "RUNNING"
            task["workflow_id"] = workflow_id
        except Exception as e:
            print(f"Temporal workflow start failed: {e}")
            # Task remains QUEUED - can be retried
    else:
        # No Temporal - simulate task execution
        task_repo.update_status(task["id"], "RUNNING")
        task["status"] = "RUNNING"
        asyncio.create_task(_simulate_task(task["id"], task_data.agent_id, task_data.title))

    await hermes.log("SYSTEM", "INFO", f"Task dispatched: {task_data.title} → {agent['name']}")
    
    # Broadcast task update via WebSocket
    await manager.broadcast(json.dumps({
        "type": "task_update",
        "task": task,
    }))

    return task


async def _simulate_task(task_id: str, agent_id: str, title: str):
    """Simulate task execution when Temporal is not available."""
    import random
    # Store ref so we can cancel on stop
    _active_sim_tasks[task_id] = asyncio.current_task()
    await asyncio.sleep(random.randint(3, 10))
    tokens = random.randint(100, 5000)
    result = json.dumps({"output": f"Simulated completion of: {title}"})
    # Only complete if not already stopped
    current = task_repo.get_by_id(task_id)
    if current and current["status"] == "RUNNING":
        task_repo.update_status(task_id, "COMPLETED", result=result, tokens_used=tokens)
        task = task_repo.get_by_id(task_id)
        await hermes.log("SYSTEM", "INFO", f"Task completed: {title}")
        await manager.broadcast(json.dumps({
            "type": "task_update",
            "task": task,
        }))
    _active_sim_tasks.pop(task_id, None)


@app.get("/tasks/history")
async def get_task_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    agent_id: Optional[str] = None,
    status: Optional[str] = None,
):
    """Get paginated task history."""
    return task_repo.get_history(page=page, page_size=page_size, agent_id=agent_id, status=status)


@app.get("/tasks/{task_id}")
async def get_task(task_id: str):
    """Get task detail by ID."""
    task = task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.post("/tasks/{task_id}/stop")
async def stop_task(task_id: str):
    """Stop a running or queued task."""
    task = task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["status"] not in ("QUEUED", "RUNNING"):
        raise HTTPException(status_code=400, detail=f"Cannot stop task with status: {task['status']}")

    # Cancel simulated task if active
    sim_task = _active_sim_tasks.pop(task_id, None)
    if sim_task and not sim_task.done():
        sim_task.cancel()

    # Try to signal Temporal workflow to cancel
    if temporal_client and task.get("workflow_id"):
        try:
            handle = temporal_client.get_workflow_handle(task["workflow_id"])
            await handle.signal(AgentTaskWorkflow.cancel_task)
        except Exception as e:
            print(f"Failed to signal Temporal workflow: {e}")

    # Use engine stop_task for cleanup + logging
    await hermes.stop_task(task_id)
    updated_task = task_repo.get_by_id(task_id)

    # Broadcast both task_update (for history refresh) and task_stopped (for toast)
    await manager.broadcast(json.dumps({
        "type": "task_update",
        "task": updated_task,
    }))
    await manager.broadcast(json.dumps({
        "type": "task_stopped",
        "task": updated_task,
    }))

    return updated_task


@app.get("/tasks")
async def list_tasks(
    agent_id: Optional[str] = None,
    status: Optional[str] = None,
):
    """List tasks with optional filters."""
    return task_repo.get_all(agent_id=agent_id, status=status)


@app.post("/tasks/{task_id}/status")
async def update_task_status(task_id: str, data: TaskStatusUpdate):
    """Internal endpoint to update task status (called by Temporal activities)."""
    task = task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task_repo.update_status(task_id, data.status, result=data.result, tokens_used=data.tokens_used)
    updated_task = task_repo.get_by_id(task_id)

    # Broadcast task update
    await manager.broadcast(json.dumps({
        "type": "task_update",
        "task": updated_task,
    }))

    return updated_task


@app.get("/tasks/counts")
async def get_task_counts():
    """Get active task counts per agent."""
    return task_repo.get_all_active_task_counts()


# ─── Metrics Endpoints ────────────────────────────────────────────

@app.get("/metrics")
async def get_all_metrics():
    """Return all metrics (agents, tasks, system)."""
    return await metrics_collector.get_all_metrics()

@app.get("/metrics/agents")
async def get_agent_metrics():
    """Return agent-specific metrics."""
    return await metrics_collector.get_all_agent_metrics()

@app.get("/metrics/system")
async def get_system_metrics():
    """Return system-wide metrics."""
    return await metrics_collector.get_system_metrics()

@app.post("/metrics/collect")
async def collect_metrics(request: Request):
    """Receive metrics from external agents."""
    data = await request.json()
    result = await metrics_collector.ingest_external_metrics(data)
    return result

# ─── WebSocket ────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    await hermes.sync_fleet()
    # Send current task counts on connect
    try:
        counts = task_repo.get_all_active_task_counts()
        await websocket.send_text(json.dumps({
            "type": "task_counts",
            "counts": counts,
        }))
    except Exception:
        pass
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ─── Background Tasks ─────────────────────────────────────────────

async def system_heartbeat():
    while True:
        status_update = {
            "type": "heartbeat",
            "status": "online",
            "active_nodes": len(hermes.agents),
            "running": 6
        }
        await manager.broadcast(json.dumps(status_update))
        await asyncio.sleep(5)

async def metrics_broadcast_loop():
    """Broadcast metrics snapshot to all WebSocket clients every 5 seconds."""
    while True:
        await asyncio.sleep(5)
        try:
            await metrics_collector.update_system_metrics(
                active_websockets=len(manager.active_connections),
                total_agents=len(hermes.agents),
            )
            for agent in hermes.agents:
                existing = await metrics_collector.get_agent_metrics(agent["id"])
                if not existing:
                    await metrics_collector.register_agent(agent["id"], agent["name"])

            all_metrics = await metrics_collector.get_all_metrics()
            
            # Also broadcast task counts
            counts = task_repo.get_all_active_task_counts()
            
            await manager.broadcast(json.dumps({
                "type": "metrics",
                "data": all_metrics,
            }))
            await manager.broadcast(json.dumps({
                "type": "task_counts",
                "counts": counts,
            }))
        except Exception as e:
            print(f"Metrics broadcast error: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
