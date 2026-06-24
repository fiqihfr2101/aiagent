"""Unit tests for MetricsCollector including cost tracking."""
import pytest
import asyncio
from app.infrastructure.metrics_collector import (
    MetricsCollector,
    AgentMetrics,
    TaskMetrics,
    SystemMetrics,
    DEFAULT_MODEL_RATES,
)


class TestMetricsCollectorAgentMetrics:
    """Test agent metrics operations."""

    @pytest.mark.asyncio
    async def test_register_agent(self, metrics_collector):
        result = await metrics_collector.register_agent("agent-1", "JARVIS")
        assert result.agent_id == "agent-1"
        assert result.name == "JARVIS"
        assert result.status == "active"
        assert result.task_count == 0

    @pytest.mark.asyncio
    async def test_get_agent_metrics(self, metrics_collector):
        await metrics_collector.register_agent("agent-1", "JARVIS")
        metrics = await metrics_collector.get_agent_metrics("agent-1")
        assert metrics is not None
        assert metrics["agent_id"] == "agent-1"

    @pytest.mark.asyncio
    async def test_get_agent_metrics_nonexistent(self, metrics_collector):
        assert await metrics_collector.get_agent_metrics("nonexistent") is None

    @pytest.mark.asyncio
    async def test_get_all_agent_metrics(self, metrics_collector):
        await metrics_collector.register_agent("a1", "Agent 1")
        await metrics_collector.register_agent("a2", "Agent 2")
        all_metrics = await metrics_collector.get_all_agent_metrics()
        assert len(all_metrics) == 2

    @pytest.mark.asyncio
    async def test_record_task_completion_success(self, metrics_collector):
        await metrics_collector.register_agent("a1", "Agent 1")
        await metrics_collector.record_task_completion("a1", success=True, duration=5.0)
        metrics = await metrics_collector.get_agent_metrics("a1")
        assert metrics["task_count"] == 1
        assert metrics["error_count"] == 0
        assert metrics["error_rate"] == 0.0

    @pytest.mark.asyncio
    async def test_record_task_completion_failure(self, metrics_collector):
        await metrics_collector.register_agent("a1", "Agent 1")
        await metrics_collector.record_task_completion("a1", success=False)
        metrics = await metrics_collector.get_agent_metrics("a1")
        assert metrics["task_count"] == 1
        assert metrics["error_count"] == 1
        assert metrics["error_rate"] == 100.0

    @pytest.mark.asyncio
    async def test_record_task_completion_mixed(self, metrics_collector):
        await metrics_collector.register_agent("a1", "Agent 1")
        await metrics_collector.record_task_completion("a1", success=True)
        await metrics_collector.record_task_completion("a1", success=True)
        await metrics_collector.record_task_completion("a1", success=False)
        metrics = await metrics_collector.get_agent_metrics("a1")
        assert metrics["task_count"] == 3
        assert metrics["error_count"] == 1
        assert abs(metrics["error_rate"] - 33.33) < 0.1

    @pytest.mark.asyncio
    async def test_update_agent_seen(self, metrics_collector):
        await metrics_collector.register_agent("a1", "Agent 1")
        original = (await metrics_collector.get_agent_metrics("a1"))["last_seen"]
        await asyncio.sleep(0.01)
        await metrics_collector.update_agent_seen("a1")
        updated = (await metrics_collector.get_agent_metrics("a1"))["last_seen"]
        assert updated >= original

    @pytest.mark.asyncio
    async def test_set_agent_status(self, metrics_collector):
        await metrics_collector.register_agent("a1", "Agent 1")
        await metrics_collector.set_agent_status("a1", "error")
        metrics = await metrics_collector.get_agent_metrics("a1")
        assert metrics["status"] == "error"


