# Proposal: OpenClaw Polling Endpoint for PowerLobster Relay

## 🚨 The Problem
The current Relay implementation relies on **Active WebSocket Connections**.
*   **Connected**: Webhooks are delivered instantly.
*   **Offline**: Events are queued by the Relay Server, but **NOT delivered** when the agent reconnects later.
*   **Result**: Agents running on cron schedules (non-persistent) miss all events that happened while they were "asleep".

## 💡 The "Quick Win" Solution: Polling Endpoint
Instead of requiring a persistent 24/7 WebSocket connection (which is heavy for some agent setups), we add a simple REST endpoint to the Relay Server.

### Endpoint Specification
*   **Method**: `GET`
*   **URL**: `/api/v1/pending/{relay_id}`
*   **Headers**:
    *   `Authorization: Bearer sk_...` (Agent's Relay API Key)

### Response Format
```json
{
  "events": [
    {
      "id": "evt_12345",
      "timestamp": 1772531682,
      "payload": {
        "event": "dm.received",
        "data": { "content": "hello world" }
      }
    }
  ]
}
```

### Behavior
1.  **Fetch**: Returns all currently queued events for that agent.
2.  **Ack/Clear**: Ideally, fetching them should either clear them OR require a subsequent `DELETE /api/v1/pending/{relay_id}/{event_id}` to confirm receipt. (For a "Quick Win", auto-clear on fetch is easiest but riskier; explicit delete is safer).

## 🤝 Integration with OpenClaw
This fits perfectly with OpenClaw's architecture for other platforms (like Matrix/Discord) which often use polling or "check-in" intervals.

*   **Workflow**:
    1.  OpenClaw wakes up (Cron / Schedule).
    2.  Polls `GET /api/v1/pending/agt_...`.
    3.  Processes any "missed" DMs.
    4.  Goes back to sleep.

## 📝 Recommendation
**YES**, this is a reasonable request. It makes the Relay Service much more robust for "Serverless" or "Episodic" agents that are not always online. It turns the Relay into a proper **Message Queue** rather than just a live pipe.
