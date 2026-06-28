from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from temporalio.client import Client
import uvicorn
import json
import asyncio
import os
import socket
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
from app.infrastructure.agent_repository_pg import VALID_MODELS
from app.infrastructure.agent_config_repository import AgentConfigRepository
from app.infrastructure.notification_service import NotificationService
from app.infrastructure.cache_service import cache
from app.infrastructure.ws_manager import ws_manager, CHANNELS
from app.infrastructure.workflow_repository import WorkflowRepository
from app.infrastructure.plugin_manager import plugin_manager
from app.infrastructure.opencode_adapter import opencode_adapter
from workflows.agent_workflow import AgentTaskWorkflow
from app.infrastructure.auth_service import (
    LoginRequest, RefreshRequest, LogoutRequest,
    authenticate_user, create_token_pair, validate_token,
    revoke_token, revoke_all_user_tokens, register_user,
    change_password, set_user_2fa_secret, enable_2fa, disable_2fa, get_user_2fa_info,
)
from app.infrastructure.account_service import setup_2fa, verify_totp_code
from app.infrastructure.rate_limiter import rate_limiter
from app.interfaces.schemas import (
    AgentCreate, AgentUpdate, AgentModelUpdate,
    TaskCreate, TaskUpdate, TaskSubmit,
    LoginRequest as SchemaLoginRequest, RefreshRequest as SchemaRefreshRequest,
    NotificationCreate, NotificationRead,
    LogCreate as SchemaLogCreate, LogReceive, RegisterRaw,
    MetricsCollect, ModelRateUpdate,
    MessageSend, MessageMarkRead,
    sanitize_plain, sanitize_text,
    WorkflowCreate, WorkflowUpdate,
    MemorySearch, MemoryShare,
    PluginInstall, PluginConfigUpdate,
    PasswordChangeRequest, TwoFASetupRequest, TwoFAVerifyRequest, TwoFADisableRequest,
)
from app.interfaces.config_schemas import (
    AgentConfigSave, AgentConfigClone,
    TemplateCreate, TemplateApply, TemplateFromAgent,
    EnvVarSet,
)
from app.interfaces.roles import get_all_roles, get_role_by_id

