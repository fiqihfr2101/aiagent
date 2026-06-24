import sys
try:
    import fastapi
    print("fastapi: OK")
except ImportError:
    print("fastapi: MISSING")
    sys.exit(1)
try:
    import uvicorn
    print("uvicorn: OK")
except ImportError:
    print("uvicorn: MISSING")
try:
    import redis.asyncio
    print("redis: OK")
except ImportError:
    print("redis: MISSING")
try:
    import httpx
    print("httpx: OK")
except ImportError:
    print("httpx: MISSING")
try:
    import pytest
    print("pytest: OK")
except ImportError:
    print("pytest: MISSING")
try:
    import pytest_asyncio
    print("pytest_asyncio: OK")
except ImportError:
    print("pytest_asyncio: MISSING")
print("All dependency checks done.")
