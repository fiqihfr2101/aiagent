// ─── H.E.R.M.E.S. API Load Test ───────────────────────────────────
// k6 load test script for all major API endpoints
//
// Usage:
//   k6 run --env BASE_URL=http://localhost:8000 backend/tests/load/test_api_load.js
//   k6 run --env BASE_URL=http://localhost:8000 --env SCENARIO=peak backend/tests/load/test_api_load.js
//   k6 run --env BASE_URL=http://localhost:8000 --env SCENARIO=stress backend/tests/load/test_api_load.js

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import {
  BASE_URL,
  THRESHOLDS,
  NORMAL_LOAD_STAGES,
  PEAK_LOAD_STAGES,
  STRESS_TEST_STAGES,
  ENDPOINTS,
  DEFAULT_OPTIONS,
} from "./config.js";

// ─── Custom Metrics ────────────────────────────────────────────────
const agentRequests = new Counter("agent_requests");
const taskRequests = new Counter("task_requests");
const metricRequests = new Counter("metric_requests");
const notificationRequests = new Counter("notification_requests");
const errorRate = new Rate("custom_error_rate");
const agentDuration = new Trend("agent_endpoint_duration");
const taskDuration = new Trend("task_endpoint_duration");
const metricDuration = new Trend("metric_endpoint_duration");
const notificationDuration = new Trend("notification_endpoint_duration");

// ─── Select Scenario ───────────────────────────────────────────────
const scenario = __ENV.SCENARIO || "normal";

let stages;
let vusMax;
switch (scenario) {
  case "peak":
    stages = PEAK_LOAD_STAGES;
    vusMax = 550;
    break;
  case "stress":
    stages = STRESS_TEST_STAGES;
    vusMax = 1600;
    break;
  default:
    stages = NORMAL_LOAD_STAGES;
    vusMax = 120;
}

// ─── Options ───────────────────────────────────────────────────────
export const options = {
  ...DEFAULT_OPTIONS,
  stages: stages,
  thresholds: {
    ...THRESHOLDS,
    agent_endpoint_duration: ["p(95)<200", "avg<100"],
    task_endpoint_duration: ["p(95)<200", "avg<100"],
    metric_endpoint_duration: ["p(95)<200", "avg<100"],
    notification_endpoint_duration: ["p(95)<200", "avg<100"],
    custom_error_rate: ["rate<0.01"],
  },
};

// ─── Helper Functions ──────────────────────────────────────────────
function checkResponse(res, name, expectedStatus = 200) {
  const success = check(res, {
    [`${name} - status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${name} - response time < 200ms`]: (r) => r.timings.duration < 200,
    [`${name} - has body`]: (r) => r.body && r.body.length > 0,
  });
  errorRate.add(!success);
  return success;
}

function getHeaders() {
  return {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Request-ID": `load-${__VU}-${__ITER}-${Date.now()}`,
    },
  };
}

// ─── Test Scenarios ────────────────────────────────────────────────

function testHealthEndpoint() {
  const res = http.get(`${BASE_URL}${ENDPOINTS.health}`, getHeaders());
  checkResponse(res, "Health");
  return res;
}

function testAgentEndpoints() {
  const params = getHeaders();
  let agentId = null;

  group("Agent Endpoints", () => {
    // List agents
    group("GET /agents", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.listAgents}`, params);
      checkResponse(res, "List Agents");
      agentRequests.add(1);
      agentDuration.add(res.timings.duration);
    });

    // Create agent
    group("POST /agents", () => {
      const payload = JSON.stringify({
        name: `LoadTest-Agent-${__VU}-${__ITER}`,
        role: "researcher",
        model: "gpt-4",
      });
      const res = http.post(`${BASE_URL}${ENDPOINTS.createAgent}`, payload, params);
      checkResponse(res, "Create Agent", 200);
      agentRequests.add(1);
      agentDuration.add(res.timings.duration);

      if (res.status === 200) {
        try {
          const body = JSON.parse(res.body);
          agentId = body.id || body.agent_id;
        } catch (e) {
          // Response might not have an ID
        }
      }
    });

    // Get single agent (use a placeholder ID)
    group("GET /agents/:id", () => {
      const id = agentId || "test-agent-id";
      const res = http.get(`${BASE_URL}/agents/${id}`, params);
      check(res, {
        "Get Agent - status is 200 or 404": (r) =>
          r.status === 200 || r.status === 404,
      });
      agentRequests.add(1);
      agentDuration.add(res.timings.duration);
    });

    // List models
    group("GET /models", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.listModels}`, params);
      checkResponse(res, "List Models");
      agentRequests.add(1);
    });
  });
}

