from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from temporalio.client import Client
import uvicorn
import json
import asyncio
import os
import uuid
import logging
import time
from dotenv import load_dotenv
from contextlib import asynccontextmanager

from hermes_engine import HermesEngine
from app.infrastructure.memory_manager import MemoryManager
from app.infrastructure.metrics_collector import MetricsCollector
from app.infrastructure.task_repository import TaskRepository
from app.infrastructure.log_repository import LogRepository
from app.infrastructure.agent_repository import VALID_MODELS
from app.infrastructure.notification_service import NotificationService
from app.infrastructure.cache_service import cache
from app.infrastructure.ws_manager import ws_manager, CHANNELS
from workflows.agent_workflow import AgentTaskWorkflow
from app.infrastructure.auth_service import (
    LoginRequest, RefreshRequest, LogoutRequest,
    authenticate_user, create_token_pair, validate_token,
    revoke_token, revoke_all_user_tokens, register_user,
)
from app.infrastructure.rate_limiter import rate_limiter

# Load environment variables
load_dotenv()

# ─── Structured Logging ──────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("hermes")

temporal_client = None

# ─── Lifespan Context Manager ───────────────────────────────────
@asynccontextmanager
async def lifespan(app):
    global temporal_client
    # Startup
    await cache.connect()
    await ws_manager.start()
    await hermes.initialize()

    temporal_address = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
    try:
        temporal_client = await Client.connect(temporal_address)
        logger.info("Connected to Temporal at %s", temporal_address)
    except Exception as e:
        logger.warning("Could not connect to Temporal: %s", e)

    for agent in hermes.agents:
        await metrics_collector.register_agent(agent["id"], agent["name"])

    asyncio.create_task(system_heartbeat())
    asyncio.create_task(ws_metrics_broadcast_loop())
    asyncio.create_task(hermes.start_mock_activity())

    yield

    # Shutdown (cleanup if needed)

app = FastAPI(lifespan=lifespan)

# ─── CORS Hardening ───────────────────────────────────────────────
# Restrict origins to specific frontend URL
_allowed_origins = os.getenv(
    "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "Accept"],
)

# ─── Security Headers Middleware ──────────────────────────────────
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Add security headers to all responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss: http: https:; img-src 'self' data: blob:;"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response

# ─── Rate Limiting Middleware ─────────────────────────────────────
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Apply rate limiting to all requests."""
    # Skip rate limiting for health check and WebSocket upgrades
    if request.url.path == "/health" or request.headers.get("upgrade", "").lower() == "websocket":
        return await call_next(request)

    rate_info = rate_limiter.check_rate_limit(request)
    response = await call_next(request)

    # Add rate limit headers to response
    if rate_info:
        for key, value in rate_info.items():
            response.headers[key] = value

    return response

# ─── Request Size Limit ──────────────────────────────────────────
MAX_REQUEST_SIZE = int(os.getenv("MAX_REQUEST_SIZE", str(10 * 1024 * 1024)))  # 10MB default

# ─── Request ID Middleware ────────────────────────────────────────
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Attach a unique request ID to every request for traceability."""
    request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
    request.state.request_id = request_id
    start_time = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start_time) * 1000, 1)
    response.headers["X-Request-ID"] = request_id
    # Cache headers for GET requests
    if request.method == "GET":
        path = request.url.path
        if path.startswith("/agents"):
            response.headers["Cache-Control"] = "public, max-age=30"
        elif path.startswith("/tasks"):
            response.headers["Cache-Control"] = "public, max-age=10"
        elif path.startswith("/metrics"):
            response.headers["Cache-Control"] = "public, max-age=60"
        else:
            response.headers["Cache-Control"] = "no-cache"
    else:
        response.headers["Cache-Control"] = "no-cache"
    logger.info(
        "%s %s → %s (%.1fms) [req=%s]",
        request.method, request.url.path, response.status_code, duration_ms, request_id,
    )
    return response

# Legacy shim: keep HermesEngine working with old broadcast signature
async def _broadcast_shim(message: str):
    await ws_manager.broadcast(message)