class TestMetricsCollectorTaskMetrics:
    """Test task metrics operations."""

    @pytest.mark.asyncio
    async def test_start_task(self, metrics_collector):
        result = await metrics_collector.start_task("t1", "a1")
        assert result.task_id == "t1"
        assert result.status == "pending"

    @pytest.mark.asyncio
    async def test_complete_task_success(self, metrics_collector):
        await metrics_collector.start_task("t1", "a1")
        result = await metrics_collector.complete_task(
            "t1", success=True, duration=3.5, token_usage=500,
            input_tokens=200, output_tokens=300, model="claude-sonnet-4"
        )
        assert result.status == "success"
        assert result.duration == 3.5
        assert result.token_usage == 500
        assert result.cost > 0

    @pytest.mark.asyncio
    async def test_complete_task_failure(self, metrics_collector):
        await metrics_collector.start_task("t1", "a1")
        result = await metrics_collector.complete_task("t1", success=False)
        assert result.status == "failed"

    @pytest.mark.asyncio
    async def test_complete_nonexistent_task(self, metrics_collector):
        result = await metrics_collector.complete_task("nonexistent", success=True)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_task_metrics(self, metrics_collector):
        await metrics_collector.start_task("t1", "a1")
        metrics = await metrics_collector.get_task_metrics("t1")
        assert metrics is not None
        assert metrics["task_id"] == "t1"

    @pytest.mark.asyncio
    async def test_get_task_metrics_nonexistent(self, metrics_collector):
        assert await metrics_collector.get_task_metrics("nonexistent") is None

    @pytest.mark.asyncio
    async def test_get_all_task_metrics(self, metrics_collector):
        await metrics_collector.start_task("t1", "a1")
        await metrics_collector.start_task("t2", "a1")
        all_metrics = await metrics_collector.get_all_task_metrics()
        assert len(all_metrics) == 2


class TestMetricsCollectorSystemMetrics:
    """Test system metrics operations."""

    @pytest.mark.asyncio
    async def test_update_system_metrics(self, metrics_collector):
        result = await metrics_collector.update_system_metrics(
            cpu_percent=45.5,
            memory_percent=62.3,
            active_websockets=3,
            total_agents=5,
            active_agents=4,
        )
        assert result.cpu_percent == 45.5
        assert result.memory_percent == 62.3
        assert result.active_websockets == 3

    @pytest.mark.asyncio
    async def test_get_system_metrics(self, metrics_collector):
        await metrics_collector.update_system_metrics(cpu_percent=50.0)
        result = await metrics_collector.get_system_metrics()
        assert "cpu_percent" in result
        assert "uptime_seconds" in result
        assert "timestamp" in result

    @pytest.mark.asyncio
    async def test_system_metrics_derives_task_counts(self, metrics_collector):
        """Test that update_system_metrics derives task counts from task metrics."""
        await metrics_collector.start_task("st1", "sa1")
        await metrics_collector.complete_task("st1", success=True)
        await metrics_collector.start_task("st2", "sa1")
        await metrics_collector.complete_task("st2", success=False)
        # Must call update_system_metrics to derive counts from task metrics
        result = await metrics_collector.update_system_metrics()
        assert result.total_tasks == 2
        assert result.completed_tasks == 1
        assert result.failed_tasks == 1