function testTaskEndpoints() {
  const params = getHeaders();

  group("Task Endpoints", () => {
    // List tasks
    group("GET /tasks", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.listTasks}`, params);
      checkResponse(res, "List Tasks");
      taskRequests.add(1);
      taskDuration.add(res.timings.duration);
    });

    // Task counts
    group("GET /tasks/counts", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.taskCounts}`, params);
      checkResponse(res, "Task Counts");
      taskRequests.add(1);
      taskDuration.add(res.timings.duration);
    });

    // Task history
    group("GET /tasks/history", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.taskHistory}`, params);
      checkResponse(res, "Task History");
      taskRequests.add(1);
      taskDuration.add(res.timings.duration);
    });

    // Get specific task
    group("GET /tasks/:id", () => {
      const res = http.get(`${BASE_URL}/tasks/test-task-id`, params);
      check(res, {
        "Get Task - status is 200 or 404": (r) =>
          r.status === 200 || r.status === 404,
      });
      taskRequests.add(1);
      taskDuration.add(res.timings.duration);
    });
  });
}

function testMetricsEndpoints() {
  const params = getHeaders();

  group("Metrics Endpoints", () => {
    // System metrics
    group("GET /metrics", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.getMetrics}`, params);
      checkResponse(res, "Get Metrics");
      metricRequests.add(1);
      metricDuration.add(res.timings.duration);
    });

    // Agent metrics
    group("GET /metrics/agents", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.agentMetrics}`, params);
      checkResponse(res, "Agent Metrics");
      metricRequests.add(1);
      metricDuration.add(res.timings.duration);
    });

    // System metrics detailed
    group("GET /metrics/system", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.systemMetrics}`, params);
      checkResponse(res, "System Metrics");
      metricRequests.add(1);
      metricDuration.add(res.timings.duration);
    });

    // Cost metrics
    group("GET /metrics/costs", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.costMetrics}`, params);
      checkResponse(res, "Cost Metrics");
      metricRequests.add(1);
      metricDuration.add(res.timings.duration);
    });

    // Daily costs
    group("GET /metrics/costs/daily", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.dailyCosts}`, params);
      checkResponse(res, "Daily Costs");
      metricRequests.add(1);
      metricDuration.add(res.timings.duration);
    });

    // Cost rates
    group("GET /metrics/costs/rates", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.costRates}`, params);
      checkResponse(res, "Cost Rates");
      metricRequests.add(1);
      metricDuration.add(res.timings.duration);
    });
  });
}

function testNotificationEndpoints() {
  const params = getHeaders();

  group("Notification Endpoints", () => {
    // List notifications
    group("GET /notifications", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.listNotifications}`, params);
      checkResponse(res, "List Notifications");
      notificationRequests.add(1);
      notificationDuration.add(res.timings.duration);
    });

    // Mark all as read
    group("POST /notifications/read-all", () => {
      const res = http.post(
        `${BASE_URL}${ENDPOINTS.markAllRead}`,
        JSON.stringify({}),
        params
      );
      check(res, {
        "Mark All Read - status is 200 or 204": (r) =>
          r.status === 200 || r.status === 204,
      });
      notificationRequests.add(1);
      notificationDuration.add(res.timings.duration);
    });
  });
}

function testLogEndpoints() {
  const params = getHeaders();

  group("Log Endpoints", () => {
    // List logs
    group("GET /logs", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.listLogs}`, params);
      checkResponse(res, "List Logs");
    });

    // Cache status
    group("GET /cache/status", () => {
      const res = http.get(`${BASE_URL}${ENDPOINTS.cacheStatus}`, params);
      checkResponse(res, "Cache Status");
    });
  });
}

// ─── Main Test Function ────────────────────────────────────────────
export default function () {
  // Test health first
  testHealthEndpoint();

  // Randomly select endpoint groups to simulate realistic usage
  const rand = Math.random();

  if (rand < 0.3) {
    // 30% - Agent operations (most common)
    testAgentEndpoints();
  } else if (rand < 0.55) {
    // 25% - Task operations
    testTaskEndpoints();
  } else if (rand < 0.75) {
    // 20% - Metrics queries
    testMetricsEndpoints();
  } else if (rand < 0.9) {
    // 15% - Notifications
    testNotificationEndpoints();
  } else {
    // 10% - Logs & cache
    testLogEndpoints();
  }

  // Think time between requests (realistic user behavior)
  sleep(Math.random() * 2 + 0.5); // 0.5 to 2.5 seconds
}

// ─── Setup & Teardown ──────────────────────────────────────────────
export function setup() {
  console.log(`\n🚀 H.E.R.M.E.S. Load Test - Scenario: ${scenario.toUpperCase()}`);
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Stages: ${stages.length}`);
  console.log(`   Max VUs: ${vusMax}\n`);

  // Verify API is reachable
  const res = http.get(`${BASE_URL}${ENDPOINTS.health}`);
  if (res.status !== 200) {
    console.error(`❌ API not reachable at ${BASE_URL} (status: ${res.status})`);
  } else {
    console.log(`✅ API is healthy at ${BASE_URL}`);
  }

  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = Math.round((Date.now() - data.startTime) / 1000);
  console.log(`\n✅ Load test completed in ${duration}s`);
}
