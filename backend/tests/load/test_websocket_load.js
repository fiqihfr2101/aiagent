// ─── H.E.R.M.E.S. WebSocket Load Test ─────────────────────────────
// k6 load test for WebSocket connections, throughput, and resilience
//
// Usage:
//   k6 run --env WS_URL=ws://localhost:8000/ws backend/tests/load/test_websocket_load.js
//   k6 run --env WS_URL=ws://localhost:8000/ws --env SCENARIO=stress backend/tests/load/test_websocket_load.js

import ws from "k6/ws";
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import {
  WS_URL,
  BASE_URL,
  NORMAL_LOAD_STAGES,
  PEAK_LOAD_STAGES,
  STRESS_TEST_STAGES,
} from "./config.js";

// ─── Custom Metrics ────────────────────────────────────────────────
const wsConnections = new Counter("ws_connections");
const wsMessages = new Counter("ws_messages_sent");
const wsMessagesReceived = new Counter("ws_messages_received");
const wsErrors = new Counter("ws_errors");
const wsReconnects = new Counter("ws_reconnects");
const wsConnectionTime = new Trend("ws_connection_time");
const wsMessageLatency = new Trend("ws_message_latency");
const wsErrorRate = new Rate("ws_error_rate");

// ─── Select Scenario ───────────────────────────────────────────────
const scenario = __ENV.SCENARIO || "normal";

let stages;
switch (scenario) {
  case "peak":
    stages = PEAK_LOAD_STAGES;
    break;
  case "stress":
    stages = STRESS_TEST_STAGES;
    break;
  default:
    stages = NORMAL_LOAD_STAGES;
}

// ─── Options ───────────────────────────────────────────────────────
export const options = {
  stages: stages,
  thresholds: {
    ws_connection_time: ["p(95)<1000", "avg<500"],
    ws_message_latency: ["p(95)<100", "avg<50"],
    ws_error_rate: ["rate<0.01"],
    ws_connections: ["count>0"],
    ws_messages_received: ["count>0"],
  },
};

// ─── WebSocket Channel Tests ───────────────────────────────────────
const CHANNELS = ["agents", "tasks", "metrics", "notifications", "system"];

function getRandomChannel() {
  return CHANNELS[Math.floor(Math.random() * CHANNELS.length)];
}

// ─── Connection Test ───────────────────────────────────────────────
function testWebSocketConnection(url) {
  const connectStart = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    const connectTime = Date.now() - connectStart;
    wsConnectionTime.add(connectTime);
    wsConnections.add(1);

    socket.on("open", function () {
      // Subscribe to a random channel
      const channel = getRandomChannel();
      const subscribeMsg = JSON.stringify({
        type: "subscribe",
        channel: channel,
      });
      socket.send(subscribeMsg);
      wsMessages.add(1);

      // Send periodic pings to measure latency
      const pingInterval = setInterval(function () {
        const pingTime = Date.now();
        socket.send(
          JSON.stringify({
            type: "ping",
            timestamp: pingTime,
          })
        );
        wsMessages.add(1);
      }, 2000); // Ping every 2 seconds

      // Close after a random duration (10-30 seconds)
      const duration = Math.random() * 20000 + 10000;
      setTimeout(function () {
        clearInterval(pingInterval);
        socket.close();
      }, duration);
    });

    socket.on("message", function (data) {
      wsMessagesReceived.add(1);

      try {
        const msg = JSON.parse(data);
        if (msg.type === "pong" && msg.timestamp) {
          const latency = Date.now() - msg.timestamp;
          wsMessageLatency.add(latency);
        }
      } catch (e) {
        // Non-JSON message
      }
    });

    socket.on("close", function () {
      // Connection closed normally
    });

    socket.on("error", function (e) {
      wsErrors.add(1);
      wsErrorRate.add(1);
    });
  });

  check(res, {
    "WebSocket connection successful": (r) => r && r.status === 101,
  });
}

