from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from temporalio.client import Client
import uvicorn
import json
import asyncio
import os
from dotenv import load_dotenv

from hermes_engine import HermesEngine
from app.infrastructure.memory_manager import MemoryManager
from app.infrastructure.metrics_collector import MetricsCollector
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
temporal_client = None

@app.on_event("startup")
async def startup_event():
    global temporal_client
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
    # data: {agent_name, level, message}
    await hermes.log(data.get("agent_name", "SYSTEM"), data.get("level", "INFO"), data.get("message", ""))
    return {"status": "ok"}

@app.post("/register")
async def register(request: Request):
    data = await request.json()
    agent = await hermes.register_agent(data["name"], data["role"], data["model"])
    return agent

@app.post("/task")
async def submit_task(request: Request):
    data = await request.json() # {agent_id, title, priority}
    if not temporal_client:
        return {"error": "Temporal client not connected"}, 500

    # Start the workflow
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
            # Update system metrics with current websocket count
            await metrics_collector.update_system_metrics(
                active_websockets=len(manager.active_connections),
                total_agents=len(hermes.agents),
            )
            # Register agents that may not be tracked yet
            for agent in hermes.agents:
                existing = await metrics_collector.get_agent_metrics(agent["id"])
                if not existing:
                    await metrics_collector.register_agent(agent["id"], agent["name"])

            all_metrics = await metrics_collector.get_all_metrics()
            await manager.broadcast(json.dumps({
                "type": "metrics",
                "data": all_metrics,
            }))
        except Exception as e:
            print(f"Metrics broadcast error: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
