"""
Rate Limiter for H.E.R.M.E.S. AI Agent Orchestrator.

Sliding window rate limiting per-endpoint and per-user.
Supports internal/batch operation bypass for higher throughput.
"""

import os
import time
import logging
from collections import defaultdict
from typing import Optional

from fastapi import Request, HTTPException

logger = logging.getLogger("hermes.rate_limit")


class SlidingWindowCounter:
    """Sliding window rate limiter using a counter approach."""

    def __init__(self, window_seconds: int = 60, max_requests: int = 60):
        self.window_seconds = window_seconds
        self.max_requests = max_requests
        self.requests: list[float] = []
        self.consecutive_hits: int = 0  # Track consecutive rate limit hits

    def is_allowed(self) -> bool:
        """Check if a request is allowed under the rate limit."""
        now = time.time()
        window_start = now - self.window_seconds

        # Remove old requests outside the window
        self.requests = [ts for ts in self.requests if ts > window_start]

        if len(self.requests) >= self.max_requests:
            self.consecutive_hits += 1
            return False

        self.consecutive_hits = 0
        self.requests.append(now)
        return True

    def remaining(self) -> int:
        """Get remaining requests in the current window."""
        now = time.time()
        window_start = now - self.window_seconds
        self.requests = [ts for ts in self.requests if ts > window_start]
        return max(0, self.max_requests - len(self.requests))

    def reset_after(self) -> float:
        """Get seconds until the oldest request expires from the window."""
        if not self.requests:
            return 0.0
        now = time.time()
        window_start = now - self.window_seconds
        valid = [ts for ts in self.requests if ts > window_start]
        if not valid:
            return 0.0
        return max(0.0, valid[0] + self.window_seconds - now)

    def exponential_backoff(self) -> float:
        """Calculate exponential backoff time based on consecutive hits."""
        if self.consecutive_hits <= 0:
            return 0.0
        base_backoff = self.reset_after()
        multiplier = min(2 ** self.consecutive_hits, 32)  # Cap at 32x
        return min(base_backoff * multiplier, 120.0)  # Cap at 2 minutes


