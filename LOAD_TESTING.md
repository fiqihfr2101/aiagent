# H.E.R.M.E.S. Load Testing Guide

## Overview

This document describes the load testing infrastructure for the H.E.R.M.E.S. AI Agent Orchestrator. Load tests validate that the system meets performance requirements under various traffic conditions.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Backend Load Tests (k6)](#backend-load-tests-k6)
- [Frontend Performance Tests (Lighthouse CI)](#frontend-performance-tests-lighthouse-ci)
- [Test Scenarios](#test-scenarios)
- [Interpreting Results](#interpreting-results)
- [Performance Benchmarks](#performance-benchmarks)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Backend (k6)

Install k6:
```bash
# macOS
brew install k6

# Windows (Chocolatey)
choco install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### Frontend (Lighthouse CI)

```bash
npm install -g @lhci/cli
# or
npx @lhci/cli --version
```

---

## Backend Load Tests (k6)

### Running Tests

#### API Load Test

```bash
# Normal load (100 concurrent users)
k6 run --env BASE_URL=http://localhost:8000 backend/tests/load/test_api_load.js

# Peak load (500 concurrent users)
k6 run --env BASE_URL=http://localhost:8000 --env SCENARIO=peak backend/tests/load/test_api_load.js

# Stress test (1000+ concurrent users)
k6 run --env BASE_URL=http://localhost:8000 --env SCENARIO=stress backend/tests/load/test_api_load.js
```

#### WebSocket Load Test

```bash
# Normal WebSocket load
k6 run --env WS_URL=ws://localhost:8000/ws backend/tests/load/test_websocket_load.js

# Peak WebSocket load
k6 run --env WS_URL=ws://localhost:8000/ws --env SCENARIO=peak backend/tests/load/test_websocket_load.js

# Stress WebSocket test
k6 run --env WS_URL=ws://localhost:8000/ws --env SCENARIO=stress backend/tests/load/test_websocket_load.js
```

#### Custom Configuration

Override base URL and WebSocket URL:
```bash
k6 run \
  --env BASE_URL=https://api.example.com \
  --env WS_URL=wss://api.example.com/ws \
  --env SCENARIO=peak \
  backend/tests/load/test_api_load.js
```

### Exporting Results

```bash
# JSON output
k6 run --out json=results.json backend/tests/load/test_api_load.js

# InfluxDB output
k6 run --out influxdb=http://localhost:8086/k6 backend/tests/load/test_api_load.js

# CSV summary
k6 run --summary-export=summary.csv backend/tests/load/test_api_load.js
```

---

## Frontend Performance Tests (Lighthouse CI)

### Running Lighthouse

```bash
# Start the frontend dev server
cd frontend && npm run dev

# Run Lighthouse CI
npx lhci autorun --config=frontend/tests/load/lighthouse.config.js
```

### Manual Lighthouse (Chrome DevTools)

1. Open Chrome DevTools (F12)
2. Go to "Lighthouse" tab
3. Select "Performance" and "Accessibility"
4. Click "Analyze page load"

---

## Test Scenarios

### Backend API Load Test

| Scenario | Users | Duration | Description |
|----------|-------|----------|-------------|
| Normal   | 100   | ~4 min   | Typical daily traffic |
| Peak     | 500   | ~5 min   | High-traffic events |
| Stress   | 1500  | ~6 min   | Breaking point test |

**Endpoints Tested:**
- `GET /health` - Health check
- `GET /agents` - List agents
- `POST /agents` - Create agent
- `GET /tasks` - List tasks
- `GET /tasks/counts` - Task statistics
- `GET /tasks/history` - Task history
- `GET /metrics` - System metrics
- `GET /metrics/agents` - Agent metrics
- `GET /metrics/costs` - Cost metrics
- `GET /notifications` - Notifications
- `GET /logs` - Logs
- `GET /cache/status` - Cache status
- `GET /models` - Available models

### WebSocket Load Test

| Scenario | Connections | Duration | Description |
|----------|-------------|----------|-------------|
| Normal   | 100         | ~4 min   | Standard WS traffic |
| Peak     | 500         | ~5 min   | High WS concurrency |
| Stress   | 1500        | ~6 min   | WS breaking point |

**Tests Include:**
- Connection establishment
- Channel subscription (agents, tasks, metrics, notifications, system)
- Message throughput
- Ping/pong latency measurement
- Reconnection resilience

---

## Interpreting Results

### Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `http_req_duration` | Response time per request | p95 < 200ms |
| `http_req_failed` | Failed request rate | < 1% |
| `http_reqs` | Requests per second | > 50 req/s |
| `ws_connection_time` | WebSocket connect time | p95 < 1000ms |
| `ws_message_latency` | WS round-trip latency | p95 < 100ms |
| `ws_error_rate` | WS connection error rate | < 1% |

### Sample Output

```
     ✓ Health - status is 200
     ✓ Health - response time < 200ms
     ✓ List Agents - status is 200
     ✗ Create Agent - status is 200
       ↳ 45% — Status is 429

     http_req_duration..............: avg=45.2ms  min=12.1ms med=38.5ms max=892.3ms p(90)=89.2ms p(95)=142.5ms
     http_req_failed................: 0.12%  ✓ 1234   ✗ 1
     http_reqs......................: 1235   51.234/s
```

### Reading the Results

1. **Check thresholds**: All thresholds should pass (shown as ✓)
2. **Review percentiles**: p95 is more meaningful than avg for user experience
3. **Watch error rates**: Any errors above 1% indicate a problem
4. **Monitor throughput**: Should remain stable under load

### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| High p95 latency | p95 > 200ms | Check DB queries, add caching |
| High error rate | > 1% failed | Check rate limits, connection pools |
| Low throughput | < 50 req/s | Scale workers, optimize hot paths |
| WS disconnections | High ws_error_rate | Check heartbeat, increase timeouts |

---

## Performance Benchmarks

### Target SLAs

| Metric | SLA | Measurement |
|--------|-----|-------------|
| API Response Time (p95) | < 200ms | k6 `http_req_duration` |
| API Error Rate | < 1% | k6 `http_req_failed` |
| API Throughput | > 50 req/s | k6 `http_reqs` |
| WS Connection Time (p95) | < 1000ms | k6 `ws_connection_time` |
| WS Message Latency (p95) | < 100ms | k6 `ws_message_latency` |
| Lighthouse Performance Score | > 90 | Lighthouse CI |
| Lighthouse Accessibility Score | > 95 | Lighthouse CI |
| Largest Contentful Paint | < 2.5s | Core Web Vitals |
| Total Blocking Time | < 200ms | Core Web Vitals |
| Cumulative Layout Shift | < 0.1 | Core Web Vitals |
| Total Page Weight | < 1.5MB | Resource budget |

### Baseline Performance (Run After Deployment)

After initial deployment, run the normal load test and record baseline metrics:

```
Date: YYYY-MM-DD
Scenario: Normal (100 users)
────────────────────────────────────────
http_req_duration (avg):    ___ms
http_req_duration (p95):    ___ms
http_req_failed:            ___%
http_reqs:                  ___/s
ws_connection_time (avg):   ___ms
ws_message_latency (p95):   ___ms
────────────────────────────────────────
```

---

## Troubleshooting

### k6 Installation Issues

```bash
# Verify installation
k6 version

# If k6 is not found, add to PATH or reinstall
```

### Connection Refused

```bash
# Ensure the backend is running
curl http://localhost:8000/health

# Check Docker containers
docker-compose ps
```

### Rate Limiting

If you see 429 responses, the rate limiter is active. Either:
1. Increase rate limits in the backend
2. Reduce test load
3. Add API keys for authenticated access

### WebSocket Connection Failures

```bash
# Test WebSocket manually
wscat -c ws://localhost:8000/ws

# Check if WS endpoint is accessible
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  http://localhost:8000/ws
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Load Tests
on:
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday at 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/k6-action@v0.3.1
        with:
          filename: backend/tests/load/test_api_load.js
          flags: --env BASE_URL=${{ secrets.API_URL }}
```

---

## File Structure

```
├── backend/tests/load/
│   ├── config.js                    # Shared configuration
│   ├── test_api_load.js             # API endpoint load tests
│   └── test_websocket_load.js       # WebSocket load tests
├── frontend/tests/load/
│   └── lighthouse.config.js         # Lighthouse CI configuration
└── LOAD_TESTING.md                  # This file
```
