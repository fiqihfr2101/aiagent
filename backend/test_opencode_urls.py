import os, json, httpx

key = os.getenv("OPENCODE_API_KEY", "")

# Try various URL patterns
urls_to_try = [
    "https://api.opencode.ai/v1/chat/completions",
    "https://api.opencode.ai/chat/completions",
    "https://api.opencode.ai/v1/completions",
    "https://opencode.ai/api/v1/chat/completions",
    "https://api.opencode.ai/api/v1/chat/completions",
]

for url in urls_to_try:
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "minimax-m3",
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 10,
                },
            )
            body = resp.text[:100] if resp.text else "(empty)"
            print(f"  {resp.status_code} {url} -> {body}")
    except Exception as e:
        print(f"  ERR {url} -> {e}")
