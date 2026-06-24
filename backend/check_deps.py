try:
    import fastapi; print("fastapi OK")
except ImportError:
    print("fastapi MISSING")
try:
    import temporalio; print("temporalio OK")
except ImportError:
    print("temporalio MISSING")
try:
    import uvicorn; print("uvicorn OK")
except ImportError:
    print("uvicorn MISSING")
try:
    import httpx; print("httpx OK")
except ImportError:
    print("httpx MISSING")
try:
    import dotenv; print("dotenv OK")
except ImportError:
    print("dotenv MISSING")
