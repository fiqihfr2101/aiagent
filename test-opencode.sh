#!/bin/bash
# Test OpenCode API with correct URL

API_KEY=$(grep OPENCODE_API_KEY /c/Users/qoinj/Documents/Fiqih/AIAgent/.env.staging | cut -d'=' -f2)
API_URL="https://opencode.ai/zen/go/v1/chat/completions"

echo "Testing OpenCode API..."
echo "URL: $API_URL"
echo "Key: ${API_KEY:0:10}..."

response=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"model":"deepseek-v4-pro","messages":[{"role":"user","content":"Hello, respond with just hi"}],"max_tokens":50}')

echo "Response:"
echo "$response" | python -m json.tool 2>/dev/null || echo "$response"
