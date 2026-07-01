import json, subprocess, os

BASE = "https://staging-api-orc.routex.web.id"

# Get token
resp = subprocess.run(
    ["curl", "-s", "-X", "POST", f"{BASE}/auth/login",
     "-H", "Content-Type: application/json",
     "-d", '{"username":"fiqih","password":"sandeyga83"}'],
    capture_output=True, text=True
)
data = json.loads(resp.stdout)
token = data["access_token"]
os.environ["STAGING_TOKEN"] = token
print("Token obtained successfully")

def curl_code(path, use_token=False):
    cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}"]
    if use_token:
        cmd += ["-H", "Authorization: Bearer " + os.environ.get("STAGING_TOKEN", "")]
    cmd.append(f"{BASE}{path}")
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.stdout.strip()

def curl_post(path, body, use_token=False):
    hdrs = ["-H", "Content-Type: application/json"]
    if use_token:
        hdrs += ["-H", "Authorization: Bearer " + os.environ.get("STAGING_TOKEN", "")]
    cmd = ["curl", "-s", "-X", "POST", f"{BASE}{path}"] + hdrs + ["-d", json.dumps(body)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.stdout

print()
print("=== AUTH MIDDLEWARE TESTS ===")
for path in ["/agents", "/tasks", "/notifications", "/metrics", "/logs", "/plugins", "/workflows", "/templates", "/roles", "/models"]:
    code = curl_code(path)
    status = "PASS" if code == "401" else "FAIL"
    print(f"  GET {path} without auth: {code} [{status}]")

print()
code = curl_code("/health")
status = "PASS" if code == "200" else "FAIL"
print(f"  GET /health without auth: {code} [{status}] (public endpoint)")

code = curl_code("/agents", True)
status = "PASS" if code == "200" else "FAIL"
print(f"  GET /agents with auth: {code} [{status}]")

code = curl_code("/tasks", True)
status = "PASS" if code == "200" else "FAIL"
print(f"  GET /tasks with auth: {code} [{status}]")

code = curl_code("/roles", True)
status = "PASS" if code == "200" else "FAIL"
print(f"  GET /roles with auth: {code} [{status}]")

print()
print("=== ROLE VALIDATION TESTS ===")

# Invalid role_id
result = curl_post("/agents", {"name": "TEST", "role_id": "badrole_xyz", "model": "mimo-v2.5-pro"}, True)
try:
    rdata = json.loads(result)
    has_error = "detail" in rdata or "error" in rdata
    status = "PASS" if has_error else "FAIL"
    print(f"  POST /agents with invalid role_id: {status}")
    print(f"    Response: {json.dumps(rdata)[:200]}")
except Exception:
    print(f"  POST /agents with invalid role_id: FAIL (not JSON)")
    print(f"    Response: {result[:200]}")

# Valid role_id
result2 = curl_post("/agents", {"name": "QA Test Agent", "role_id": "backend_engineer", "model": "mimo-v2.5-pro"}, True)
try:
    rdata2 = json.loads(result2)
    has_id = "id" in rdata2
    status = "PASS" if has_id else "FAIL"
    print(f"  POST /agents with valid role_id: {status}")
    print(f"    Response: {json.dumps(rdata2)[:200]}")
except Exception:
    print(f"  POST /agents with valid role_id: FAIL (not JSON)")
    print(f"    Response: {result2[:200]}")

print()
print("=== ALL TESTS COMPLETE ===")
