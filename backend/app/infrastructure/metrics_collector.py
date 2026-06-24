"""Metrics Collector for H.E.R.M.E.S. AI Agent Orchestrator.

Tracks agent metrics, task metrics, and system-wide metrics.
Follows Clean Architecture patterns with async support.
"""

import datetime
import asyncio
import time
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any


@dataclass
class AgentMetrics:
    """Metrics for an individual agent."""
    agent_id: str
    name: str
    uptime: float = 100.0
    task_count: int = 0
    error_count: int = 0
    error_rate: float = 0.0
    last_seen: str = ""
    status: str = "active"
    created_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TaskMetrics:
    """Metrics for an individual task."""
    task_id: str
    agent_id: str
    duration: float = 0.0
    status: str = "pending"  # pending, success, failed
    token_usage: int = 0
    started_at: str = ""
    completed_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SystemMetrics:
    """System-wide metrics."""
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    active_websockets: int = 0
    total_agents: int = 0
    active_agents: int = 0
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    uptime_seconds: float = 0.0
    timestamp: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class MetricsCollector:
    """Centralized metrics collection and management.

    Tracks agent-level, task-level, and system-wide metrics
    for the H.E.R.M.E.S. orchestrator.
    """

    def __init__(self):
        self._agent_metrics: Dict[str, AgentMetrics] = {}
        self._task_metrics: Dict[str, TaskMetrics] = {}
        self._system_metrics = SystemMetrics()
        self._start_time: float = time.time()
        self._lock = asyncio.Lock()

    # ─── Agent Metrics ────────────────────────────────────────────

    async def register_agent(self, agent_id: str, name: str) -> AgentMetrics:
        """Register a new agent for metrics tracking."""
        async with self._lock:
            now = datetime.datetime.now().isoformat()
            metrics = AgentMetrics(
                agent_id=agent_id,
                name=name,
                uptime=100.0,
                task_count=0,
                error_count=0,
                error_rate=0.0,
                last_seen=now,
                status="active",
                created_at=now,
            )
            self._agent_metrics[agent_id] = metrics
            return metrics

    async def update_agent_seen(self, agent_id: str) -> None:
        """Update the last-seen timestamp for an agent."""
        async with self._lock:
            if agent_id in self._agent_metrics:
                self._agent_metrics[agent_id].last_seen = (
                    datetime.datetime.now().isoformat()
                )

    async def record_task_completion(
        self, agent_id: str, success: bool, duration: float = 0.0, token_usage: int = 0
    ) -> None:
        """Record a task completion for an agent, updating counts and error rate."""
        async with self._lock:
            if agent_id in self._agent_metrics:
                m = self._agent_metrics[agent_id]
                m.task_count += 1
                if not success:
                    m.error_count += 1
                m.error_rate = (
                    (m.error_count / m.task_count * 100) if m.task_count > 0 else 0.0
                )
                m.last_seen = datetime.datetime.now().isoformat()

    async def set_agent_status(self, agent_id: str, status: str) -> None:
        """Set agent status (active, idle, error, offline)."""
        async with self._lock:
            if agent_id in self._agent_metrics:
                self._agent_metrics[agent_id].status = status

    async def get_agent_metrics(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Get metrics for a specific agent."""
        async with self._lock:
            if agent_id in self._agent_metrics:
                return self._agent_metrics[agent_id].to_dict()
            return None

    async def get_all_agent_metrics(self) -> List[Dict[str, Any]]:
        """Get metrics for all tracked agents."""
        async with self._lock:
            return [m.to_dict() for m in self._agent_metrics.values()]

    # ─── Task Metrics ─────────────────────────────────────────────

    async def start_task(self, task_id: str, agent_id: str) -> TaskMetrics:
        """Record the start of a task."""
        async with self._lock:
            now = datetime.datetime.now().isoformat()
            metrics = TaskMetrics(
                task_id=task_id,
                agent_id=agent_id,
                status="pending",
                started_at=now,
            )
            self._task_metrics[task_id] = metrics
            return metrics

    async def complete_task(
        self,
        task_id: str,
        success: bool,
        duration: float = 0.0,
        token_usage: int = 0,
    ) -> Optional[TaskMetrics]:
        """Record task completion."""
        async with self._lock:
            if task_id in self._task_metrics:
                m = self._task_metrics[task_id]
                m.status = "success" if success else "failed"
                m.duration = duration
                m.token_usage = token_usage
                m.completed_at = datetime.datetime.now().isoformat()
                return m
            return None

    async def get_task_metrics(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get metrics for a specific task."""
        async with self._lock:
            if task_id in self._task_metrics:
                return self._task_metrics[task_id].to_dict()
            return None

    async def get_all_task_metrics(self) -> List[Dict[str, Any]]:
        """Get metrics for all tracked tasks."""
        async with self._lock:
            return [m.to_dict() for m in self._task_metrics.values()]

    # ─── System Metrics ───────────────────────────────────────────

    async def update_system_metrics(
        self,
        cpu_percent: Optional[float] = None,
        memory_percent: Optional[float] = None,
        active_websockets: Optional[int] = None,
        total_agents: Optional[int] = None,
        active_agents: Optional[int] = None,
    ) -> SystemMetrics:
        """Update system-wide metrics."""
        async with self._lock:
            if cpu_percent is not None:
                self._system_metrics.cpu_percent = cpu_percent
            if memory_percent is not None:
                self._system_metrics.memory_percent = memory_percent
            if active_websockets is not None:
                self._system_metrics.active_websockets = active_websockets
            if total_agents is not None:
                self._system_metrics.total_agents = total_agents
            if active_agents is not None:
                self._system_metrics.active_agents = active_agents

            self._system_metrics.uptime_seconds = time.time() - self._start_time
            self._system_metrics.timestamp = datetime.datetime.now().isoformat()

            # Derive task counts from task metrics
            self._system_metrics.total_tasks = len(self._task_metrics)
            self._system_metrics.completed_tasks = sum(
                1 for t in self._task_metrics.values() if t.status == "success"
            )
            self._system_metrics.failed_tasks = sum(
                1 for t in self._task_metrics.values() if t.status == "failed"
            )
            return self._system_metrics

    async def get_system_metrics(self) -> Dict[str, Any]:
        """Get current system metrics snapshot."""
        async with self._lock:
            self._system_metrics.uptime_seconds = time.time() - self._start_time
            self._system_metrics.timestamp = datetime.datetime.now().isoformat()
            return self._system_metrics.to_dict()

    # ─── Aggregate ────────────────────────────────────────────────

    async def get_all_metrics(self) -> Dict[str, Any]:
        """Get a full metrics snapshot (agents + tasks + system)."""
        agents = await self.get_all_agent_metrics()
        tasks = await self.get_all_task_metrics()
        system = await self.get_system_metrics()
        return {
            "timestamp": datetime.datetime.now().isoformat(),
            "agents": agents,
            "tasks": tasks,
            "system": system,
        }

    async def ingest_external_metrics(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Ingest metrics reported by external agents.

        Accepts a dict with optional keys:
          - agent_id (str): required to identify the source
          - task_id (str): optional, for task-specific updates
          - duration (float): task duration
          - token_usage (int): tokens consumed
          - status (str): task status
          - cpu_percent, memory_percent: system stats from agent
        """
        agent_id = data.get("agent_id")
        if not agent_id:
            return {"error": "agent_id is required"}

        await self.update_agent_seen(agent_id)

        task_id = data.get("task_id")
        if task_id:
            # Start the task if not already tracked
            if task_id not in self._task_metrics:
                await self.start_task(task_id, agent_id)
            success = data.get("status", "success") == "success"
            await self.complete_task(
                task_id=task_id,
                success=success,
                duration=data.get("duration", 0.0),
                token_usage=data.get("token_usage", 0),
            )

        return {"status": "ok", "agent_id": agent_id}