class TestMetricsCollectorCostTracking:
    """Test cost calculation and tracking."""

    @pytest.mark.asyncio
    async def test_cost_calculation_claude_sonnet(self, metrics_collector):
        await metrics_collector.start_task("ct1", "ca1")
        result = await metrics_collector.complete_task(
            "ct1", success=True,
            input_tokens=1000, output_tokens=1000,
            model="claude-sonnet-4"
        )
        expected = (1000 / 1000) * 0.003 + (1000 / 1000) * 0.015
        assert abs(result.cost - expected) < 0.0001

    @pytest.mark.asyncio
    async def test_cost_calculation_gpt4(self, metrics_collector):
        await metrics_collector.start_task("ct2", "ca1")
        result = await metrics_collector.complete_task(
            "ct2", success=True,
            input_tokens=1000, output_tokens=1000,
            model="gpt-4"
        )
        expected = (1000 / 1000) * 0.03 + (1000 / 1000) * 0.06
        assert abs(result.cost - expected) < 0.0001

    @pytest.mark.asyncio
    async def test_cost_summary(self, metrics_collector):
        await metrics_collector.register_agent("csa1", "Cost Agent")
        await metrics_collector.start_task("cst1", "csa1")
        await metrics_collector.complete_task(
            "cst1", success=True,
            input_tokens=1000, output_tokens=500,
            model="claude-sonnet-4"
        )
        summary = await metrics_collector.get_cost_summary()
        assert summary["total_cost"] > 0
        assert summary["total_tasks"] == 1

    @pytest.mark.asyncio
    async def test_cost_by_agent(self, metrics_collector):
        await metrics_collector.register_agent("cba1", "Agent 1")
        await metrics_collector.start_task("cbt1", "cba1")
        await metrics_collector.complete_task(
            "cbt1", success=True,
            input_tokens=500, output_tokens=500,
            model="claude-sonnet-4"
        )
        costs = await metrics_collector.get_cost_by_agent()
        assert len(costs) >= 1
        found = [c for c in costs if c["agent_id"] == "cba1"]
        assert len(found) == 1
        assert found[0]["total_cost"] > 0

    @pytest.mark.asyncio
    async def test_cost_by_model(self, metrics_collector):
        await metrics_collector.start_task("cbmt1", "cbma1")
        await metrics_collector.complete_task(
            "cbmt1", success=True,
            input_tokens=500, output_tokens=500,
            model="gpt-4o"
        )
        costs = await metrics_collector.get_cost_by_model()
        found = [c for c in costs if c["model"] == "gpt-4o"]
        assert len(found) == 1

    @pytest.mark.asyncio
    async def test_cost_daily(self, metrics_collector):
        await metrics_collector.start_task("cdt1", "cda1")
        await metrics_collector.complete_task(
            "cdt1", success=True,
            input_tokens=1000, output_tokens=1000,
            model="claude-sonnet-4"
        )
        daily = await metrics_collector.get_cost_daily(days=7)
        assert len(daily) == 7
        today_total = sum(d["cost"] for d in daily)
        assert today_total > 0

    def test_set_model_rate(self, metrics_collector):
        metrics_collector.set_model_rate("custom-model", 0.01, 0.02)
        assert metrics_collector._model_rates["custom-model"]["input"] == 0.01

    @pytest.mark.asyncio
    async def test_update_model_rate(self, metrics_collector):
        result = await metrics_collector.update_model_rate("test-model", 0.005, 0.01)
        assert "test-model" in result
        assert result["test-model"]["input"] == 0.005

    @pytest.mark.asyncio
    async def test_get_model_rates(self, metrics_collector):
        rates = await metrics_collector.get_model_rates()
        assert "claude-sonnet-4" in rates
        assert "gpt-4" in rates

    def test_default_model_rates_not_empty(self):
        assert len(DEFAULT_MODEL_RATES) > 0
        assert "claude-sonnet-4" in DEFAULT_MODEL_RATES
        assert "gpt-4" in DEFAULT_MODEL_RATES


class TestMetricsCollectorIngest:
    """Test external metrics ingestion."""

    @pytest.mark.asyncio
    async def test_ingest_basic(self, metrics_collector):
        result = await metrics_collector.ingest_external_metrics({
            "agent_id": "a1",
            "task_id": "t1",
            "status": "success",
            "duration": 3.0,
            "token_usage": 200,
        })
        assert result["status"] == "ok"

    @pytest.mark.asyncio
    async def test_ingest_without_agent_id(self, metrics_collector):
        result = await metrics_collector.ingest_external_metrics({"task_id": "t1"})
        assert "error" in result

    @pytest.mark.asyncio
    async def test_ingest_without_task_id(self, metrics_collector):
        await metrics_collector.register_agent("a1", "Agent 1")
        result = await metrics_collector.ingest_external_metrics({"agent_id": "a1"})
        assert result["status"] == "ok"

    @pytest.mark.asyncio
    async def test_get_all_metrics(self, metrics_collector):
        await metrics_collector.register_agent("a1", "Agent 1")
        result = await metrics_collector.get_all_metrics()
        assert "agents" in result
        assert "tasks" in result
        assert "system" in result
        assert "timestamp" in result


class TestMetricsCollectorDataClasses:
    """Test data class serialization."""

    def test_agent_metrics_to_dict(self):
        m = AgentMetrics(agent_id="a1", name="Test")
        d = m.to_dict()
        assert isinstance(d, dict)
        assert d["agent_id"] == "a1"

    def test_task_metrics_to_dict(self):
        m = TaskMetrics(task_id="t1", agent_id="a1")
        d = m.to_dict()
        assert isinstance(d, dict)
        assert d["task_id"] == "t1"

    def test_system_metrics_to_dict(self):
        m = SystemMetrics()
        d = m.to_dict()
        assert isinstance(d, dict)
        assert "cpu_percent" in d
