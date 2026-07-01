"""Test script for CDC API endpoints and LLM integration."""
import json
import urllib.request
import urllib.error

BASE = "http://localhost:8001"

def api_post(path, data, token=None):
    """POST JSON request."""
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "detail": e.read().decode()}

def api_get(path, token=None):
    """GET request."""
    req = urllib.request.Request(f"{BASE}{path}")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "detail": e.read().decode()}


print("=" * 60)
print("TEST 1: Health check")
print("=" * 60)
result = api_get("/health")
print(f"  Status: {result}")
print()

print("=" * 60)
print("TEST 2: CDC Status (public endpoint)")
print("=" * 60)
result = api_get("/cdc/status")
print(f"  Poller running: {result.get('poller_running')}")
print(f"  Current seq: {result.get('current_seq')}")
print(f"  Max seq in DB: {result.get('max_seq_in_db')}")
print(f"  Subscribers: {result.get('subscribers')}")
print(f"  Total entries: {result.get('total_entries')}")
print(f"  Change log exists: {result.get('change_log_exists')}")
print(f"  Tracked tables: {result.get('tracked_tables')}")
print(f"  Error: {result.get('error', 'None')}")
poller_ok = result.get("poller_running") and result.get("change_log_exists")
print(f"  RESULT: {'PASS' if poller_ok else 'FAIL'}")
print()

print("=" * 60)
print("TEST 3: Login to get auth token")
print("=" * 60)
login = api_post("/auth/login", {"username": "fiqih", "password": "sandeyga83"})
token = login.get("access_token", "")
print(f"  Token obtained: {'yes' if token else 'NO'}")
print()

if not token:
    print("  Cannot proceed without token!")
    exit(1)

print("=" * 60)
print("TEST 4: CDC Changes (authenticated)")
print("=" * 60)
result = api_get("/cdc/changes", token=token)
print(f"  Total: {result.get('total')}")
print(f"  Changes count: {len(result.get('changes', []))}")
print(f"  Has more: {result.get('has_more')}")
if result.get("changes"):
    print(f"  First change: seq={result['changes'][0]['seq']}, table={result['changes'][0]['table']}, op={result['changes'][0]['operation']}")
print(f"  RESULT: {'PASS' if 'changes' in result else 'FAIL'}")
print()

print("=" * 60)
print("TEST 5: CDC Changes filtered by table")
print("=" * 60)
result = api_get("/cdc/changes?table=agents&limit=2", token=token)
print(f"  Total agents changes: {result.get('total')}")
print(f"  Returned: {len(result.get('changes', []))}")
print(f"  RESULT: {'PASS' if 'changes' in result else 'FAIL'}")
print()

print("=" * 60)
print("TEST 6: CDC Changes - non-existent table")
print("=" * 60)
result = api_get("/cdc/changes?table=nonexistent", token=token)
print(f"  Total: {result.get('total')}")
print(f"  Changes: {len(result.get('changes', []))}")
print(f"  RESULT: {'PASS' if result.get('total') == 0 else 'FAIL'}")
print()

print("=" * 60)
print("TEST 7: LLM Chat integration test")
print("=" * 60)
result = api_post(
    "/chat",
    {"prompt": "Hello, what is 2+2?"},
    token=token,
)
print(f"  Agent: {result.get('agent_name')}")
response_text = result.get("response", "")
print(f"  Response preview: {response_text[:200]}")
# Check if response is from LLM (not fallback)
is_fallback = "LLM service encountered an error" in response_text
is_llm = not is_fallback and len(response_text) > 10
print(f"  Is LLM response: {is_llm}")
print(f"  Is fallback: {is_fallback}")
print(f"  RESULT: {'PASS' if is_llm else 'FAIL (fallback or error)'}")
print()

print("=" * 60)
print("ALL TESTS COMPLETE")
print("=" * 60)
