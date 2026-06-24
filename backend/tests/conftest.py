"""Shared fixtures for H.E.R.M.E.S. backend tests."""
import os
import sys
import pytest
import tempfile
import asyncio

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def tmp_db(tmp_path):
    """Provide a temporary database path."""
    return str(tmp_path / "test_hermes.db")


@pytest.fixture
def agent_repo(tmp_db):
    """Create a fresh AgentRepository with a temp database."""
    from app.infrastructure.agent_repository import AgentRepository
    repo = AgentRepository(db_path=tmp_db)
    yield repo


@pytest.fixture
def log_repo(tmp_db):
    """Create a fresh LogRepository with a temp database."""
    from app.infrastructure.log_repository import LogRepository
    repo = LogRepository(db_path=tmp_db)
    yield repo


@pytest.fixture
def task_repo(tmp_db, log_repo):
    """Create a fresh TaskRepository with a temp database."""
    from app.infrastructure.task_repository import TaskRepository
    repo = TaskRepository(db_path=tmp_db, log_repo=log_repo)
    yield repo


@pytest.fixture
def notification_svc(tmp_db):
    """Create a fresh NotificationService with a temp database."""
    from app.infrastructure.notification_service import NotificationService
    svc = NotificationService(db_path=tmp_db)
    yield svc


@pytest.fixture
def metrics_collector():
    """Create a fresh MetricsCollector."""
    from app.infrastructure.metrics_collector import MetricsCollector
    return MetricsCollector()


@pytest.fixture
def ws_manager():
    """Create a fresh WebSocketManager."""
    from app.infrastructure.ws_manager import WebSocketManager
    return WebSocketManager()


@pytest.fixture
def event_loop():
    """Create an event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def sample_agent(agent_repo):
    """Create a sample agent and return it."""
    return agent_repo.create("TestAgent", "Tester", "claude-sonnet-4", "active", "#00D4AA")


@pytest.fixture
def sample_task(task_repo, sample_agent):
    """Create a sample task and return it."""
    return task_repo.create(sample_agent["id"], "Test Task", "P1")


@pytest.fixture
def sample_notification(notification_svc):
    """Create a sample notification and return it."""
    return notification_svc.create(
        "task_completed",
        "Test Notification",
        "Test description",
        {"task_id": "test-123"},
    )
