"""Metrics Collector for H.E.R.M.E.S. AI Agent Orchestrator.

Tracks agent metrics, task metrics, system-wide metrics, and cost metrics.
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
    input_tokens: int = 0
    output_tokens: int = 0
    model: str = ""
    cost: float = 0.0
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


# Configurable token rates per model (per 1K tokens)
DEFAULT_MODEL_RATES: Dict[str, Dict[str, float]] = {
    "gpt-4": {"input": 0.03, "output": 0.06},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-4o": {"input": 0.005, "output": 0.015},
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    "claude-sonnet-4": {"input": 0.003, "output": 0.015},
    "claude-opus-4": {"input": 0.015, "output": 0.075},
    "claude-3.5-sonnet": {"input": 0.003, "output": 0.015},
    "claude-3-haiku": {"input": 0.00025, "output": 0.00125},
    "kimi-k2": {"input": 0.003, "output": 0.015},
    "default": {"input": 0.003, "output": 0.015},
}


class MetricsCollector:
    """Centralized metrics collection and management.

    Tracks agent-level, task-level, system-wide, and cost metrics
    for the H.E.R.M.E.S. orchestrator.
    """

    def __init__(self, model_rates: Optional[Dict[str, Dict[str, float]]] = None):
        self._agent_metrics: Dict[str, AgentMetrics] = {}
        self._task_metrics: Dict[str, TaskMetrics] = {}
        self._system_metrics = SystemMetrics()
        self._start_time: float = time.time()
        self._lock = asyncio.Lock()
        # Cost tracking
        self._model_rates = model_rates or DEFAULT_MODEL_RATES.copy()
        self._cost_records: List[Dict[str, Any]] = []  # Historical cost records

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
        input_tokens: int = 0,
        output_tokens: int = 0,
        model: str = "",
    ) -> Optional[TaskMetrics]:
        """Record task completion with cost tracking."""
        async with self._lock:
            if task_id in self._task_metrics:
                m = self._task_metrics[task_id]
                m.status = "success" if success else "failed"
                m.duration = duration
                m.token_usage = token_usage
                m.input_tokens = input_tokens
                m.output_tokens = output_tokens
                m.model = model
                m.completed_at = datetime.datetime.now().isoformat()

                # Calculate cost
                cost = self._calculate_cost(input_tokens, output_tokens, model)
                m.cost = cost

                # Record cost history
                if cost > 0:
                    self._cost_records.append({
                        "task_id": task_id,
                        "agent_id": m.agent_id,
                        "model": model,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "cost": round(cost, 6),
                        "timestamp": m.completed_at,
                    })

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
            # Calculate input/output tokens from total if not provided
            total_tokens = data.get("token_usage", 0)
            input_tokens = data.get("input_tokens", total_tokens // 2)
            output_tokens = data.get("output_tokens", total_tokens - input_tokens)
            model = data.get("model", "")
            await self.complete_task(
                task_id=task_id,
                success=success,
                duration=data.get("duration", 0.0),
                token_usage=total_tokens,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model=model,
            )

        return {"status": "ok", "agent_id": agent_id}

    # ─── Cost Tracking ────────────────────────────────────────────

    def _calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        """Calculate cost for a task based on token usage and model rates."""
        rates = self._model_rates.get(model, self._model_rates.get("default", {"input": 0.003, "output": 0.015}))
        input_cost = (input_tokens / 1000.0) * rates["input"]
        output_cost = (output_tokens / 1000.0) * rates["output"]
        return input_cost + output_cost

    def set_model_rate(self, model: str, input_rate: float, output_rate: float) -> None:
        """Update token rates for a specific model."""
        self._model_rates[model] = {"input": input_rate, "output": output_rate}

    async def get_cost_summary(self) -> Dict[str, Any]:
        """Get total cost summary."""
        async with self._lock:
            total_cost = sum(r["cost"] for r in self._cost_records)
            total_input_tokens = sum(r["input_tokens"] for r in self._cost_records)
            total_output_tokens = sum(r["output_tokens"] for r in self._cost_records)
            total_tasks = len(self._cost_records)

            # Calculate trend (compare last 7 days vs previous 7 days)
            now = datetime.datetime.now()
            week_ago = (now - datetime.timedelta(days=7)).isoformat()
            two_weeks_ago = (now - datetime.timedelta(days=14)).isoformat()

            recent_cost = sum(r["cost"] for r in self._cost_records if r["timestamp"] >= week_ago)
            previous_cost = sum(r["cost"] for r in self._cost_records if two_weeks_ago <= r["timestamp"] < week_ago)
            trend_pct = ((recent_cost - previous_cost) / previous_cost * 100) if previous_cost > 0 else 0.0

            return {
                "total_cost": round(total_cost, 4),
                "total_input_tokens": total_input_tokens,
                "total_output_tokens": total_output_tokens,
                "total_tasks": total_tasks,
                "recent_7d_cost": round(recent_cost, 4),
                "trend_percent": round(trend_pct, 1),
            }

    async def get_cost_by_agent(self) -> List[Dict[str, Any]]:
        """Get cost breakdown by agent."""
        async with self._lock:
            agent_costs: Dict[str, Dict[str, Any]] = {}
            for r in self._cost_records:
                agent_id = r["agent_id"]
                if agent_id not in agent_costs:
                    # Look up agent name
                    agent_name = agent_id
                    if agent_id in self._agent_metrics:
                        agent_name = self._agent_metrics[agent_id].name
                    agent_costs[agent_id] = {
                        "agent_id": agent_id,
                        "agent_name": agent_name,
                        "total_cost": 0.0,
                        "input_tokens": 0,
                        "output_tokens": 0,
                        "task_count": 0,
                    }
                agent_costs[agent_id]["total_cost"] += r["cost"]
                agent_costs[agent_id]["input_tokens"] += r["input_tokens"]
                agent_costs[agent_id]["output_tokens"] += r["output_tokens"]
                agent_costs[agent_id]["task_count"] += 1

            result = list(agent_costs.values())
            for item in result:
                item["total_cost"] = round(item["total_cost"], 4)
            result.sort(key=lambda x: x["total_cost"], reverse=True)
            return result

    async def get_cost_by_model(self) -> List[Dict[str, Any]]:
        """Get cost breakdown by model."""
        async with self._lock:
            model_costs: Dict[str, Dict[str, Any]] = {}
            for r in self._cost_records:
                model = r["model"] or "unknown"
                if model not in model_costs:
                    model_costs[model] = {
                        "model": model,
                        "total_cost": 0.0,
                        "input_tokens": 0,
                        "output_tokens": 0,
                        "task_count": 0,
                    }
                model_costs[model]["total_cost"] += r["cost"]
                model_costs[model]["input_tokens"] += r["input_tokens"]
                model_costs[model]["output_tokens"] += r["output_tokens"]
                model_costs[model]["task_count"] += 1

            result = list(model_costs.values())
            for item in result:
                item["total_cost"] = round(item["total_cost"], 4)
            result.sort(key=lambda x: x["total_cost"], reverse=True)
            return result

    async def get_cost_daily(self, days: int = 30) -> List[Dict[str, Any]]:
        """Get daily cost trend for the last N days."""
        async with self._lock:
            now = datetime.datetime.now()
            daily: Dict[str, Dict[str, Any]] = {}

            # Initialize all days with zero
            for i in range(days):
                date = (now - datetime.timedelta(days=i)).strftime("%Y-%m-%d")
                daily[date] = {
                    "date": date,
                    "cost": 0.0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "task_count": 0,
                }

            # Aggregate cost records by day
            for r in self._cost_records:
                date = r["timestamp"][:10]  # YYYY-MM-DD
                if date in daily:
                    daily[date]["cost"] += r["cost"]
                    daily[date]["input_tokens"] += r["input_tokens"]
                    daily[date]["output_tokens"] += r["output_tokens"]
                    daily[date]["task_count"] += 1

            result = sorted(daily.values(), key=lambda x: x["date"])
            for item in result:
                item["cost"] = round(item["cost"], 4)
            return result

    async def get_model_rates(self) -> Dict[str, Dict[str, float]]:
        """Get current model token rates."""
        async with self._lock:
            return self._model_rates.copy()

    async def update_model_rate(self, model: str, input_rate: float, output_rate: float) -> Dict[str, Any]:
        """Update token rates for a model."""
        async with self._lock:
            self._model_rates[model] = {"input": input_rate, "output": output_rate}
            return {model: self._model_rates[model]}
