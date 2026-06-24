"""
Pydantic schemas for request/response validation.

Provides input validation, sanitization, and size constraints for all
API endpoints in the H.E.R.M.E.S. AI Agent Orchestrator.
"""

import re
import html
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator, model_validator


# ─── Shared Constants ────────────────────────────────────────────

# Allowed agent statuses
VALID_STATUSES = {"active", "idle", "offline", "busy"}

# Allowed task statuses
VALID_TASK_STATUSES = {"QUEUED", "RUNNING", "COMPLETED", "FAILED", "STOPPED"}

# Allowed task priorities
VALID_PRIORITIES = {"P0", "P1", "P2", "P3"}

# Allowed log levels
VALID_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}

# Allowed notification types
VALID_NOTIFICATION_TYPES = {
    "task_completed", "task_failed", "task_stopped",
    "agent_registered", "cost_alert",
}

# Regex patterns for validation
SAFE_TEXT_PATTERN = re.compile(r'^[\w\s\-\.\,\!\?\:\;\(\)\[\]\{\}\'\"\@\#\$\%\&\*\+\=\/\\\|~`]+$')
AGENT_NAME_PATTERN = re.compile(r'^[\w\s\-\.\']{1,100}$')
AGENT_ID_PATTERN = re.compile(r'^[\w\-]{1,100}$')
MODEL_PATTERN = re.compile(r'^[\w\-\.]{1,100}$')


# ─── Sanitization Helpers ───────────────────────────────────────

def sanitize_text(value: str) -> str:
    """Strip dangerous characters and HTML-encode output."""
    if not value:
        return value
    # Strip null bytes
    value = value.replace('\x00', '')
    # HTML-encode to prevent XSS when stored and rendered
    value = html.escape(value, quote=True)
    return value.strip()


def sanitize_plain(value: str) -> str:
    """Strip null bytes and control characters (for fields that shouldn't contain HTML)."""
    if not value:
        return value
    # Remove null bytes
    value = value.replace('\x00', '')
    # Remove control characters except newline/tab
    value = re.sub(r'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
    return value.strip()


def validate_no_sql_injection(value: str) -> str:
    """Check for common SQL injection patterns and raise if found."""
    if not value:
        return value
    sql_patterns = [
        r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE|UNION)\b)",
        r"(--|;--|;|/\*|\*/|@@|@)",
        r"(\b(OR|AND)\b\s+\d+\s*=\s*\d+)",
        r"('(\s)*(OR|AND)(\s)*')",
    ]
    for pattern in sql_patterns:
        if re.search(pattern, value, re.IGNORECASE):
            raise ValueError(f"Potentially unsafe input detected")
    return value


# ─── Agent Schemas ───────────────────────────────────────────────

class AgentCreate(BaseModel):
    """Schema for creating a new agent."""
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Agent display name",
        json_schema_extra={"examples": ["Research Agent"]},
    )
    role: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Agent role description",
    )
    model: str = Field(
        default="claude-sonnet-4",
        min_length=1,
        max_length=100,
        description="LLM model identifier",
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not v:
            raise ValueError("Name cannot be empty or only whitespace")
        if not AGENT_NAME_PATTERN.match(v):
            raise ValueError("Name contains invalid characters")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not v:
            raise ValueError("Role cannot be empty or only whitespace")
        return v

    @field_validator("model")
    @classmethod
    def validate_model(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not MODEL_PATTERN.match(v):
            raise ValueError("Model contains invalid characters")
        return v


class AgentUpdate(BaseModel):
    """Schema for updating an agent."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[str] = Field(None, min_length=1, max_length=500)
    model: Optional[str] = Field(None, min_length=1, max_length=100)
    status: Optional[str] = Field(None, min_length=1, max_length=50)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = sanitize_plain(v)
        if not v:
            raise ValueError("Name cannot be empty or only whitespace")
        if not AGENT_NAME_PATTERN.match(v):
            raise ValueError("Name contains invalid characters")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_plain(v)

    @field_validator("model")
    @classmethod
    def validate_model(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = sanitize_plain(v)
        if not MODEL_PATTERN.match(v):
            raise ValueError("Model contains invalid characters")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip().lower()
        if v not in VALID_STATUSES:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}")
        return v

    @model_validator(mode="after")
    def at_least_one_field(self):
        if all(
            v is None
            for v in (self.name, self.role, self.model, self.status)
        ):
            raise ValueError("At least one field must be provided for update")
        return self


class AgentModelUpdate(BaseModel):
    """Schema for updating only the agent's model."""
    model: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="New LLM model identifier",
    )

    @field_validator("model")
    @classmethod
    def validate_model(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not MODEL_PATTERN.match(v):
            raise ValueError("Model contains invalid characters")
        return v


# ─── Task Schemas ────────────────────────────────────────────────

class TaskCreate(BaseModel):
    """Schema for creating a new task."""
    agent_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Target agent ID",
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Task title",
    )
    priority: str = Field(
        default="P2",
        min_length=2,
        max_length=2,
        description="Task priority (P0-P3)",
    )

    @field_validator("agent_id")
    @classmethod
    def validate_agent_id(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not AGENT_ID_PATTERN.match(v):
            raise ValueError("Agent ID contains invalid characters")
        return v

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not v:
            raise ValueError("Title cannot be empty or only whitespace")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in VALID_PRIORITIES:
            raise ValueError(f"Invalid priority. Must be one of: {', '.join(sorted(VALID_PRIORITIES))}")
        return v


class TaskUpdate(BaseModel):
    """Schema for updating a task's status."""
    status: str = Field(
        ...,
        min_length=1,
        max_length=20,
        description="New task status",
    )
    result: Optional[str] = Field(None, max_length=50000)
    tokens_used: Optional[int] = Field(None, ge=0, le=10_000_000)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in VALID_TASK_STATUSES:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(sorted(VALID_TASK_STATUSES))}")
        return v

    @field_validator("result")
    @classmethod
    def validate_result(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_plain(v)


# ─── Auth Schemas ────────────────────────────────────────────────

class LoginRequest(BaseModel):
    """Schema for login request."""
    username: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Username",
    )
    password: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Password",
    )

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not re.match(r'^[\w\.\-\@]{1,50}$', v):
            raise ValueError("Username contains invalid characters")
        return v


