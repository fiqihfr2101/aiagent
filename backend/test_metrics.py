"""Tests for the MetricsCollector."""

import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.infrastructure.metrics_collector import MetricsCollector


async def test_metrics_collector():
    """Run tests for MetricsCollector."""
    collector = MetricsCollector()
    passed = 0
    failed = 0

    # Test 1: Register agent
    result = await collector.register_agent("test_agent", "TEST AGENT")
    assert result.agent_id == "test_agent"
    assert result.name == "TEST AGENT"
    assert result.status == "active"
    print("✓ Test 1: Register agent")
    passed += 1

    # Test 2: Get agent metrics
    metrics = await collector.get_agent_metrics("test_agent")
    assert metrics is not None
    assert metrics["agent_id"] == "test_agent"
    assert metrics["task_count"] == 0
    print("✓ Test 2: Get agent metrics")
    passed += 1

    # Test 3: Record task completion
    await collector.record_task_completion("test_agent", success=True, duration=1.5)
    await collector.record_task_completion("test_agent", success=True, duration=2.0)
    await collector.record_task_completion("test_agent", success=False, duration=0.5)
    metrics = await collector.get_agent_metrics("test_agent")
    assert metrics["task_count"] == 3
    assert metrics["error_count"] == 1
    assert abs(metrics["error_rate"] - 33.33) < 0.1
    print("✓ Test 3: Record task completion and error rate")
    passed += 1

    # Test 4: Start and complete task
    task = await collector.start_task("task-001", "test_agent")
    assert task.task_id == "task-001"
    assert task.status == "pending"
    completed = await collector.complete_task("task-001", success=True, duration=5.0, token_usage=150)
    assert completed.status == "success"
    assert completed.duration == 5.0
    assert completed.token_usage == 150
    print("✓ Test 4: Start and complete task")
    passed += 1

    # Test 5: Get all agent metrics
    await collector.register_agent("agent_2", "AGENT TWO")
    all_agents = await collector.get_all_agent_metrics()
    assert len(all_agents) == 2
    print("✓ Test 5: Get all agent metrics")
    passed += 1

    # Test 6: System metrics
    sys_metrics = await collector.update_system_metrics(
        cpu_percent=45.5,
        memory_percent=62.3,
        active_websockets=3,
        total_agents=5,
        active_agents=4,
    )
    assert sys_metrics.cpu_percent == 45.5
    assert sys_metrics.memory_percent == 62.3
    assert sys_metrics.active_websockets == 3
    assert sys_metrics.total_agents == 5
    print("✓ Test 6: System metrics update")
    passed += 1

    # Test 7: Get system metrics
    sys_data = await collector.get_system_metrics()
    assert "cpu_percent" in sys_data
    assert "memory_percent" in sys_data
    assert "active_websockets" in sys_data
    assert sys_data["total_tasks"] == 1  # from task-001
    print("✓ Test 7: Get system metrics")
    passed += 1

    # Test 8: Get all metrics
    all_metrics = await collector.get_all_metrics()
    assert "agents" in all_metrics
    assert "tasks" in all_metrics
    assert "system" in all_metrics
    assert len(all_metrics["agents"]) == 2
    print("✓ Test 8: Get all metrics")
    passed += 1

    # Test 9: Ingest external metrics
    result = await collector.ingest_external_metrics({
        "agent_id": "test_agent",
        "task_id": "task-002",
        "status": "success",
        "duration": 3.0,
        "token_usage": 200,
    })
    assert result["status"] == "ok"
    task_metrics = await collector.get_task_metrics("task-002")
    assert task_metrics is not None
    assert task_metrics["status"] == "success"
    print("✓ Test 9: Ingest external metrics")
    passed += 1

    # Test 10: Ingest without agent_id
    result = await collector.ingest_external_metrics({"task_id": "task-003"})
    assert "error" in result
    print("✓ Test 10: Ingest without agent_id returns error")
    passed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*50}")
    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(test_metrics_collector())
    sys.exit(0 if success else 1)
