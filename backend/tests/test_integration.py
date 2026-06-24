"""Integration tests for H.E.R.M.E.S. API endpoints using FastAPI TestClient."""
import pytest
import json
import os
import sys
import time
import types
from contextlib import contextmanager

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock missing external modules before importing main
# Mock hermes_agent module
hermes_agent_mock = types.ModuleType("hermes_agent")
hermes_agent_mock.AIAgent = type("AIAgent", (), {"__init__": lambda self, **kw: None})
sys.modules["hermes_agent"] = hermes_agent_mock

# Mock temporalio modules with proper context manager support
@contextmanager
def _noop_context():
    yield

class _UnsafeMock:
    @staticmethod
    def imports_passed_through():
        return _noop_context()

class _WorkflowMock:
    unsafe = _UnsafeMock()
    
    @staticmethod
    def defn(cls=None):
        return cls if cls else (lambda c: c)
    
    @staticmethod
    def run(fn=None):
        return fn
    
    @staticmethod
    def signal(*a, **kw):
        return (lambda fn: fn) if not callable(a[0] if a else None) else a[0]
    
    @staticmethod
    def query(*a, **kw):
        return (lambda fn: fn) if not callable(a[0] if a else None) else a[0]
    
    @staticmethod
    async def execute_activity(*args, **kwargs):
        return None

class _ActivityMock:
    @staticmethod
    def defn(cls=None):
        return cls if cls else (lambda c: c)
    
    @staticmethod
    def run(*a, **kw):
        return None

temporalio_mock = types.ModuleType("temporalio")
temporalio_mock.workflow = _WorkflowMock
temporalio_mock.activity = _ActivityMock
temporalio_mock.Client = type("Client", (), {
    "connect": staticmethod(lambda *a, **kw: None)
})

sys.modules["temporalio"] = temporalio_mock
sys.modules["temporalio.workflow"] = _WorkflowMock
sys.modules["temporalio.activity"] = _ActivityMock
sys.modules["temporalio.client"] = types.ModuleType("temporalio.client")
sys.modules["temporalio.client"].Client = temporalio_mock.Client

# Now import the app
from fastapi.testclient import TestClient
from main import app, hermes, task_repo, log_repo, notification_svc, metrics_collector, cache
import app.infrastructure.db_pool as db_pool_module
from app.infrastructure.db_pool import get_pool


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    """Create a test client with a temporary database."""
    tmp_dir = tmp_path_factory.mktemp("data")
    db_path = str(tmp_dir / "test_hermes.db")

    db_pool_module._pools.clear()
    pool = get_pool(db_path)

    hermes.repo._pool = pool
    hermes.repo.db_path = db_path
    hermes.repo._init_db()
    task_repo._pool = pool
    task_repo.db_path = db_path
    task_repo._init_db()
    log_repo._pool = pool
    log_repo.db_path = db_path
    log_repo._init_db()
    notification_svc._pool = pool
    notification_svc.db_path = db_path
    notification_svc._init_db()

    cache._available = False
    cache._client = None

    import asyncio
    loop = asyncio.new_event_loop()
    loop.run_until_complete(hermes.initialize())

    with TestClient(app) as c:
        yield c

    loop.close()
    db_pool_module._pools.clear()


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        assert client.get("/health").status_code == 200

    def test_health_has_status(self, client):
        data = client.get("/health").json()
        assert data["status"] == "ok"