class RefreshRequest(BaseModel):
    """Schema for token refresh request."""
    refresh_token: str = Field(
        ...,
        min_length=10,
        max_length=2000,
        description="JWT refresh token",
    )


# ─── Notification Schemas ───────────────────────────────────────

class NotificationCreate(BaseModel):
    """Schema for creating a notification."""
    type: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Notification type",
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Notification title",
    )
    description: str = Field(
        default="",
        max_length=2000,
        description="Notification description",
    )
    data: Optional[Dict[str, Any]] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        v = sanitize_plain(v).lower()
        if v not in VALID_NOTIFICATION_TYPES:
            raise ValueError(
                f"Invalid notification type. Must be one of: {', '.join(sorted(VALID_NOTIFICATION_TYPES))}"
            )
        return v

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        return sanitize_plain(v)

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        return sanitize_plain(v)


class NotificationRead(BaseModel):
    """Schema for marking a notification as read."""
    id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Notification ID",
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not AGENT_ID_PATTERN.match(v):
            raise ValueError("Notification ID contains invalid characters")
        return v


# ─── Log Schemas ─────────────────────────────────────────────────

class LogCreate(BaseModel):
    """Schema for creating a log entry."""
    message: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Log message",
    )
    level: str = Field(
        default="INFO",
        min_length=1,
        max_length=20,
        description="Log level",
    )
    task_id: Optional[str] = Field(None, max_length=100)
    agent_id: Optional[str] = Field(None, max_length=100)

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        return sanitize_plain(v)

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in VALID_LOG_LEVELS:
            raise ValueError(f"Invalid log level. Must be one of: {', '.join(sorted(VALID_LOG_LEVELS))}")
        return v

    @field_validator("task_id", "agent_id")
    @classmethod
    def validate_id_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = sanitize_plain(v)
        if not AGENT_ID_PATTERN.match(v):
            raise ValueError("ID contains invalid characters")
        return v


# ─── External / Raw Schemas ─────────────────────────────────────

class MetricsCollect(BaseModel):
    """Schema for external metrics ingestion."""
    agent_id: Optional[str] = Field(None, max_length=100)
    metrics: Optional[Dict[str, Any]] = None

    # Accept arbitrary fields
    model_config = {"extra": "allow"}

    @field_validator("agent_id")
    @classmethod
    def validate_agent_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = sanitize_plain(v)
        if not AGENT_ID_PATTERN.match(v):
            raise ValueError("Agent ID contains invalid characters")
        return v


class ModelRateUpdate(BaseModel):
    """Schema for updating model token rates."""
    input: float = Field(..., ge=0, le=100)
    output: float = Field(..., ge=0, le=100)


class LogReceive(BaseModel):
    """Schema for /log endpoint."""
    agent_name: str = Field(default="SYSTEM", max_length=100)
    level: str = Field(default="INFO", max_length=20)
    message: str = Field(default="", max_length=10000)

    @field_validator("agent_name")
    @classmethod
    def validate_agent_name(cls, v: str) -> str:
        return sanitize_plain(v)

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in VALID_LOG_LEVELS:
            raise ValueError(f"Invalid log level")
        return v

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        return sanitize_plain(v)


class RegisterRaw(BaseModel):
    """Schema for /register endpoint."""
    name: str = Field(..., min_length=1, max_length=100)
    role: str = Field(..., min_length=1, max_length=500)
    model: str = Field(..., min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return sanitize_plain(v)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        return sanitize_plain(v)

    @field_validator("model")
    @classmethod
    def validate_model(cls, v: str) -> str:
        return sanitize_plain(v)


class TaskSubmit(BaseModel):
    """Schema for /task endpoint (Temporal workflow trigger)."""
    agent_id: str = Field(..., min_length=1, max_length=100)
    title: str = Field(..., min_length=1, max_length=500)
    priority: str = Field(default="P2", min_length=2, max_length=2)

    @field_validator("agent_id")
    @classmethod
    def validate_agent_id(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not AGENT_ID_PATTERN.match(v):
            raise ValueError("Agent ID contains invalid characters")
        return v

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        return sanitize_plain(v)

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in VALID_PRIORITIES:
            raise ValueError(f"Invalid priority")
        return v
