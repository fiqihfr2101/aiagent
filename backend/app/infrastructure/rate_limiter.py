"""
Rate Limiter for H.E.R.M.E.S. AI Agent Orchestrator.

Sliding window rate limiting per-endpoint and per-user.
"""

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

    def is_allowed(self) -> bool:
        """Check if a request is allowed under the rate limit."""
        now = time.time()
        window_start = now - self.window_seconds

        # Remove old requests outside the window
        self.requests = [ts for ts in self.requests if ts > window_start]

        if len(self.requests) >= self.max_requests:
            return False

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


class RateLimiter:
    """
    Rate limiter with per-endpoint and per-user limits.

    Uses sliding window counters for accurate rate limiting.
    """

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

        # Default for unlisted endpoints
        "default": {"window": 60, "max": 60},
    }

    # Per-user global rate limit
    USER_GLOBAL_LIMIT = {"window": 60, "max": 300}  # 300 requests per minute

    def __init__(self):
        # Per-endpoint per-client counters: {endpoint_key: {client_id: SlidingWindowCounter}}
        self.endpoint_counters: dict[str, dict[str, SlidingWindowCounter]] = defaultdict(dict)
        # Per-user global counters: {user_id: SlidingWindowCounter}
        self.user_counters: dict[str, SlidingWindowCounter] = {}

    def _get_client_id(self, request: Request) -> str:
        """Extract client identifier from request."""
        # Try to get user from request state (set by auth middleware)
        user = getattr(request.state, "user", None)
        if user and user.get("username"):
            return f"user:{user['username']}"

        # Fall back to IP address
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return f"ip:{forwarded.split(',')[0].strip()}"
        return f"ip:{request.client.host if request.client else 'unknown'}"

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

    def _get_limit_config(self, endpoint_key: str) -> dict:
        """Get rate limit configuration for an endpoint."""
        return self.DEFAULT_LIMITS.get(endpoint_key, self.DEFAULT_LIMITS["default"])

    def check_rate_limit(self, request: Request) -> Optional[dict]:
        """
        Check if a request is allowed under rate limits.

        Returns None if allowed, or a dict with rate limit info for the response headers.
        Raises HTTPException if rate limited.
        """
        client_id = self._get_client_id(request)
        endpoint_key = self._get_endpoint_key(request)

        # Check per-user global rate limit
        if client_id not in self.user_counters:
            self.user_counters[client_id] = SlidingWindowCounter(
                window_seconds=self.USER_GLOBAL_LIMIT["window"],
                max_requests=self.USER_GLOBAL_LIMIT["max"],
            )
        user_counter = self.user_counters[client_id]

        if not user_counter.is_allowed():
            retry_after = user_counter.reset_after()
            logger.warning(
                "Rate limit exceeded for user %s (global limit: %d/%ds)",
                client_id, self.USER_GLOBAL_LIMIT["max"], self.USER_GLOBAL_LIMIT["window"],
            )
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests. Please try again later.",
                    "retry_after": int(retry_after),
                },
                headers={
                    "Retry-After": str(int(retry_after)),
                    "X-RateLimit-Limit": str(self.USER_GLOBAL_LIMIT["max"]),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time() + retry_after)),
                },
            )

        # Check per-endpoint rate limit
        counters = self.endpoint_counters[endpoint_key]
        if client_id not in counters:
            config = self._get_limit_config(endpoint_key)
            counters[client_id] = SlidingWindowCounter(
                window_seconds=config["window"],
                max_requests=config["max"],
            )
        endpoint_counter = counters[client_id]

        if not endpoint_counter.is_allowed():
            config = self._get_limit_config(endpoint_key)
            retry_after = endpoint_counter.reset_after()
            logger.warning(
                "Rate limit exceeded for %s on %s (%d/%ds)",
                client_id, endpoint_key, config["max"], config["window"],
            )
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit exceeded for this endpoint. Max {config['max']} requests per {config['window']}s.",
                    "retry_after": int(retry_after),
                },
                headers={
                    "Retry-After": str(int(retry_after)),
                    "X-RateLimit-Limit": str(config["max"]),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time() + retry_after)),
                },
            )

        # Return rate limit info for response headers
        config = self._get_limit_config(endpoint_key)
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


# Global rate limiter instance
rate_limiter = RateLimiter()