class TestAgentEndpoints:
    def test_list_agents(self, client):
        response = client.get("/agents")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_create_agent(self, client):
        response = client.post("/agents", json={
            "name": "IntegrationAgent",
            "role": "Tester",
            "model": "gpt-4o",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "INTEGRATIONAGENT"
        assert data["role"] == "Tester"
        assert data["model"] == "gpt-4o"

    def test_get_agent_by_id(self, client):
        created = client.post("/agents", json={"name": "GetByIdAgent", "role": "Worker"}).json()
        response = client.get(f"/agents/{created['id']}")
        assert response.status_code == 200
        assert response.json()["id"] == created["id"]

    def test_get_agent_not_found(self, client):
        assert client.get("/agents/nonexistent_id").status_code == 404

    def test_update_agent(self, client):
        created = client.post("/agents", json={"name": "UpdateAgent", "role": "Worker"}).json()
        response = client.put(f"/agents/{created['id']}", json={"name": "UpdatedAgent", "role": "Lead"})
        assert response.status_code == 200
        assert response.json()["name"] == "UpdatedAgent"
        assert response.json()["role"] == "Lead"

    def test_update_agent_model(self, client):
        created = client.post("/agents", json={"name": "ModelAgent", "role": "Worker", "model": "claude-sonnet-4"}).json()
        response = client.put(f"/agents/{created['id']}/model", json={"model": "gpt-4o"})
        assert response.status_code == 200
        assert response.json()["model"] == "gpt-4o"

    def test_update_agent_invalid_model(self, client):
        created = client.post("/agents", json={"name": "InvalidModelAgent", "role": "Worker"}).json()
        assert client.put(f"/agents/{created['id']}", json={"model": "invalid-model"}).status_code == 400

    def test_delete_agent(self, client):
        created = client.post("/agents", json={"name": "DeleteAgent", "role": "Temp"}).json()
        response = client.delete(f"/agents/{created['id']}")
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"
        assert client.get(f"/agents/{created['id']}").status_code == 404

    def test_delete_agent_not_found(self, client):
        assert client.delete("/agents/nonexistent").status_code == 404

    def test_create_agent_notification_generated(self, client):
        initial_count = client.get("/notifications").json()["total"]
        client.post("/agents", json={"name": "NotifTestAgent", "role": "Worker"})
        assert client.get("/notifications").json()["total"] > initial_count


class TestTaskEndpoints:
    def test_create_task(self, client):
        agents = client.get("/agents").json()
        response = client.post("/tasks", json={"agent_id": agents[0]["id"], "title": "Integration Test Task", "priority": "P1"})
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Integration Test Task"
        assert data["priority"] == "P1"

    def test_create_task_agent_not_found(self, client):
        assert client.post("/tasks", json={"agent_id": "nonexistent", "title": "Bad Task"}).status_code == 404

    def test_list_tasks(self, client):
        response = client.get("/tasks")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_task_by_id(self, client):
        agents = client.get("/agents").json()
        created = client.post("/tasks", json={"agent_id": agents[0]["id"], "title": "GetById Task"}).json()
        assert client.get(f"/tasks/{created['id']}").status_code == 200

    def test_get_task_not_found(self, client):
        assert client.get("/tasks/nonexistent").status_code == 404

    def test_task_history(self, client):
        response = client.get("/tasks/history")
        assert response.status_code == 200
        data = response.json()
        assert "tasks" in data
        assert "total" in data

    def test_task_history_pagination(self, client):
        data = client.get("/tasks/history?page=1&page_size=2").json()
        assert data["page"] == 1
        assert data["page_size"] == 2

    def test_task_counts_bug_documented(self, client):
        """FIXED: /tasks/counts now returns 200 because /tasks/counts is defined before /tasks/{task_id}.
        """
        response = client.get("/tasks/counts")
        assert response.status_code == 200, "Route order fixed: /tasks/counts now matches correctly"

    def test_stop_task_bug_documented(self, client):
        """FIXED: stop_task now uses shared TaskRepository instance.
        """
        agents = client.get("/agents").json()
        task = client.post("/tasks", json={"agent_id": agents[0]["id"], "title": "Stoppable Task"}).json()
        time.sleep(0.5)
        response = client.post(f"/tasks/{task['id']}/stop")
        data = response.json()
        assert response.status_code == 200
        assert data["status"] == "STOPPED", "stop_task now correctly updates status using shared DB instance"

    def test_stop_nonexistent_task(self, client):
        assert client.post("/tasks/nonexistent/stop").status_code == 404


class TestLogEndpoints:
    def test_get_all_logs(self, client):
        response = client.get("/logs")
        assert response.status_code == 200
        assert "logs" in response.json()

    def test_create_log(self, client):
        response = client.post("/logs", json={"message": "Test log entry", "level": "INFO"})
        assert response.status_code == 200
        assert response.json()["message"] == "Test log entry"

    def test_get_task_logs(self, client):
        agents = client.get("/agents").json()
        task = client.post("/tasks", json={"agent_id": agents[0]["id"], "title": "Logged Task"}).json()
        time.sleep(1)
        assert client.get(f"/tasks/{task['id']}/logs").status_code == 200

    def test_get_task_logs_not_found(self, client):
        assert client.get("/tasks/nonexistent/logs").status_code == 404


class TestMetricsEndpoints:
    def test_get_all_metrics(self, client):
        data = client.get("/metrics").json()
        assert "agents" in data
        assert "tasks" in data
        assert "system" in data

    def test_get_agent_metrics(self, client):
        assert client.get("/metrics/agents").status_code == 200

    def test_get_system_metrics(self, client):
        data = client.get("/metrics/system").json()
        assert "cpu_percent" in data
        assert "uptime_seconds" in data

    def test_collect_metrics(self, client):
        agents = client.get("/agents").json()
        response = client.post("/metrics/collect", json={
            "agent_id": agents[0]["id"],
            "task_id": "test-metrics-task",
            "status": "success",
            "duration": 2.5,
            "token_usage": 300,
        })
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


class TestCostEndpoints:
    def test_cost_summary(self, client):
        data = client.get("/metrics/costs").json()
        assert "total_cost" in data
        assert "total_tasks" in data

    def test_cost_by_agent(self, client):
        assert client.get("/metrics/costs/agents").status_code == 200

    def test_cost_by_model(self, client):
        assert client.get("/metrics/costs/models").status_code == 200

    def test_cost_daily(self, client):
        assert client.get("/metrics/costs/daily").status_code == 200

    def test_model_rates(self, client):
        data = client.get("/metrics/costs/rates").json()
        assert "claude-sonnet-4" in data

    def test_update_model_rate(self, client):
        assert client.put("/metrics/costs/rates/test-model", json={"input": 0.005, "output": 0.01}).status_code == 200


class TestNotificationEndpoints:
    def test_list_notifications(self, client):
        data = client.get("/notifications").json()
        assert "notifications" in data
        assert "total" in data
        assert "unread_count" in data

    def test_list_notifications_unread_only(self, client):
        assert client.get("/notifications?unread_only=true").status_code == 200

    def test_mark_notification_read(self, client):
        notifs = client.get("/notifications").json()
        if notifs["notifications"]:
            notif_id = notifs["notifications"][0]["id"]
            response = client.post("/notifications/read", json={"id": notif_id})
            assert response.status_code == 200
            assert response.json()["read"] is True

    def test_mark_all_read(self, client):
        response = client.post("/notifications/read-all")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_delete_notification(self, client):
        notifs = client.get("/notifications").json()
        if notifs["notifications"]:
            notif_id = notifs["notifications"][-1]["id"]
            response = client.delete(f"/notifications/{notif_id}")
            assert response.status_code == 200
            assert response.json()["status"] == "deleted"

    def test_delete_notification_not_found(self, client):
        assert client.delete("/notifications/nonexistent").status_code == 404


class TestModelEndpoints:
    def test_list_models(self, client):
        data = client.get("/models").json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert "id" in data[0]
        assert "family" in data[0]


class TestCacheStatusEndpoint:
    def test_cache_status(self, client):
        response = client.get("/cache/status")
        assert response.status_code == 200
        assert "available" in response.json()


class TestMiddlewareHeaders:
    def test_request_id_header(self, client):
        assert "X-Request-ID" in client.get("/health").headers

    def test_custom_request_id(self, client):
        assert client.get("/health", headers={"X-Request-ID": "custom-123"}).headers["X-Request-ID"] == "custom-123"

    def test_cache_control_agents(self, client):
        assert "Cache-Control" in client.get("/agents").headers

    def test_cache_control_tasks(self, client):
        assert "Cache-Control" in client.get("/tasks").headers

    def test_cache_control_metrics(self, client):
        assert "Cache-Control" in client.get("/metrics").headers


class TestCORSMiddleware:
    def test_cors_preflight(self, client):
        response = client.options("/agents", headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        })
        assert response.status_code in (200, 204)

    def test_cors_headers_present(self, client):
        assert client.get("/agents", headers={"Origin": "http://localhost:3000"}).status_code == 200


class TestEdgeCases:
    def test_invalid_json_body(self, client):
        assert client.post("/agents", content="not json", headers={"Content-Type": "application/json"}).status_code == 422

    def test_missing_required_field(self, client):
        assert client.post("/agents", json={"name": "NoRole"}).status_code == 422

    def test_pagination_edge_page_zero(self, client):
        assert client.get("/tasks/history?page=0").status_code == 422

    def test_pagination_edge_page_size_zero(self, client):
        assert client.get("/tasks/history?page_size=0").status_code == 422

    def test_pagination_edge_page_size_too_large(self, client):
        assert client.get("/tasks/history?page_size=200").status_code == 422