class RateLimiter:
    """
    Rate limiter with per-endpoint and per-user limits.

    Uses sliding window counters for accurate rate limiting.
    Supports internal/batch operation bypass and exponential backoff.
    """

    # Internal/batch API key from environment
    INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

    # Default rate limits by endpoint pattern
    DEFAULT_LIMITS: dict[str, dict] = {
        # Auth endpoints - stricter limits
        "POST:/auth/login": {"window": 300, "max": 10},  # 10 per 5 min
        "POST:/auth/refresh": {"window": 60, "max": 20},
        "POST:/auth/logout": {"window": 60, "max": 10},

        # API endpoints - normal limits
        "POST:/agents": {"window": 60, "max": 10},
        "POST:/tasks": {"window": 60, "max": 30},
        "POST:/task": {"window": 60, "max": 30},

        # Read endpoints - generous limits
        "GET:/agents": {"window": 60, "max": 120},
        "GET:/tasks": {"window": 60, "max": 120},
        "GET:/metrics": {"window": 60, "max": 60},
        "GET:/health": {"window": 60, "max": 120},

        # Batch/internal endpoints - very generous limits
        "POST:/api/batch": {"window": 60, "max": 300},
        "POST:/api/internal": {"window": 60, "max": 500},
        "POST:/agents/batch": {"window": 60, "max": 300},
        "POST:/tasks/batch": {"window": 60, "max": 300},

        # Default for unlisted endpoints
        "default": {"window": 60, "max": 60},
    }

    # Per-user global rate limit
    USER_GLOBAL_LIMIT = {"window": 60, "max": 300}  # 300 requests per minute
    # Higher global limit for internal operations
    INTERNAL_GLOBAL_LIMIT = {"window": 60, "max": 1000}  # 1000 requests per minute

    def __init__(self):
        # Per-endpoint per-client counters: {endpoint_key: {client_id: SlidingWindowCounter}}
        self.endpoint_counters: dict[str, dict[str, SlidingWindowCounter]] = defaultdict(dict)
        # Per-user global counters: {user_id: SlidingWindowCounter}
        self.user_counters: dict[str, SlidingWindowCounter] = {}
        # Track rate limit events for monitoring
        self.rate_limit_events: list[dict] = []

    def _get_client_id(self, request: Request) -> str:
        """Extract client identifier from request."""
        # Check if this is an internal request (with API key)
        auth_header = request.headers.get("Authorization", "")
        if self.INTERNAL_API_KEY and auth_header == f"Bearer {self.INTERNAL_API_KEY}":
            return "internal:batch"

        # Try to get user from request state (set by auth middleware)
        user = getattr(request.state, "user", None)
        if user and user.get("username"):
            return f"user:{user['username']}"

        # Fall back to IP address
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return f"ip:{forwarded.split(',')[0].strip()}"
        return f"ip:{request.client.host if request.client else 'unknown'}"

    def _is_internal_client(self, client_id: str) -> bool:
        """Check if the client is an internal/batch operation."""
        return client_id == "internal:batch"

    def _get_endpoint_key(self, request: Request) -> str:
        """Get the rate limit key for an endpoint."""
        method = request.method
        path = request.url.path

        # Check exact match first
        exact_key = f"{method}:{path}"
        if exact_key in self.DEFAULT_LIMITS:
            return exact_key

        # Check pattern matches (e.g., /agents/{id} matches /agents/)
        for pattern in self.DEFAULT_LIMITS:
            if pattern == "default":
                continue
            p_method, p_path = pattern.split(":", 1)
            if method == p_method and path.startswith(p_path.rstrip("/")):
                return pattern

        return "default"

    def _get_limit_config(self, endpoint_key: str, is_internal: bool = False) -> dict:
        """Get rate limit configuration for an endpoint."""
        config = self.DEFAULT_LIMITS.get(endpoint_key, self.DEFAULT_LIMITS["default"])
        # For internal clients, multiply limits by 5
        if is_internal:
            return {
                "window": config["window"],
                "max": config["max"] * 5,
            }
        return config

    def _log_rate_limit_event(self, client_id: str, endpoint_key: str, retry_after: float):
        """Log rate limit hit for monitoring."""
        event = {
            "timestamp": time.time(),
            "client_id": client_id,
            "endpoint": endpoint_key,
            "retry_after": retry_after,
        }
        self.rate_limit_events.append(event)
        # Keep only last 1000 events
        if len(self.rate_limit_events) > 1000:
            self.rate_limit_events = self.rate_limit_events[-1000:]

        logger.warning(
            "Rate limit exceeded: client=%s endpoint=%s retry_after=%.1fs",
            client_id, endpoint_key, retry_after,
        )

    def check_rate_limit(self, request: Request) -> Optional[dict]:
        """
        Check if a request is allowed under rate limits.

        Returns None if allowed, or a dict with rate limit info for the response headers.
        Raises HTTPException if rate limited.
        """
        client_id = self._get_client_id(request)
        endpoint_key = self._get_endpoint_key(request)
        is_internal = self._is_internal_client(client_id)

        # Internal requests bypass rate limiting entirely
        if is_internal:
            logger.debug("Internal request bypassing rate limit: %s %s", request.method, request.url.path)
            return {
                "X-RateLimit-Limit": "unlimited",
                "X-RateLimit-Remaining": "unlimited",
                "X-RateLimit-Reset": "0",
            }

        # Check per-user global rate limit
        global_limit = self.INTERNAL_GLOBAL_LIMIT if is_internal else self.USER_GLOBAL_LIMIT
        if client_id not in self.user_counters:
            self.user_counters[client_id] = SlidingWindowCounter(
                window_seconds=global_limit["window"],
                max_requests=global_limit["max"],
            )
        user_counter = self.user_counters[client_id]

        if not user_counter.is_allowed():
            backoff = user_counter.exponential_backoff()
            self._log_rate_limit_event(client_id, "global", backoff)
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests. Please try again later.",
                    "retry_after": int(backoff),
                    "backoff_seconds": round(backoff, 1),
                },
                headers={
                    "Retry-After": str(int(backoff)),
                    "X-RateLimit-Limit": str(global_limit["max"]),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time() + backoff)),
                    "X-RateLimit-Backoff": str(round(backoff, 1)),
                },
            )

        # Check per-endpoint rate limit
        counters = self.endpoint_counters[endpoint_key]
        if client_id not in counters:
            config = self._get_limit_config(endpoint_key, is_internal)
            counters[client_id] = SlidingWindowCounter(
                window_seconds=config["window"],
                max_requests=config["max"],
            )
        endpoint_counter = counters[client_id]

        if not endpoint_counter.is_allowed():
            config = self._get_limit_config(endpoint_key, is_internal)
            backoff = endpoint_counter.exponential_backoff()
            self._log_rate_limit_event(client_id, endpoint_key, backoff)
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit exceeded for this endpoint. Max {config['max']} requests per {config['window']}s.",
                    "retry_after": int(backoff),
                    "backoff_seconds": round(backoff, 1),
                },
                headers={
                    "Retry-After": str(int(backoff)),
                    "X-RateLimit-Limit": str(config["max"]),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time() + backoff)),
                    "X-RateLimit-Backoff": str(round(backoff, 1)),
                },
            )

        # Return rate limit info for response headers
        config = self._get_limit_config(endpoint_key, is_internal)
        return {
            "X-RateLimit-Limit": str(config["max"]),
            "X-RateLimit-Remaining": str(endpoint_counter.remaining()),
            "X-RateLimit-Reset": str(int(time.time() + endpoint_counter.reset_after())),
        }

    def cleanup_stale(self, max_age: int = 600):
        """Remove stale counters older than max_age seconds."""
        now = time.time()
        # This is a simplified cleanup - in production use TTL-based stores like Redis
        stale_keys = []
        for key, counter in self.user_counters.items():
            if not counter.requests or (now - counter.requests[-1]) > max_age:
                stale_keys.append(key)
        for key in stale_keys:
            del self.user_counters[key]

    def get_stats(self) -> dict:
        """Get rate limiter statistics for monitoring."""
        return {
            "active_users": len(self.user_counters),
            "active_endpoint_keys": sum(len(counters) for counters in self.endpoint_counters.values()),
            "recent_events": len(self.rate_limit_events),
            "last_event": self.rate_limit_events[-1] if self.rate_limit_events else None,
        }


# Global rate limiter instance
rate_limiter = RateLimiter()