metrics_collector = MetricsCollector()
memory = MemoryManager()
log_repo = LogRepository()
task_repo = TaskRepository(log_repo=log_repo)
hermes = HermesEngine(_broadcast_shim, metrics_collector, task_repo=task_repo)
notification_svc = NotificationService()
# Track active simulated tasks so they can be cancelled
_active_sim_tasks: dict[str, asyncio.Task] = {}


# ─── Notification Helper ──────────────────────────────────────────

async def _emit_notification(
    notif_type: str,
    title: str,
    description: str = "",
    data: dict = None,
    # Telegram push params (optional)
    task_title: str = None,
    agent_name: str = None,
    duration: float = None,
    tokens_used: int = 0,
    cost: float = 0.0,
    status: str = None,
):
    """Create notification, broadcast via WebSocket, and push to Telegram."""
    # Store in DB
    notif = notification_svc.create(notif_type, title, description, data)

    # Broadcast to notifications channel
    await ws_manager.broadcast(json.dumps({
        "type": "new_notification",
        "notification": notif,
    }), channel="notifications")

    # Push to Telegram if task-related
    if task_title and agent_name and status:
        telegram_msg = notification_svc.format_task_telegram(
            task_title=task_title,
            agent_name=agent_name,
            status=status,
            duration=duration,
            tokens_used=tokens_used,
            cost=cost,
        )
        await notification_svc.send_telegram(telegram_msg)


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

class NotificationRead(BaseModel):
    id: str



@app.get("/health")
async def health():
    return {"status": "ok", "temporal": temporal_client is not None}

# ─── Auth Endpoints ───────────────────────────────────────────────

