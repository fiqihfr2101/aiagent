"""
Agent Configuration Schemas for H.E.R.M.E.S. AI Agent Orchestrator.

Pydantic models for config save/load, templates, and env vars.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator

from .schemas import sanitize_plain, AGENT_ID_PATTERN


# ─── Agent Config Schemas ──────────────────────────────────────

class AgentConfigSave(BaseModel):
    """Schema for saving an agent configuration."""
    model: str = Field(default="claude-sonnet-4", max_length=100)
    system_prompt: str = Field(default="", max_length=10000)
    temperature: float = Field(default=0.5, ge=0.0, le=2.0)
    max_tokens: int = Field(default=4096, ge=1, le=100000)
    tools: List[str] = Field(default_factory=list)
    toolsets: List[str] = Field(default_factory=list)
    env_vars: Dict[str, str] = Field(default_factory=dict)

    @field_validator("model")
    @classmethod
    def validate_model(cls, v: str) -> str:
        return sanitize_plain(v)

    @field_validator("system_prompt")
    @classmethod
    def validate_system_prompt(cls, v: str) -> str:
        return sanitize_plain(v) if v else ""


class AgentConfigClone(BaseModel):
    """Schema for cloning config from one agent to another."""
    target_agent_id: str = Field(..., min_length=1, max_length=100)

    @field_validator("target_agent_id")
    @classmethod
    def validate_target(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not AGENT_ID_PATTERN.match(v):
            raise ValueError("Target agent ID contains invalid characters")
        return v


class TemplateCreate(BaseModel):
    """Schema for creating a config template."""
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)
    model: str = Field(default="claude-sonnet-4", max_length=100)
    system_prompt: str = Field(default="", max_length=10000)
    temperature: float = Field(default=0.5, ge=0.0, le=2.0)
    max_tokens: int = Field(default=4096, ge=1, le=100000)
    tools: List[str] = Field(default_factory=list)
    toolsets: List[str] = Field(default_factory=list)
    env_vars: Dict[str, str] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not v:
            raise ValueError("Template name cannot be empty")
        return v

    @field_validator("model")
    @classmethod
    def validate_model(cls, v: str) -> str:
        return sanitize_plain(v)

    @field_validator("system_prompt")
    @classmethod
    def validate_system_prompt(cls, v: str) -> str:
        return sanitize_plain(v) if v else ""


class TemplateApply(BaseModel):
    """Schema for applying a template to an agent."""
    template_id: str = Field(..., min_length=1, max_length=100)

    @field_validator("template_id")
    @classmethod
    def validate_template_id(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not AGENT_ID_PATTERN.match(v):
            raise ValueError("Template ID contains invalid characters")
        return v


class TemplateFromAgent(BaseModel):
    """Schema for creating a template from an agent's current config."""
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not v:
            raise ValueError("Template name cannot be empty")
        return v


class EnvVarSet(BaseModel):
    """Schema for setting an environment variable."""
    key: str = Field(..., min_length=1, max_length=200)
    value: str = Field(default="", max_length=5000)

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        v = sanitize_plain(v)
        if not v:
            raise ValueError("Key cannot be empty")
        return v
