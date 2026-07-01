import os, json, httpx

key = os.getenv("OPENCODE_API_KEY", "")
url = os.getenv("OPENCODE_API_URL", "")
print(f"URL: {url}")
print(f"Key set: {bool(key)}, length: {len(key)}")

endpoint = f"{url}/chat/completions"
print(f"Testing: {endpoint}")

try:
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "minimax-m3",
                "messages": [{"role": "user", "content": "Say hello"}],
                "max_tokens": 20,
            },
        )
        print(f"HTTP Status: {resp.status_code}")
        print(f"Headers: {dict(resp.headers)}")
        print(f"Body ({len(resp.text)} bytes): {resp.text[:500]}")
        
        if resp.status_code == 200 and resp.text.strip():
            try:
                data = resp.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                print(f"LLM Response: {content[:200]}")
            except:
                print("Response is not valid JSON")
except Exception as e:
    print(f"Error: {e}")