@app.post("/auth/login")
async def auth_login(request: Request, login_data: LoginRequest):
    """Authenticate user and return JWT tokens."""
    user = authenticate_user(login_data.username, login_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    tokens = create_token_pair(user)
    logger.info("User logged in: %s", user["username"])
    return tokens


@app.post("/auth/refresh")
async def auth_refresh(request: Request, refresh_data: RefreshRequest):
    """Refresh an access token using a valid refresh token."""
    payload = validate_token(refresh_data.refresh_token, token_type="refresh")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Revoke old refresh token (rotation)
    revoke_token(refresh_data.refresh_token)

    user_data = {"username": payload["sub"], "role": payload.get("role", "user")}
    tokens = create_token_pair(user_data)
    return tokens


@app.post("/auth/logout")
async def auth_logout(request: Request, logout_data: LogoutRequest):
    """Logout user and revoke tokens."""
    # Get user from Authorization header if present
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        access_token = auth_header[7:]
        revoke_token(access_token)

    if logout_data.refresh_token:
        revoke_token(logout_data.refresh_token)

    return {"status": "ok", "message": "Logged out successfully"}


@app.get("/auth/me")
async def auth_me(request: Request):
    """Get current authenticated user info."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = validate_token(auth_header[7:], token_type="access")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {"username": payload["sub"], "role": payload.get("role", "user")}

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

@app.get("/cache/status")
async def cache_status():
    """Get Redis cache status and statistics."""
    info = await cache.info()
    hit_rate = None
    if info.get("hits") and info.get("misses"):
        total = info["hits"] + info["misses"]
        hit_rate = round(info["hits"] / total * 100, 1) if total > 0 else 0
    return {
        "available": info.get("available", False),
        "hits": info.get("hits", 0),
        "misses": info.get("misses", 0),
        "hit_rate_percent": hit_rate,
        "connected_clients": info.get("connected_clients", 0),
        "used_memory": info.get("used_memory_human", "N/A"),
    }

@app.post("/agents")
async def create_agent(agent_data: AgentCreate):
    """Register a new agent."""
    agent = await hermes.register_agent(agent_data.name, agent_data.role, agent_data.model)
    # Create notification for new agent
    await _emit_notification(
        "agent_registered",
        f"New Agent: {agent_data.name}",
        f"Role: {agent_data.role} · Model: {agent_data.model}",
        {"agent_id": agent.get("id"), "name": agent_data.name, "model": agent_data.model},
    )
    # Invalidate agent cache on creation
    await cache.invalidate_agents()
    return agent

@app.get("/agents")
async def list_agents():
    """List all agents."""
    cached = await cache.get("agents:list")
    if cached is not None:
        return cached
    result = hermes.get_agents()
    await cache.set("agents:list", result, ttl=30)
    return result

@app.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    """Get agent detail by ID."""
    cache_key = f"agents:detail:{agent_id}"
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await cache.set(cache_key, agent, ttl=30)
    return agent

@app.put("/agents/{agent_id}")
async def update_agent(agent_id: str, data: AgentUpdate):
    """Update agent config."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if data.model is not None and data.model not in VALID_MODELS:
        raise HTTPException(status_code=400, detail=f"Invalid model: {data.model}. Valid models: {', '.join(sorted(VALID_MODELS))}")
    updated = await hermes.update_agent(
        agent_id,
        name=data.name,
        role=data.role,
        model=data.model,
        status=data.status,
    )
    # If model changed, broadcast model_update
    if data.model and data.model != agent.get("model"):
        await ws_manager.broadcast(json.dumps({
            "type": "model_update",
            "agent_id": agent_id,
            "model": data.model,
            "agent": updated,
        }), channel="agents")
    # Invalidate agent cache on update
    await cache.invalidate_agents()
    return updated

@app.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """Remove an agent."""
    success = await hermes.delete_agent(agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")
    # Invalidate agent cache on deletion
    await cache.invalidate_agents()
    return {"status": "deleted", "id": agent_id}

@app.put("/agents/{agent_id}/model")
async def update_agent_model(agent_id: str, data: ModelUpdate):
    """Update agent's model."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if data.model not in VALID_MODELS:
        raise HTTPException(status_code=400, detail=f"Invalid model: {data.model}. Valid models: {', '.join(sorted(VALID_MODELS))}")
    updated = await hermes.update_agent_model(agent_id, data.model)
    # Broadcast model_update for immediate UI refresh
    await ws_manager.broadcast(json.dumps({
        "type": "model_update",
        "agent_id": agent_id,
        "model": data.model,
        "agent": updated,
    }), channel="agents")
    # Invalidate agent cache on model update
    await cache.invalidate_agents()
    return updated

@app.get("/models")
async def list_models():
    """List available models with their rates."""
    rates = await metrics_collector.get_model_rates()
    models = []
    for model_name in sorted(VALID_MODELS):
        rate = rates.get(model_name, rates.get("default", {"input": 0.003, "output": 0.015}))
        # Determine family for color-coding
        family = "other"
        if "claude" in model_name:
            family = "claude"
        elif "gpt" in model_name:
            family = "gpt"
        elif "kimi" in model_name:
            family = "kimi"
        models.append({
            "id": model_name,
            "name": model_name,
            "family": family,
            "rates": rate,
        })
    return models

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
                "model": agent.get("model", "claude-sonnet-4"),
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
            logger.error("Temporal workflow start failed: %s", e)
            # Task remains QUEUED - can be retried
    else:
        # No Temporal - simulate task execution
        task_repo.update_status(task["id"], "RUNNING")
        task["status"] = "RUNNING"
        asyncio.create_task(_simulate_task(task["id"], task_data.agent_id, task_data.title))
        # Track task start in metrics
        await metrics_collector.start_task(task["id"], task_data.agent_id)

    await hermes.log("SYSTEM", "INFO", f"Task dispatched: {task_data.title} → {agent['name']}")
    
    # Broadcast task update via WebSocket (tasks channel)
    await ws_manager.broadcast(json.dumps({
        "type": "task_update",
        "task": task,
    }), channel="tasks")

    # Invalidate task cache on new dispatch
    await cache.invalidate_tasks()
    return task


async def _simulate_task(task_id: str, agent_id: str, title: str):
    """Simulate task execution when Temporal is not available."""
    import random
    # Store ref so we can cancel on stop
    _active_sim_tasks[task_id] = asyncio.current_task()
    log_repo.create(f"Task execution started: {title}", level="INFO", task_id=task_id, agent_id=agent_id)
    log_repo.create(f"Connecting to agent model...", level="DEBUG", task_id=task_id, agent_id=agent_id)
    await asyncio.sleep(random.randint(3, 10))
    tokens = random.randint(100, 5000)
    input_tokens = random.randint(50, tokens // 2)
    output_tokens = tokens - input_tokens
    log_repo.create(f"Generated {tokens} tokens (input: {input_tokens}, output: {output_tokens})", level="DEBUG", task_id=task_id, agent_id=agent_id)
    result = json.dumps({"output": f"Simulated completion of: {title}"})
    # Only complete if not already stopped
    current = task_repo.get_by_id(task_id)
    if current and current["status"] == "RUNNING":
        log_repo.create(f"Task processing complete, writing results...", level="INFO", task_id=task_id, agent_id=agent_id)
        task_repo.update_status(task_id, "COMPLETED", result=result, tokens_used=tokens)
        task = task_repo.get_by_id(task_id)

        # Track cost in metrics collector
        agent = hermes.get_agent(agent_id)
        model = agent.get("model", "default") if agent else "default"
        duration = random.uniform(3.0, 10.0)
        await metrics_collector.complete_task(
            task_id=task_id,
            success=True,
            duration=duration,
            token_usage=tokens,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=model,
        )

        # Create notification for completed task
        agent_name = agent.get("name", agent_id) if agent else agent_id
        task_metrics = await metrics_collector.get_task_metrics(task_id)
        cost = task_metrics.get("cost", 0.0) if task_metrics else 0.0
        await _emit_notification(
            "task_completed",
            f"Task Completed: {title}",
            f"Agent: {agent_name} · Duration: {duration:.1f}s · Tokens: {tokens:,} · Cost: ${cost:.4f}",
            {"task_id": task_id, "agent_id": agent_id, "agent_name": agent_name, "duration": duration, "tokens": tokens, "cost": cost},
            task_title=title,
            agent_name=agent_name,
            duration=duration,
            tokens_used=tokens,
            cost=cost,
            status="COMPLETED",
        )

        log_repo.create(f"Task completed successfully. Cost: ${cost:.4f}", level="INFO", task_id=task_id, agent_id=agent_id)
        await hermes.log("SYSTEM", "INFO", f"Task completed: {title}")
        await ws_manager.broadcast(json.dumps({
            "type": "task_update",
            "task": task,
        }), channel="tasks")
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


@app.get("/tasks/counts")
async def get_task_counts():
    """Get active task counts per agent."""
    return task_repo.get_all_active_task_counts()


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
        log_repo.create("Task execution cancelled by user", level="WARNING", task_id=task_id, agent_id=task.get("agent_id"))

    # Try to signal Temporal workflow to cancel
    if temporal_client and task.get("workflow_id"):
        try:
            handle = temporal_client.get_workflow_handle(task["workflow_id"])
            await handle.signal(AgentTaskWorkflow.cancel_task)
        except Exception as e:
            logger.error("Failed to signal Temporal workflow: %s", e)

    # Use engine stop_task for cleanup + logging
    await hermes.stop_task(task_id)
    updated_task = task_repo.get_by_id(task_id)

    # Create notification for stopped task
    agent = hermes.get_agent(updated_task.get("agent_id"))
    agent_name = agent.get("name", updated_task.get("agent_id")) if agent else updated_task.get("agent_id")
    await _emit_notification(
        "task_stopped",
        f"Task Stopped: {updated_task.get('title', task_id)}",
        f"Agent: {agent_name} · Stopped by user",
        {"task_id": task_id, "agent_id": updated_task.get("agent_id")},
    )

    # Broadcast both task_update (for history refresh) and task_stopped (for toast)
    await ws_manager.broadcast(json.dumps({
        "type": "task_update",
        "task": updated_task,
    }), channel="tasks")
    await ws_manager.broadcast(json.dumps({
        "type": "task_stopped",
        "task": updated_task,
    }), channel="tasks")

    # Invalidate task cache on stop
    await cache.invalidate_tasks()
    return updated_task


@app.get("/tasks")
async def list_tasks(
    agent_id: Optional[str] = None,
    status: Optional[str] = None,
):
    """List tasks with optional filters."""
    cache_key = f"tasks:list:{agent_id or 'all'}:{status or 'all'}"
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached
    result = task_repo.get_all(agent_id=agent_id, status=status)
    await cache.set(cache_key, result, ttl=10)
    return result


@app.post("/tasks/{task_id}/status")
async def update_task_status(task_id: str, data: TaskStatusUpdate):
    """Internal endpoint to update task status (called by Temporal activities)."""
    task = task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task_repo.update_status(task_id, data.status, result=data.result, tokens_used=data.tokens_used)
    updated_task = task_repo.get_by_id(task_id)

    # Broadcast task update (tasks channel)
    await ws_manager.broadcast(json.dumps({
        "type": "task_update",
        "task": updated_task,
    }), channel="tasks")

    return updated_task


# ─── Log Endpoints ───────────────────────────────────────────────

class LogCreate(BaseModel):
    message: str
    level: str = "INFO"
    task_id: Optional[str] = None
    agent_id: Optional[str] = None

@app.get("/tasks/{task_id}/logs")
async def get_task_logs(task_id: str, limit: int = Query(100, ge=1, le=500)):
    """Get logs for a specific task."""
    task = task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return log_repo.get_for_task(task_id, limit=limit)

@app.get("/logs")
async def get_all_logs(
    level: Optional[str] = None,
    agent_id: Optional[str] = None,
    task_id: Optional[str] = None,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """Get all logs with optional filters."""
    return log_repo.get_all(
        task_id=task_id, agent_id=agent_id, level=level, limit=limit, offset=offset
    )

@app.post("/logs")
async def create_log(data: LogCreate, request: Request):
    """Add a log entry."""
    request_id = getattr(request.state, "request_id", None)
    entry = log_repo.create(
        message=data.message,
        level=data.level,
        task_id=data.task_id,
        agent_id=data.agent_id,
        request_id=request_id,
    )
    # Broadcast to logs channel
    await ws_manager.broadcast(json.dumps({
        "type": "new_log",
        "log": entry,
    }), channel="logs")
    return entry


# ─── Metrics Endpoints ────────────────────────────────────────────

@app.get("/metrics")
async def get_all_metrics():
    """Return all metrics (agents, tasks, system)."""
    cached = await cache.get("metrics:all")
    if cached is not None:
        return cached
    result = await metrics_collector.get_all_metrics()
    await cache.set("metrics:all", result, ttl=60)
    return result

@app.get("/metrics/agents")
async def get_agent_metrics():
    """Return agent-specific metrics."""
    cached = await cache.get("metrics:agents")
    if cached is not None:
        return cached
    result = await metrics_collector.get_all_agent_metrics()
    await cache.set("metrics:agents", result, ttl=60)
    return result

@app.get("/metrics/system")
async def get_system_metrics():
    """Return system-wide metrics."""
    cached = await cache.get("metrics:system")
    if cached is not None:
        return cached
    result = await metrics_collector.get_system_metrics()
    await cache.set("metrics:system", result, ttl=60)
    return result

@app.post("/metrics/collect")
async def collect_metrics(request: Request):
    """Receive metrics from external agents."""
    data = await request.json()
    result = await metrics_collector.ingest_external_metrics(data)
    return result


# ─── Cost Tracking Endpoints ─────────────────────────────────────

@app.get("/metrics/costs")
async def get_cost_summary():
    """Get total cost summary with trend."""
    cached = await cache.get("metrics:costs:summary")
    if cached is not None:
        return cached
    result = await metrics_collector.get_cost_summary()
    await cache.set("metrics:costs:summary", result, ttl=60)
    return result

@app.get("/metrics/costs/agents")
async def get_cost_by_agent():
    """Get cost breakdown by agent."""
    cached = await cache.get("metrics:costs:by_agent")
    if cached is not None:
        return cached
    result = await metrics_collector.get_cost_by_agent()
    await cache.set("metrics:costs:by_agent", result, ttl=60)
    return result

@app.get("/metrics/costs/models")
async def get_cost_by_model():
    """Get cost breakdown by model."""
    cached = await cache.get("metrics:costs:by_model")
    if cached is not None:
        return cached
    result = await metrics_collector.get_cost_by_model()
    await cache.set("metrics:costs:by_model", result, ttl=60)
    return result

@app.get("/metrics/costs/daily")
async def get_cost_daily(days: int = Query(30, ge=1, le=365)):
    """Get daily cost trend."""
    return await metrics_collector.get_cost_daily(days)

@app.get("/metrics/costs/rates")
async def get_model_rates():
    """Get current model token rates."""
    return await metrics_collector.get_model_rates()

@app.put("/metrics/costs/rates/{model}")
async def update_model_rate(model: str, request: Request):
    """Update token rates for a model."""
    data = await request.json()
    return await metrics_collector.update_model_rate(
        model, data.get("input", 0.003), data.get("output", 0.015)
    )

# ─── Notification Endpoints ───────────────────────────────────────

@app.get("/notifications")
async def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    unread_only: bool = False,
):
    """List notifications (paginated)."""
    return notification_svc.get_all(page=page, page_size=page_size, unread_only=unread_only)

@app.post("/notifications/read")
async def mark_notification_read(data: NotificationRead):
    """Mark a notification as read."""
    result = notification_svc.mark_read(data.id)
    if not result:
        raise HTTPException(status_code=404, detail="Notification not found")
    return result

@app.post("/notifications/read-all")
async def mark_all_notifications_read():
    """Mark all notifications as read."""
    count = notification_svc.mark_all_read()
    return {"status": "ok", "marked": count}

@app.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str):
    """Delete a notification."""
    success = notification_svc.delete(notification_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "deleted", "id": notification_id}

# ─── WebSocket ────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_id = await ws_manager.connect(websocket)
    await hermes.sync_fleet()
    # Send initial data on connect
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
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            msg_type = data.get("type")
            if msg_type == "pong":
                ws_manager.handle_pong(client_id)
            elif msg_type == "subscribe":
                channels = data.get("channels", [])
                ws_manager.subscribe(client_id, channels)
                await websocket.send_text(json.dumps({
                    "type": "subscribed",
                    "channels": list(ws_manager._clients[client_id].channels),
                }))
            elif msg_type == "unsubscribe":
                channels = data.get("channels", [])
                ws_manager.unsubscribe(client_id, channels)
    except WebSocketDisconnect:
        await ws_manager.disconnect(client_id)
    except Exception:
        await ws_manager.disconnect(client_id)

# ─── Background Tasks ─────────────────────────────────────────────

async def system_heartbeat():
    while True:
        status_update = {
            "type": "heartbeat",
            "status": "online",
            "active_nodes": len(hermes.agents),
            "running": sum(1 for a in hermes.agents if a.get("status") == "active"),
            "sleeping": sum(1 for a in hermes.agents if a.get("status") == "idle"),
            "offline": sum(1 for a in hermes.agents if a.get("status") == "offline"),
        }
        await ws_manager.broadcast(json.dumps(status_update), channel="system")
        await asyncio.sleep(ws_manager._heartbeat_interval)

async def ws_metrics_broadcast_loop():
    """Broadcast metrics + task counts every 5s, batched into one frame."""
    while True:
        await asyncio.sleep(5)
        try:
            await metrics_collector.update_system_metrics(
                active_websockets=ws_manager.connection_count,
                total_agents=len(hermes.agents),
            )
            for agent in hermes.agents:
                existing = await metrics_collector.get_agent_metrics(agent["id"])
                if not existing:
                    await metrics_collector.register_agent(agent["id"], agent["name"])

            all_metrics = await metrics_collector.get_all_metrics()
            counts = task_repo.get_all_active_task_counts()

            # Batch both messages to the metrics channel
            await ws_manager.batch_broadcast([
                json.dumps({"type": "metrics", "data": all_metrics}),
                json.dumps({"type": "task_counts", "counts": counts}),
            ], channel="metrics")
        except Exception as e:
            logger.error("Metrics broadcast error: %s", e)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
