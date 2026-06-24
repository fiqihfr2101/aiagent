"""Unit tests for CacheService (Redis cache with graceful degradation)."""
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from app.infrastructure.cache_service import CacheService


class TestCacheServiceBasic:
    @pytest.fixture
    def cache_unavailable(self):
        svc = CacheService()
        svc._available = False
        svc._client = None
        return svc

    @pytest.mark.asyncio
    async def test_get_returns_none_when_unavailable(self, cache_unavailable):
        assert await cache_unavailable.get("any_key") is None

    @pytest.mark.asyncio
    async def test_set_returns_false_when_unavailable(self, cache_unavailable):
        assert await cache_unavailable.set("key", "value") is False

    @pytest.mark.asyncio
    async def test_delete_returns_false_when_unavailable(self, cache_unavailable):
        assert await cache_unavailable.delete("key") is False

    @pytest.mark.asyncio
    async def test_exists_returns_false_when_unavailable(self, cache_unavailable):
        assert await cache_unavailable.exists("key") is False

    @pytest.mark.asyncio
    async def test_invalidate_pattern_returns_zero(self, cache_unavailable):
        assert await cache_unavailable.invalidate_pattern("test:*") == 0

    @pytest.mark.asyncio
    async def test_info_returns_unavailable(self, cache_unavailable):
        result = await cache_unavailable.info()
        assert result["available"] is False

    def test_available_property_false(self, cache_unavailable):
        assert cache_unavailable.available is False


class TestCacheServiceWithMockRedis:
    @pytest.fixture
    def mock_cache(self):
        svc = CacheService()
        svc._available = True
        mock_client = AsyncMock()
        svc._client = mock_client
        return svc, mock_client

    @pytest.mark.asyncio
    async def test_get_hit(self, mock_cache):
        svc, client = mock_cache
        client.get.return_value = json.dumps({"data": "test"})
        result = await svc.get("key")
        assert result == {"data": "test"}

    @pytest.mark.asyncio
    async def test_get_miss(self, mock_cache):
        svc, client = mock_cache
        client.get.return_value = None
        assert await svc.get("key") is None

    @pytest.mark.asyncio
    async def test_get_error_returns_none(self, mock_cache):
        svc, client = mock_cache
        client.get.side_effect = Exception("Connection error")
        assert await svc.get("key") is None

    @pytest.mark.asyncio
    async def test_set_success(self, mock_cache):
        svc, client = mock_cache
        client.set.return_value = True
        assert await svc.set("key", {"data": "test"}, ttl=30) is True

    @pytest.mark.asyncio
    async def test_set_error_returns_false(self, mock_cache):
        svc, client = mock_cache
        client.set.side_effect = Exception("Connection error")
        assert await svc.set("key", "value") is False

    @pytest.mark.asyncio
    async def test_delete_success(self, mock_cache):
        svc, client = mock_cache
        client.delete.return_value = 1
        assert await svc.delete("key") is True

    @pytest.mark.asyncio
    async def test_exists_true(self, mock_cache):
        svc, client = mock_cache
        client.exists.return_value = 1
        assert await svc.exists("key") is True

    @pytest.mark.asyncio
    async def test_exists_false(self, mock_cache):
        svc, client = mock_cache
        client.exists.return_value = 0
        assert await svc.exists("key") is False

    @pytest.mark.asyncio
    async def test_invalidate_pattern_deletes_keys(self, mock_cache):
        """Test that invalidate_pattern scans and deletes matching keys."""
        svc, client = mock_cache
        keys = [b"agents:list", b"agents:detail:1"]
        async def mock_scan(match, count=100):
            for k in keys:
                yield k
        client.scan_iter = mock_scan
        client.delete = AsyncMock(return_value=1)
        # invalidate_pattern is the underlying method
        count = await svc.invalidate_pattern("agents:*")
        assert count == 2

    @pytest.mark.asyncio
    async def test_invalidate_agents_calls_pattern(self, mock_cache):
        """Test that invalidate_agents delegates to invalidate_pattern."""
        svc, client = mock_cache
        async def mock_scan(match, count=100):
            yield b"agents:list"
            yield b"agents:detail:1"
        client.scan_iter = mock_scan
        client.delete = AsyncMock(return_value=1)
        # invalidate_agents calls invalidate_pattern but doesn't return the count
        await svc.invalidate_agents()
        # Verify delete was called for each key
        assert client.delete.call_count == 2

    @pytest.mark.asyncio
    async def test_invalidate_tasks_calls_pattern(self, mock_cache):
        svc, client = mock_cache
        async def mock_scan(match, count=100):
            yield b"tasks:list"
        client.scan_iter = mock_scan
        client.delete = AsyncMock(return_value=1)
        await svc.invalidate_tasks()
        assert client.delete.call_count == 1

    @pytest.mark.asyncio
    async def test_invalidate_metrics_calls_pattern(self, mock_cache):
        svc, client = mock_cache
        async def mock_scan(match, count=100):
            yield b"metrics:all"
        client.scan_iter = mock_scan
        client.delete = AsyncMock(return_value=1)
        await svc.invalidate_metrics()
        assert client.delete.call_count == 1

    @pytest.mark.asyncio
    async def test_invalidate_all(self, mock_cache):
        svc, client = mock_cache
        async def mock_scan(match, count=100):
            yield b"key1"
        client.scan_iter = mock_scan
        client.delete = AsyncMock(return_value=1)
        await svc.invalidate_all()

    @pytest.mark.asyncio
    async def test_info_success(self, mock_cache):
        svc, client = mock_cache
        client.info = AsyncMock(side_effect=[
            {"keyspace_hits": 100, "keyspace_misses": 20, "connected_clients": 3},
            {"used_memory_human": "1.5M"},
        ])
        result = await svc.info()
        assert result["available"] is True
        assert result["hits"] == 100
        assert result["misses"] == 20

    @pytest.mark.asyncio
    async def test_info_error(self, mock_cache):
        svc, client = mock_cache
        client.info.side_effect = Exception("Error")
        result = await svc.info()
        assert result["available"] is True
        assert result["hits"] == 0

    @pytest.mark.asyncio
    async def test_serializes_complex_objects(self, mock_cache):
        svc, client = mock_cache
        complex_obj = {"agents": [{"id": "a1", "tags": ["ml", "nlp"]}], "count": 5}
        client.set.return_value = True
        result = await svc.set("key", complex_obj)
        assert result is True

    @pytest.mark.asyncio
    async def test_deserializes_json(self, mock_cache):
        svc, client = mock_cache
        client.get.return_value = json.dumps([1, 2, 3])
        result = await svc.get("key")
        assert result == [1, 2, 3]