# ─── Input Sanitization Helpers ─────────────────────────────────
def _sanitize_string(value: str) -> str:
    """Strip null bytes and control characters from string input."""
    if not isinstance(value, str):
        return value
    value = value.replace('\x00', '')
    value = __import__('re').sub(r'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
    return value.strip()

def _sanitize_dict(d: dict) -> dict:
    """Recursively sanitize all string values in a dict."""
    out = {}
    for k, v in d.items():
        if isinstance(v, str):
            out[k] = _sanitize_string(v)
        elif isinstance(v, dict):
            out[k] = _sanitize_dict(v)
        elif isinstance(v, list):
            out[k] = [_sanitize_string(i) if isinstance(i, str) else i for i in v]
        else:
            out[k] = v
    return out


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
# Get local IP for network access
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

_local_ip = get_local_ip()
# Allow localhost, 127.0.0.1, local network IP, Docker IPs, and Cloudflare domain
_allowed_origins = os.getenv(
    "CORS_ORIGINS", 
    f"http://localhost:3000,http://127.0.0.1:3000,http://{_local_ip}:3000,http://192.168.0.105:3000,http://172.18.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://{_local_ip}:3001,http://orc.routex.web.id,https://orc.routex.web.id,http://api-orc.routex.web.id,https://api-orc.routex.web.id,http://staging-orc.routex.web.id,https://staging-orc.routex.web.id,http://staging-api-orc.routex.web.id,https://staging-api-orc.routex.web.id"
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
    # Validate Content-Type for POST/PUT requests
    if request.method in ("POST", "PUT", "PATCH"):
        content_type = request.headers.get("content-type", "")
        if content_type and not content_type.startswith(("application/json", "multipart/form-data", "application/x-www-form-urlencoded")):
            logger.warning("Rejected request with invalid Content-Type: %s [path=%s]", content_type, request.url.path)
            raise HTTPException(status_code=415, detail="Unsupported Media Type. Use application/json.")

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss: http: https:; img-src 'self' data: blob:;"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # Ensure JSON responses use correct Content-Type
    if request.url.path.startswith("/api/") or request.url.path.startswith("/auth/") or request.url.path.startswith("/agents") or request.url.path.startswith("/tasks") or request.url.path.startswith("/metrics") or request.url.path.startswith("/notifications") or request.url.path.startswith("/messages") or request.url.path.startswith("/plugins") or request.url.path.startswith("/marketplace"):
        if "content-type" not in response.headers:
            response.headers["Content-Type"] = "application/json; charset=utf-8"
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
MAX_REQUEST_SIZE = int(os.getenv("MAX_REQUEST_SIZE", str(10 * 1024)))  # 10KB default for input validation

@app.middleware("http")
async def request_size_limit_middleware(request: Request, call_next):
    """Enforce maximum request body size (default 10KB)."""
    # Skip for GET, DELETE, OPTIONS, WebSocket, and health checks
    if request.method in ("GET", "DELETE", "OPTIONS", "HEAD"):
        return await call_next(request)
    if request.url.path == "/health" or request.headers.get("upgrade", "").lower() == "websocket":
        return await call_next(request)

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_SIZE:
        logger.warning(
            "Request body too large: %s bytes (max %s) [path=%s]",
            content_length, MAX_REQUEST_SIZE, request.url.path,
        )
        raise HTTPException(
            status_code=413,
            detail=f"Request body too large. Maximum size is {MAX_REQUEST_SIZE} bytes.",
        )
    return await call_next(request)

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
workflow_repo = WorkflowRepository()
config_repo = AgentConfigRepository()
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




@app.get("/health")
async def health():
    return {"status": "ok", "temporal": temporal_client is not None}

# ─── Auth Endpoints ───────────────────────────────────────────────

@app.post("/auth/login")
async def auth_login(request: Request, login_data: SchemaLoginRequest):
    """Authenticate user and return JWT tokens. Supports 2FA."""
    # Log sanitized username for audit trail (never log password)
    logger.info("Login attempt for user: %s [ip=%s]", login_data.username, request.client.host if request.client else "unknown")
    user = authenticate_user(login_data.username, login_data.password, login_data.totp_code)
    if not user:
        logger.warning("Failed login attempt for user: %s", login_data.username)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # If 2FA is required but no code was provided
    if user.get("requires_2fa"):
        return {
            "requires_2fa": True,
            "username": user["username"],
            "message": "2FA code required",
        }

    tokens = create_token_pair(user)
    logger.info("User logged in: %s", user["username"])
    return {
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "token_type": tokens.token_type,
        "expires_in": tokens.expires_in,
        "requires_2fa": False,
    }


@app.post("/auth/refresh")
async def auth_refresh(request: Request, refresh_data: SchemaRefreshRequest):
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
    """Get current authenticated user info including 2FA status."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = validate_token(auth_header[7:], token_type="access")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    two_fa = get_user_2fa_info(payload["sub"])
    return {
        "username": payload["sub"],
        "role": payload.get("role", "user"),
        "two_fa_enabled": two_fa["enabled"] if two_fa else False,
    }


# ─── Account Management Endpoints ──────────────────────────────────

@app.put("/auth/password")
async def auth_change_password(request: Request, data: PasswordChangeRequest):
    """Change the current user's password."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = validate_token(auth_header[7:], token_type="access")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    success = change_password(payload["sub"], data.current_password, data.new_password)
    if not success:
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    return {"status": "ok", "message": "Password changed successfully"}


@app.post("/auth/2fa/setup")
async def auth_2fa_setup(request: Request, data: TwoFASetupRequest):
    """Generate a 2FA secret and QR code for setup."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = validate_token(auth_header[7:], token_type="access")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Verify password
    from app.infrastructure.auth_service import _verify_password, _users_db
    user = _users_db.get(payload["sub"])
    if not user or not _verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Password is incorrect")

    # Generate 2FA setup
    setup_data = setup_2fa(payload["sub"])

    # Store the secret temporarily (not enabled yet)
    set_user_2fa_secret(payload["sub"], setup_data["secret"])

    return {
        "qr_code": setup_data["qr_code"],
        "secret": setup_data["secret"],
    }


@app.post("/auth/2fa/enable")
async def auth_2fa_enable(request: Request, data: TwoFAVerifyRequest):
    """Enable 2FA after verifying a TOTP code."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = validate_token(auth_header[7:], token_type="access")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Check if secret is set
    two_fa_info = get_user_2fa_info(payload["sub"])
    if not two_fa_info or not two_fa_info["has_secret"]:
        raise HTTPException(status_code=400, detail="2FA setup not initiated. Call /auth/2fa/setup first.")

    # Verify the code against the stored secret
    from app.infrastructure.auth_service import _users_db
    user = _users_db.get(payload["sub"])
    if not user or not verify_totp_code(user["2fa_secret"], data.code):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")

    success = enable_2fa(payload["sub"])
    if not success:
        raise HTTPException(status_code=500, detail="Failed to enable 2FA")

    return {"status": "ok", "message": "2FA enabled successfully"}


@app.post("/auth/2fa/disable")
async def auth_2fa_disable(request: Request, data: TwoFADisableRequest):
    """Disable 2FA after verifying password."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = validate_token(auth_header[7:], token_type="access")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Verify password
    from app.infrastructure.auth_service import _verify_password, _users_db
    user = _users_db.get(payload["sub"])
    if not user or not _verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Password is incorrect")

    success = disable_2fa(payload["sub"])
    if not success:
        raise HTTPException(status_code=500, detail="Failed to disable 2FA")

    return {"status": "ok", "message": "2FA disabled successfully"}


@app.post("/auth/2fa/verify")
async def auth_2fa_verify(request: Request, data: TwoFAVerifyRequest):
    """Verify a 2FA code (used during login flow)."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = validate_token(auth_header[7:], token_type="access")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    from app.infrastructure.auth_service import _users_db
    user = _users_db.get(payload["sub"])
    if not user or not user.get("2fa_secret"):
        raise HTTPException(status_code=400, detail="2FA not configured")

    valid = verify_totp_code(user["2fa_secret"], data.code)
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid 2FA code")

    return {"status": "ok", "message": "2FA code valid"}

@app.post("/log")
async def receive_log(data: LogReceive):
    """Receive a log entry with validation."""
    await hermes.log(data.agent_name, data.level, data.message)
    return {"status": "ok"}

@app.post("/register")
async def register(data: RegisterRaw):
    """Register a new agent with validation."""
    agent = await hermes.register_agent(data.name, data.role, data.model)
    return agent

@app.post("/task")
async def submit_task(data: TaskSubmit):
    """Submit a task to Temporal workflow with validation."""
    if not temporal_client:
        return {"error": "Temporal client not connected"}, 500

    handle = await temporal_client.start_workflow(
        AgentTaskWorkflow.run,
        data.model_dump(),
        id=f"task-{data.agent_id}-{os.urandom(4).hex()}",
        task_queue="hermes-task-queue",
    )

    await hermes.log("SYSTEM", "INFO", f"Triggered workflow for task: {data.title}")
    return {"workflow_id": handle.id}

@app.get("/memories/{agent_id}")
async def get_memories(agent_id: str):
    return await memory.get_all_for_agent(agent_id)

@app.post("/memories/search")
async def search_memories(data: MemorySearch):
    """Semantic search across memories with filters."""
    results = await memory.semantic_search(
        query_text=data.query,
        agent_id=data.agent_id,
        mem_type=data.type,
        include_shared=data.include_shared,
        include_archived=data.include_archived,
        n_results=data.limit,
    )
    return {"results": results, "count": len(results), "query": data.query}

@app.post("/memories/share")
async def share_memory(data: MemoryShare):
    """Share a memory from one agent to another."""
    # Verify both agents exist
    from_agent = hermes.get_agent(data.from_agent_id)
    if not from_agent:
        raise HTTPException(status_code=404, detail="Source agent not found")
    to_agent = hermes.get_agent(data.to_agent_id)
    if not to_agent:
        raise HTTPException(status_code=404, detail="Target agent not found")

    result = await memory.share_memory(data.memory_id, data.from_agent_id, data.to_agent_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@app.get("/memories/{agent_id}/stats")
async def get_memory_stats(agent_id: str):
    """Get memory statistics for an agent."""
    return await memory.get_stats(agent_id)

@app.post("/memories/{agent_id}/archive")
async def archive_memories(agent_id: str, older_than_days: int = Query(30, ge=1, le=365)):
    """Archive old memories for an agent."""
    return await memory.archive_old_memories(agent_id, older_than_days)

@app.post("/memories/{agent_id}/consolidate")
async def consolidate_memories(agent_id: str, threshold: float = Query(0.85, ge=0.5, le=0.99)):
    """Consolidate similar memories for an agent."""
    return await memory.consolidate_similar(agent_id, threshold)


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
    """Register a new agent with optional role-based auto-assignment."""
    role = agent_data.role
    role_config = None

    # If role_id provided, look up the predefined role and auto-assign config
    if agent_data.role_id:
        role_config = get_role_by_id(agent_data.role_id)
        if not role_config:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown role_id: {agent_data.role_id}",
            )
        # Use the role name as the agent's role if not explicitly provided
        role = role or role_config["name"]

    # Ensure role is not empty
    if not role:
        raise HTTPException(status_code=400, detail="Role is required")

    agent = await hermes.register_agent(agent_data.name, role, agent_data.model)

    # Auto-save config from role if available
    if role_config and agent.get("id"):
        config_repo.save_config(agent["id"], {
            "model": agent_data.model,
            "system_prompt": role_config.get("system_prompt", ""),
            "tools": role_config.get("tools", []),
            "toolsets": role_config.get("toolsets", []),
            "env_vars": role_config.get("env_vars", {}),
        })
        # Attach role metadata to the response
        agent["role_id"] = role_config["id"]
        agent["role_color"] = role_config.get("color", "#6B7280")
        agent["role_icon"] = role_config.get("icon", "")

    # Create notification for new agent
    await _emit_notification(
        "agent_registered",
        f"New Agent: {agent_data.name}",
        f"Role: {role} · Model: {agent_data.model}",
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
    # Only pass non-None fields to avoid overwriting existing values with NULL
    update_fields = {}
    if data.name is not None:
        update_fields["name"] = data.name
    if data.role is not None:
        update_fields["role"] = data.role
    if data.model is not None:
        update_fields["model"] = data.model
    if data.status is not None:
        update_fields["status"] = data.status
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    updated = await hermes.update_agent(agent_id, **update_fields)
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
async def update_agent_model(agent_id: str, data: AgentModelUpdate):
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

@app.get("/roles")
async def list_roles():
    """List all available roles with their default configurations."""
    return get_all_roles()

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
        elif "minimax" in model_name:
            family = "minimax"
        elif "glm" in model_name:
            family = "glm"
        elif "deepseek" in model_name:
            family = "deepseek"
        elif "qwen" in model_name:
            family = "qwen"
        elif "mimo" in model_name:
            family = "mimo"
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
        # No Temporal - execute via OpenCode API
        task_repo.update_status(task["id"], "RUNNING")
        task["status"] = "RUNNING"
        model = agent.get("model", "minimax-m3")
        asyncio.create_task(_execute_task_with_opencode(task["id"], task_data.agent_id, task_data.title, model))
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


async def _execute_task_with_opencode(task_id: str, agent_id: str, title: str, model: str = "minimax-m3"):
    """Execute task via OpenCode API."""
    from app.infrastructure.opencode_adapter import opencode_adapter
    
    # Store ref so we can cancel on stop
    _active_sim_tasks[task_id] = asyncio.current_task()
    
    # Get agent config for system prompt
    agent = hermes.get_agent(agent_id)
    agent_name = agent.get("name", agent_id) if agent else agent_id
    system_prompt = agent.get("system_prompt", "") if agent else ""
    
    log_repo.create(f"Task execution started: {title}", level="INFO", task_id=task_id, agent_id=agent_id)
    log_repo.create(f"Connecting to OpenCode with model: {model}", level="DEBUG", task_id=task_id, agent_id=agent_id)
    
    try:
        # Execute via OpenCode
        result = await opencode_adapter.execute_task(
            task_id=task_id,
            prompt=title,
            model=model,
            system_prompt=system_prompt,
            temperature=0.7,
            max_tokens=4096
        )
        
        if result["success"]:
            # Task completed successfully
            content = result["content"]
            input_tokens = result["input_tokens"]
            output_tokens = result["output_tokens"]
            cost = result["cost"]
            duration = result["duration"]
            
            log_repo.create(f"Generated {input_tokens + output_tokens} tokens (input: {input_tokens}, output: {output_tokens})", 
                          level="DEBUG", task_id=task_id, agent_id=agent_id)
            log_repo.create(f"Task processing complete, writing results...", level="INFO", task_id=task_id, agent_id=agent_id)
            
            # Only complete if not already stopped
            current = task_repo.get_by_id(task_id)
            if current and current["status"] == "RUNNING":
                result_json = json.dumps({"output": content})
                task_repo.update_status(task_id, "COMPLETED", result=result_json, tokens_used=input_tokens + output_tokens)
                task = task_repo.get_by_id(task_id)
                
                # Track cost in metrics collector
                await metrics_collector.complete_task(
                    task_id=task_id,
                    success=True,
                    duration=duration,
                    token_usage=input_tokens + output_tokens,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    model=model,
                )
                
                # Create notification for completed task
                task_metrics = await metrics_collector.get_task_metrics(task_id)
                cost = task_metrics.get("cost", 0.0) if task_metrics else 0.0
                await _emit_notification(
                    "task_completed",
                    f"Task Completed: {title}",
                    f"Agent: {agent_name} · Duration: {duration:.1f}s · Tokens: {input_tokens + output_tokens:,} · Cost: ${cost:.4f}",
                    {"task_id": task_id, "agent_id": agent_id, "agent_name": agent_name, "duration": duration, "tokens": input_tokens + output_tokens, "cost": cost},
                    task_title=title,
                    agent_name=agent_name,
                    duration=duration,
                    tokens_used=input_tokens + output_tokens,
                    cost=cost,
                )
                
                # Broadcast task update
                await ws_manager.broadcast(json.dumps({
                    "type": "task_update",
                    "task": task,
                }), channel="tasks")
                
                await hermes.log("SYSTEM", "INFO", f"Task completed: {title} ({duration:.1f}s, {input_tokens + output_tokens} tokens)")
        else:
            # Task failed
            error_msg = result.get("error", "Unknown error")
            log_repo.create(f"Task failed: {error_msg}", level="ERROR", task_id=task_id, agent_id=agent_id)
            
            current = task_repo.get_by_id(task_id)
            if current and current["status"] == "RUNNING":
                task_repo.update_status(task_id, "FAILED", result=json.dumps({"error": error_msg}))
                
                await _emit_notification(
                    "task_failed",
                    f"Task Failed: {title}",
                    f"Agent: {agent_name} · Error: {error_msg}",
                    {"task_id": task_id, "agent_id": agent_id, "agent_name": agent_name, "error": error_msg},
                    task_title=title,
                    agent_name=agent_name,
                )
                
                # Broadcast task update
                task = task_repo.get_by_id(task_id)
                await ws_manager.broadcast(json.dumps({
                    "type": "task_update",
                    "task": task,
                }), channel="tasks")
                
                await hermes.log("SYSTEM", "ERROR", f"Task failed: {title} - {error_msg}")
                
    except asyncio.CancelledError:
        # Task was stopped
        log_repo.create(f"Task stopped by user", level="WARNING", task_id=task_id, agent_id=agent_id)
        opencode_adapter.stop_task(task_id)
        
        current = task_repo.get_by_id(task_id)
        if current and current["status"] == "RUNNING":
            task_repo.update_status(task_id, "STOPPED")
            
            await _emit_notification(
                "task_stopped",
                f"Task Stopped: {title}",
                f"Agent: {agent_name}",
                {"task_id": task_id, "agent_id": agent_id, "agent_name": agent_name},
                task_title=title,
                agent_name=agent_name,
            )
            
            # Broadcast task update
            task = task_repo.get_by_id(task_id)
            await ws_manager.broadcast(json.dumps({
                "type": "task_update",
                "task": task,
            }), channel="tasks")
            
            await hermes.log("SYSTEM", "WARNING", f"Task stopped: {title}")
            
    except Exception as e:
        # Unexpected error
        logger.error(f"Task {task_id} unexpected error: {e}")
        log_repo.create(f"Unexpected error: {str(e)}", level="ERROR", task_id=task_id, agent_id=agent_id)
        
        current = task_repo.get_by_id(task_id)
        if current and current["status"] == "RUNNING":
            task_repo.update_status(task_id, "FAILED", result=json.dumps({"error": str(e)}))
            
            await _emit_notification(
                "task_failed",
                f"Task Failed: {title}",
                f"Agent: {agent_name} · Error: {str(e)}",
                {"task_id": task_id, "agent_id": agent_id, "agent_name": agent_name, "error": str(e)},
                task_title=title,
                agent_name=agent_name,
            )
            
            await hermes.log("SYSTEM", "ERROR", f"Task failed: {title} - {str(e)}")
    
    finally:
        # Cleanup
        if task_id in _active_sim_tasks:
            del _active_sim_tasks[task_id]


async def _simulate_task(task_id: str, agent_id: str, title: str):
    """Simulate task execution when Temporal is not available (fallback)."""
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
async def update_task_status(task_id: str, data: TaskUpdate):
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
async def create_log(data: SchemaLogCreate, request: Request):
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
async def collect_metrics(data: MetricsCollect):
    """Receive metrics from external agents with validation."""
    result = await metrics_collector.ingest_external_metrics(data.model_dump())
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
async def update_model_rate(model: str, data: ModelRateUpdate):
    """Update token rates for a model with validation."""
    return await metrics_collector.update_model_rate(
        model, data.input, data.output
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

# ─── Message Bus Endpoints ────────────────────────────────────────

@app.post("/messages")
async def send_message(data: MessageSend):
    """Send a message between agents."""
    # Verify sender exists
    sender = hermes.get_agent(data.from_agent_id)
    if not sender:
        raise HTTPException(status_code=404, detail="Sender agent not found")

    # Verify recipient exists (skip for broadcast)
    if data.to_agent_id and data.type != "broadcast":
        recipient = hermes.get_agent(data.to_agent_id)
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient agent not found")

    # For broadcast, to_agent_id should be None
    to_id = None if data.type == "broadcast" else data.to_agent_id

    msg = await hermes.send_message(
        from_agent_id=data.from_agent_id,
        to_agent_id=to_id,
        msg_type=data.type,
        subject=data.subject,
        body=data.body,
        metadata=data.metadata,
    )

    # Broadcast via WebSocket for real-time delivery
    await ws_manager.broadcast(json.dumps({
        "type": "agent_message",
        "message": msg,
    }), channel="messages")

    return msg

@app.get("/messages/{agent_id}")
async def get_messages(
    agent_id: str,
    msg_type: Optional[str] = None,
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Get messages for an agent."""
    # Verify agent exists
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    return hermes.get_messages(
        agent_id=agent_id,
        msg_type=msg_type,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )

@app.get("/messages/{agent_id}/thread/{other_agent_id}")
async def get_message_thread(agent_id: str, other_agent_id: str, limit: int = Query(50, ge=1, le=200)):
    """Get conversation thread between two agents."""
    return hermes.get_thread(agent_id, other_agent_id)

@app.get("/messages/{agent_id}/conversations")
async def get_conversations(agent_id: str):
    """Get list of conversations for an agent."""
    return hermes.get_conversations(agent_id)

@app.post("/messages/{msg_id}/read")
async def mark_message_read(msg_id: str):
    """Mark a message as read."""
    success = hermes.message_bus.mark_read(msg_id)
    if not success:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"status": "ok", "id": msg_id}

@app.post("/messages/{agent_id}/read-all")
async def mark_all_messages_read(agent_id: str):
    """Mark all messages for an agent as read."""
    count = hermes.message_bus.mark_all_read(agent_id)
    return {"status": "ok", "marked": count}

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

# ─── Agent Configuration Endpoints ──────────────────────────────

@app.post("/agents/{agent_id}/config")
async def save_agent_config(agent_id: str, data: AgentConfigSave):
    """Save an agent's configuration."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    config = config_repo.save_config(agent_id, data.model_dump())
    return config


@app.get("/agents/{agent_id}/config")
async def get_agent_config(agent_id: str):
    """Get an agent's configuration."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    config = config_repo.get_config(agent_id)
    if not config:
        # Return default config
        return {
            "agent_id": agent_id,
            "model": agent.get("model", "claude-sonnet-4"),
            "system_prompt": "",
            "temperature": 0.5,
            "max_tokens": 4096,
            "tools": [],
            "toolsets": [],
            "env_vars": {},
        }
    return config


@app.post("/agents/{agent_id}/config/clone")
async def clone_agent_config(agent_id: str, data: AgentConfigClone):
    """Clone config from one agent to another."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Source agent not found")
    target = hermes.get_agent(data.target_agent_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target agent not found")
    try:
        config = config_repo.clone_config(agent_id, data.target_agent_id)
        return config
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/agents/{agent_id}/config/apply-template")
async def apply_template_to_agent(agent_id: str, data: TemplateApply):
    """Apply a template to an agent's config."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    try:
        config = config_repo.apply_template(agent_id, data.template_id)
        return config
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/agents/{agent_id}/config/env")
async def get_agent_env_vars(agent_id: str):
    """Get environment variables for an agent."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"env_vars": config_repo.get_env_vars(agent_id)}


@app.post("/agents/{agent_id}/config/env")
async def set_agent_env_var(agent_id: str, data: EnvVarSet):
    """Set an environment variable for an agent."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    env_vars = config_repo.set_env_var(agent_id, data.key, data.value)
    return {"env_vars": env_vars}


@app.delete("/agents/{agent_id}/config/env/{key}")
async def delete_agent_env_var(agent_id: str, key: str):
    """Delete an environment variable for an agent."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    env_vars = config_repo.delete_env_var(agent_id, key)
    return {"env_vars": env_vars}


# ─── Template Endpoints ─────────────────────────────────────────

@app.get("/templates")
async def list_templates():
    """List all config templates."""
    return {"templates": config_repo.get_templates()}


@app.post("/templates")
async def create_template(data: TemplateCreate):
    """Create a new config template."""
    template = config_repo.create_template(data.model_dump())
    return template


@app.get("/templates/{template_id}")
async def get_template(template_id: str):
    """Get a template by ID."""
    template = config_repo.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@app.post("/templates/from-agent/{agent_id}")
async def create_template_from_agent(agent_id: str, data: TemplateFromAgent):
    """Create a template from an agent's current config."""
    agent = hermes.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    try:
        template = config_repo.create_template_from_agent(agent_id, data.name, data.description)
        return template
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Workflow CRUD Endpoints ─────────────────────────────────────

@app.post("/workflows")
async def create_workflow(data: WorkflowCreate):
    """Create a new visual workflow."""
    wf = workflow_repo.create(data.name, data.nodes, data.edges, data.viewport)
    return wf


@app.get("/workflows")
async def list_workflows():
    """List all workflows."""
    workflows = workflow_repo.get_all()
    return {"workflows": workflows}


@app.get("/workflows/{wf_id}")
async def get_workflow(wf_id: str):
    """Get a workflow by ID."""
    wf = workflow_repo.get_by_id(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf


@app.put("/workflows/{wf_id}")
async def update_workflow(wf_id: str, data: WorkflowUpdate):
    """Update a workflow."""
    wf = workflow_repo.update(wf_id, data.name, data.nodes, data.edges, data.viewport)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf


@app.delete("/workflows/{wf_id}")
async def delete_workflow(wf_id: str):
    """Delete a workflow."""
    success = workflow_repo.delete(wf_id)
    if not success:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"status": "deleted", "id": wf_id}


@app.post("/workflows/{wf_id}/execute")
async def execute_workflow(wf_id: str):
    """Execute a workflow via Temporal.io."""
    wf = workflow_repo.get_by_id(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not connected")

    # Convert visual workflow to Temporal task execution
    # Walk the node graph and dispatch agent nodes sequentially
    nodes = wf.get("nodes", [])
    edges = wf.get("edges", [])
    trigger_nodes = [n for n in nodes if n.get("type") == "trigger"]
    agent_nodes = [n for n in nodes if n.get("type") == "agent"]

    if not agent_nodes:
        raise HTTPException(status_code=400, detail="Workflow has no agent nodes to execute")

    executed_tasks = []
    for agent_node in agent_nodes:
        node_data = agent_node.get("data", {})
        config = node_data.get("config", {})
        agent_id = config.get("agentId", "")
        label = node_data.get("label", "Workflow Task")

        if not agent_id:
            continue

        task_data = {
            "agent_id": agent_id,
            "title": f"[Workflow: {wf['name']}] {label}",
            "priority": config.get("priority", "P2"),
        }

        try:
            handle = await temporal_client.start_workflow(
                AgentTaskWorkflow.run,
                task_data,
                id=f"wf-{wf_id}-task-{agent_id}-{__import__('os').urandom(4).hex()}",
                task_queue="hermes-task-queue",
            )
            executed_tasks.append({"agent_id": agent_id, "workflow_id": handle.id})
        except Exception as e:
            logger.error("Failed to execute workflow node %s: %s", agent_node.get("id"), e)
            executed_tasks.append({"agent_id": agent_id, "error": str(e)})

    # Update node statuses in workflow definition
    for node in nodes:
        if node.get("type") == "agent":
            node.setdefault("data", {})["status"] = "running"
    workflow_repo.update(wf_id, wf["name"], nodes, edges, wf.get("viewport"))

    await _emit_notification(
        "task_completed",
        f"Workflow Executed: {wf['name']}",
        f"Dispatched {len(executed_tasks)} agent task(s)",
        {"workflow_id": wf_id, "tasks": executed_tasks},
    )

    return {
        "workflow_id": wf_id,
        "tasks_dispatched": len(executed_tasks),
        "tasks": executed_tasks,
    }


@app.get("/workflows/{wf_id}/versions")
async def get_workflow_versions(wf_id: str):
    """Get version history for a workflow."""
    wf = workflow_repo.get_by_id(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    versions = workflow_repo.get_versions(wf_id)
    return {"versions": versions}


# ─── Plugin Marketplace Endpoints ──────────────────────────────────

@app.get("/marketplace")
async def list_marketplace(
    category: Optional[str] = None,
    search: Optional[str] = None,
):
    """List all available plugins in the marketplace."""
    return plugin_manager.get_marketplace(category=category, search=search)


@app.get("/plugins")
async def list_plugins():
    """List all installed plugins."""
    return plugin_manager.get_installed()


@app.post("/plugins")
async def install_plugin(data: PluginInstall):
    """Install a plugin from the marketplace."""
    result = plugin_manager.install(data.plugin_id, data.config)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    await ws_manager.broadcast(json.dumps({
        "type": "plugin_installed",
        "plugin": result,
    }))
    return result


@app.put("/plugins/{plugin_id}")
async def update_plugin_config(plugin_id: str, data: PluginConfigUpdate):
    """Update plugin configuration."""
    result = plugin_manager.update_config(plugin_id, data.config)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.delete("/plugins/{plugin_id}")
async def uninstall_plugin(plugin_id: str):
    """Uninstall a plugin."""
    result = plugin_manager.uninstall(plugin_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    await ws_manager.broadcast(json.dumps({
        "type": "plugin_uninstalled",
        "plugin_id": plugin_id,
    }))
    return result


@app.post("/plugins/{plugin_id}/enable")
async def enable_plugin(plugin_id: str):
    """Enable an installed plugin."""
    result = plugin_manager.enable(plugin_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/plugins/{plugin_id}/disable")
async def disable_plugin(plugin_id: str):
    """Disable an installed plugin."""
    result = plugin_manager.disable(plugin_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
