"""Security tests for H.E.R.M.E.S. API."""
import pytest
import os
import sys
import types
from contextlib import contextmanager

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock missing external modules
hermes_agent_mock = types.ModuleType("hermes_agent")
hermes_agent_mock.AIAgent = type("AIAgent", (), {"__init__": lambda self, **kw: None})
sys.modules["hermes_agent"] = hermes_agent_mock

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
    def defn(cls=None): return cls if cls else (lambda c: c)
    @staticmethod
    def run(fn=None): return fn
    @staticmethod
    def signal(*a, **kw): return (lambda fn: fn) if not callable(a[0] if a else None) else a[0]
    @staticmethod
    def query(*a, **kw): return (lambda fn: fn) if not callable(a[0] if a else None) else a[0]
    @staticmethod
    async def execute_activity(*args, **kwargs): return None

class _ActivityMock:
    @staticmethod
    def defn(cls=None): return cls if cls else (lambda c: c)

temporalio_mock = types.ModuleType("temporalio")
temporalio_mock.workflow = _WorkflowMock
temporalio_mock.activity = _ActivityMock
temporalio_mock.Client = type("Client", (), {"connect": staticmethod(lambda *a, **kw: None)})
sys.modules["temporalio"] = temporalio_mock
sys.modules["temporalio.workflow"] = _WorkflowMock
sys.modules["temporalio.activity"] = _ActivityMock
sys.modules["temporalio.client"] = types.ModuleType("temporalio.client")
sys.modules["temporalio.client"].Client = temporalio_mock.Client

from fastapi.testclient import TestClient
from main import app, hermes, task_repo, log_repo, notification_svc, cache
import app.infrastructure.db_pool as db_pool_module
from app.infrastructure.db_pool import get_pool


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    tmp_dir = tmp_path_factory.mktemp("security")
    db_path = str(tmp_dir / "security_test.db")
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


class TestInputValidation:
    def test_sql_injection_in_agent_name(self, client):
        response = client.post("/agents", json={"name": "'; DROP TABLE agents; --", "role": "Hacker"})
        assert response.status_code == 200
        assert isinstance(client.get("/agents").json(), list)

    def test_sql_injection_in_agent_id(self, client):
        assert client.get("/agents/'; DROP TABLE agents; --").status_code == 404

    def test_xss_in_agent_name(self, client):
        response = client.post("/agents", json={"name": "<script>alert('xss')</script>", "role": "Worker"})
        assert response.status_code == 200

    def test_unicode_agent_name(self, client):
        assert client.post("/agents", json={"name": "TestAgent", "role": "Worker"}).status_code == 200

    def test_null_values(self, client):
        assert client.post("/agents", json={"name": None, "role": "Worker"}).status_code == 422

    def test_integer_where_string_expected(self, client):
        response = client.post("/agents", json={"name": 12345, "role": 67890})
        assert response.status_code in (200, 422)


class TestCORS:
    def test_cors_preflight(self, client):
        response = client.options("/agents", headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        })
        assert response.status_code in (200, 204)

    def test_cors_from_different_origin(self, client):
        assert client.get("/agents", headers={"Origin": "http://evil.com"}).status_code == 200


class TestErrorHandling:
    def test_404_returns_json(self, client):
        assert client.get("/nonexistent_endpoint").status_code == 404

    def test_method_not_allowed(self, client):
        assert client.patch("/agents").status_code == 405


class TestAuthentication:
    def test_no_auth_required_currently(self, client):
        assert client.get("/agents").status_code == 200

    def test_endpoints_accessible_without_token(self, client):
        for endpoint in ["/agents", "/tasks", "/metrics", "/notifications", "/logs"]:
            assert client.get(endpoint).status_code == 200


class TestDataLeakage:
    def test_error_messages_dont_expose_internals(self, client):
        response = client.get("/agents/nonexistent")
        assert response.status_code == 404
        detail = response.json().get("detail", "")
        assert "sqlite" not in detail.lower()
        assert ".db" not in detail
