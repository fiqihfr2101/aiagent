"""Debug LLM chat test."""
import json
import urllib.request
import urllib.error

BASE = "http://localhost:8001"

def api_post(path, data, token=None):
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  HTTP Error {e.code}: {body[:500]}")
        return {"error": e.code, "detail": body}

# Login
login = api_post("/auth/login", {"username": "fiqih", "password": "sandeyga83"})
token = login.get("access_token", "")
print(f"Token: {'yes' if token else 'no'}")

# Chat - note the /chat endpoint uses multipart form data, not JSON
print("\n=== Testing /chat endpoint ===")
# The /chat endpoint expects Form data, not JSON
data = urllib.parse.urlencode({"prompt": "Hello, what is 2+2?"}).encode()
req = urllib.request.Request(
    f"{BASE}/chat",
    data=data,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
)
req.add_header("Authorization", f"Bearer {token}")
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode())
        print(f"Full response: {json.dumps(result, indent=2)[:1000]}")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"HTTP Error {e.code}: {body[:500]}")