// ─── Reconnection Test ─────────────────────────────────────────────
function testWebSocketReconnection(url) {
  let reconnectCount = 0;
  const maxReconnects = 3;

  function connect() {
    if (reconnectCount >= maxReconnects) return;

    const res = ws.connect(url, {}, function (socket) {
      wsConnections.add(1);

      socket.on("open", function () {
        // Subscribe
        socket.send(
          JSON.stringify({
            type: "subscribe",
            channel: "system",
          })
        );
        wsMessages.add(1);
      });

      socket.on("message", function (data) {
        wsMessagesReceived.add(1);
      });

      socket.on("close", function () {
        // Simulate reconnection
        reconnectCount++;
        wsReconnects.add(1);
        sleep(1); // Wait before reconnecting
        connect();
      });

      socket.on("error", function (e) {
        wsErrors.add(1);
        wsErrorRate.add(1);
      });

      // Force close after 5 seconds to trigger reconnection
      setTimeout(function () {
        socket.close();
      }, 5000);
    });

    check(res, {
      [`Reconnection ${reconnectCount} successful`]: (r) =>
        r && r.status === 101,
    });
  }

  connect();
}

// ─── Message Throughput Test ───────────────────────────────────────
function testMessageThroughput(url) {
  const res = ws.connect(url, {}, function (socket) {
    wsConnections.add(1);
    let messagesSent = 0;
    const maxMessages = 20;

    socket.on("open", function () {
      // Subscribe to channels
      socket.send(
        JSON.stringify({
          type: "subscribe",
          channel: "metrics",
        })
      );

      // Send burst of messages
      const sendInterval = setInterval(function () {
        if (messagesSent >= maxMessages) {
          clearInterval(sendInterval);
          setTimeout(function () {
            socket.close();
          }, 2000); // Wait for responses before closing
          return;
        }

        socket.send(
          JSON.stringify({
            type: "message",
            channel: "metrics",
            data: { test: true, seq: messagesSent },
            timestamp: Date.now(),
          })
        );
        wsMessages.add(1);
        messagesSent++;
      }, 100); // Send every 100ms
    });

    socket.on("message", function (data) {
      wsMessagesReceived.add(1);
    });

    socket.on("error", function (e) {
      wsErrors.add(1);
      wsErrorRate.add(1);
    });
  });

  check(res, {
    "Throughput test connection successful": (r) => r && r.status === 101,
  });
}

// ─── Channel Subscription Test ─────────────────────────────────────
function testChannelSubscriptions(url) {
  const res = ws.connect(url, {}, function (socket) {
    wsConnections.add(1);
    let subscribed = 0;

    socket.on("open", function () {
      // Subscribe to all channels
      CHANNELS.forEach(function (channel) {
        socket.send(
          JSON.stringify({
            type: "subscribe",
            channel: channel,
          })
        );
        wsMessages.add(1);
        subscribed++;
      });

      // Close after 8 seconds
      setTimeout(function () {
        socket.close();
      }, 8000);
    });

    socket.on("message", function (data) {
      wsMessagesReceived.add(1);
    });

    socket.on("error", function (e) {
      wsErrors.add(1);
      wsErrorRate.add(1);
    });
  });

  check(res, {
    "Channel subscription test connection successful": (r) =>
      r && r.status === 101,
  });
}

// ─── Main Test Function ────────────────────────────────────────────
export default function () {
  const rand = Math.random();

  if (rand < 0.4) {
    // 40% - Basic connection test
    testWebSocketConnection(WS_URL);
  } else if (rand < 0.6) {
    // 20% - Reconnection test
    testWebSocketReconnection(WS_URL);
  } else if (rand < 0.8) {
    // 20% - Message throughput test
    testMessageThroughput(WS_URL);
  } else {
    // 20% - Channel subscription test
    testChannelSubscriptions(WS_URL);
  }

  sleep(Math.random() * 2 + 1); // 1-3 seconds between connections
}

// ─── Setup & Teardown ──────────────────────────────────────────────
export function setup() {
  console.log(`\n🔌 H.E.R.M.E.S. WebSocket Load Test - Scenario: ${scenario.toUpperCase()}`);
  console.log(`   WebSocket URL: ${WS_URL}`);
  console.log(`   Stages: ${stages.length}\n`);

  // Verify HTTP API is reachable
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    console.error(`❌ API not reachable at ${BASE_URL} (status: ${res.status})`);
  } else {
    console.log(`✅ API is healthy`);
  }

  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = Math.round((Date.now() - data.startTime) / 1000);
  console.log(`\n✅ WebSocket load test completed in ${duration}s`);
}
